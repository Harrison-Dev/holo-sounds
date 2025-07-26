# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend Development
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn[standard] yt-dlp aiofiles python-multipart

# Run backend development server
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8080

# Run with Docker
docker build -t holo-sounds .
docker run -p 8080:8080 holo-sounds
```

### Frontend Development
```bash
# Install dependencies
cd frontend && npm install

# Run development server
npm run dev

# Build for production
npm run build
```

### Deployment
```bash
# Deploy to Google Cloud Run
gcloud run deploy ytaudio-worker \
  --source . \
  --platform managed \
  --region asia-east1 \
  --allow-unauthenticated \
  --concurrency 1 \
  --memory 512Mi \
  --max-instances 3
```

## Architecture Overview

This is a web application for downloading YouTube audio, editing it (trim, fade, denoise), and exporting as .ogg files.

### Key Components

1. **Frontend (React + Vite)**
   - Wavesurfer.js for waveform visualization and region selection
   - Web Audio API for real-time preview of fade effects
   - Async polling for download status

2. **Backend (FastAPI)**
   - Async task queue using asyncio.Queue (single-concurrency per instance)
   - yt-dlp subprocess for YouTube audio extraction
   - FFmpeg subprocess for audio processing (trim, fade, denoise)
   - Temporary file storage in /tmp (cleaned automatically)

3. **Audio Processing Pipeline**
   - Download: YouTube URL → yt-dlp → .m4a file
   - Process: .m4a → FFmpeg (trim, afade, afftdn/arnndn) → .ogg
   - Filters applied in sequence: trim → denoise → fade_in → fade_out

### API Flow
1. `POST /download` → Returns task_id, queues download
2. `GET /status/{task_id}` → Poll until state="ready"
3. `POST /process` → Submit editing parameters, receive .ogg file

### Important Implementation Notes

- **Concurrency**: Set to 1 per Cloud Run instance to prevent resource contention
- **File Management**: All files stored in /tmp/{task_id}/ for automatic cleanup
- **Error Handling**: yt-dlp and FFmpeg errors should be caught and returned as API errors
- **CORS**: Enable for frontend-backend communication
- **Streaming**: Use FileResponse for large audio files

---

# YouTube 音訊剪輯與轉檔 Web 工具規格

## 0. 專案目的
- **單貼網址 → 下載音訊 → 線上剪輯/降噪/淡出 → 匯出 .ogg**  
- 面向個人與 ≤5 人小團隊；UI 簡潔、可多人同時使用  
- 部署目標：Google Cloud Run（免費額度即可）

---

## 1. 技術棧

| 類別 | 選擇 | 備註 |
| --- | --- | --- |
| 前端 SPA | React + Vite | 任意改用 Vue/Svelte 亦可 |
| 波形/剪輯 UI | **Wavesurfer.js** + Regions plug-in | 提供拖曳裁切 |
| 即時效果預聽 | Web Audio API (GainNode / BiquadFilterNode) | 預覽淡入淡出與簡單濾波降噪 |
| 後端 API | **FastAPI (Python 3.12)** | 型別註解佳、ASGI 原生 |
| 下載工具 | **yt-dlp** | 以 CLI 呼叫 |
| 音訊處理 | **FFmpeg** (裁切 / afade / afftdn) | 降噪可先用 `arnndn`，之後再行優化 |
| 佇列 | in-memory asyncio.Queue + concurrency=1 | 同機同時只跑一條任務；Cloud Run 自動水平擴充 |
| 認證 | Cloud IAP 或簡單 Basic Auth | 視部署選擇 |
| 映像 | Ubuntu 22.04 + Python base image | 容器層安裝 yt-dlp、ffmpeg |

---

## 2. 系統流程

```mermaid
graph LR
  A[前端提交 YouTube URL] --> B(/download API/)
  B --> C{yt-dlp 抽音}
  C --> D{產生 .m4a}
  D --> E[前端載入波形<br/>Wavesurfer]
  E --> F[/process API/ 傳剪輯參數]
  F --> G{FFmpeg 裁切+降噪+afade}
  G --> H[輸出 .ogg 至 /tmp]
  H --> I[回傳檔案串流 or GCS URL]
````

---

## 3. API 介面

