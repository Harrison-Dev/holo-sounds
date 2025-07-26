# YouTube Audio Editor

A web tool for downloading YouTube audio, editing (trim, fade, denoise), and exporting as OGG files.

## Features

- Download YouTube audio via URL
- Visual waveform editor with region selection
- Audio effects: fade in/out, noise reduction
- Export to OGG format
- Clean, responsive UI

## Tech Stack

- **Backend**: FastAPI (Python 3.12)
- **Frontend**: React + Vite
- **Audio Processing**: FFmpeg + yt-dlp
- **Waveform Visualization**: Wavesurfer.js
- **Deployment**: Docker, Google Cloud Run

## Quick Start

### Using Docker Compose (Recommended)

```bash
docker-compose up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8080

### Manual Setup

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Deployment

### Google Cloud Run

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

## API Endpoints

- `POST /download` - Start YouTube audio download
- `GET /status/{task_id}` - Check download status
- `POST /process` - Process audio with effects
- `GET /audio/{task_id}` - Get downloaded audio file

## Development

See [CLAUDE.md](CLAUDE.md) for detailed development guidelines and architecture documentation.