| 方法     | 路徑                  | 請求 JSON / Query                                                                                      | 回應                                            | 說明          |       |            |      |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------- | ----- | ---------- | ---- |
| `POST` | `/download`         | `{ "url": "<YouTube URL>" }`                                                                         | `{ "task_id": "uuid" }`                       | 啟動下載；非同步    |       |            |      |
| `GET`  | `/status/{task_id}` | –                                                                                                    | \`{ "state": "queued                          | downloading | ready | error" }\` | 輪詢進度 |
| `POST` | `/process`          | `{ "task_id": "...", "start": 12.5, "end": 37.8, "fade_in": 1.0, "fade_out": 2.0, "denoise": true }` | 直接串流 `.ogg` (Content-Disposition: attachment) | 處理並回傳結果     |       |            |      |

> **時限**：單支音訊處理時間通常 < 2 min；Cloud Run timeout 設 15 min 充足。

---

## 4. Dockerfile（簡版）

```dockerfile
FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y ffmpeg && \
    pip install --no-cache-dir yt-dlp fastapi uvicorn[standard]

# App
WORKDIR /app
COPY . /app

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

---

## 5. 重要程式片段

### 5.1 下載任務（download\_worker.py）

```python
import asyncio, subprocess, uuid, pathlib

QUEUE = asyncio.Queue()

async def download_worker():
    while True:
        task = await QUEUE.get()
        url, tmp_dir = task["url"], pathlib.Path("/tmp") / task["task_id"]
        tmp_dir.mkdir(exist_ok=True)
        cmd = ["yt-dlp", "-x", "--audio-format", "m4a", "-o",
               f"{tmp_dir}/audio.%(ext)s", url]
        proc = await asyncio.create_subprocess_exec(*cmd)
        await proc.communicate()
        task["state"] = "ready" if proc.returncode == 0 else "error"
        QUEUE.task_done()
```

### 5.2 處理 API（process\_handler.py）

```python
import subprocess, uuid, pathlib, fastapi, io

router = fastapi.APIRouter()

@router.post("/process")
async def process_audio(req: ProcessRequest):
    tmp_dir = pathlib.Path("/tmp") / req.task_id
    src = tmp_dir / "audio.m4a"
    out = tmp_dir / f"{uuid.uuid4()}.ogg"

    filters = [f"atrim=start={req.start}:end={req.end}", "asetpts=PTS-STARTPTS"]
    if req.denoise:
        filters.append("afftdn")  # or arnndn model
    filters.append(f"afade=t=in:st=0:d={req.fade_in}")
    filters.append(f"afade=t=out:st={req.end - req.fade_out}:d={req.fade_out}")
    ffmpeg_cmd = ["ffmpeg", "-y", "-i", str(src),
                  "-af", ",".join(filters),
                  "-c:a", "libvorbis", str(out)]
    subprocess.run(ffmpeg_cmd, check=True)

    return fastapi.responses.FileResponse(out, media_type="audio/ogg",
                                          filename="clip.ogg")
```

---

## 6. 部署指令範例

```bash
gcloud run deploy ytaudio-worker \
  --source . \
  --platform managed \
  --region asia-east1 \
  --allow-unauthenticated \
  --concurrency 1 \
  --memory 512Mi \
  --max-instances 3
```

---

## 7. TODO Roadmap

1. **v0.1** – DL + 裁切 + 淡出 + 匯出 .ogg，無登入
2. **v0.2** – Wavesurfer 波形 UI + Regions 選取
3. **v0.3** – 降噪 (afftdn → arnndn 模型) + 下載佇列進度條
4. **v1.0** – Google OAuth 登入 + GCS 永久儲存 + 使用者歷史清單
5. **v1.1** – 批次貼上多連結 → 佇列並行處理
6. **v1.2** – 設定檔導出 (JSON) + 快捷鍵

---

## 8. 可能擴充

* **Librosa** 進階分析（自動偵測無聲段自動剪裁）
* **SoX** 替代 ffmpeg 做特定降噪參數微調
* **Tone.js** + Waveform Playlist 做多軌合成
* **WebAssembly FFmpeg**：在前端直接裁切/轉檔，降低後端負載（僅適用小檔）

---

> 如需變更任務佇列策略、容器佈署參數或第三方登入機制，請在本檔案更新並同步至 CI/CD pipeline。
