import asyncio
import subprocess
import pathlib
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

QUEUE: asyncio.Queue = asyncio.Queue()
TASKS: Dict[str, Dict[str, Any]] = {}


async def download_worker():
    """Worker process to handle download tasks sequentially"""
    while True:
        try:
            task_id = await QUEUE.get()
            task = TASKS.get(task_id)
            
            if not task:
                logger.error(f"Task {task_id} not found in TASKS")
                continue
                
            task["state"] = "downloading"
            url = task["url"]
            tmp_dir = pathlib.Path("/tmp") / task_id
            tmp_dir.mkdir(exist_ok=True)
            
            # Download audio using yt-dlp
            cmd = [
                "yt-dlp",
                "-x",  # Extract audio only
                "--audio-format", "m4a",
                "--audio-quality", "0",  # Best quality
                "-o", str(tmp_dir / "audio.%(ext)s"),
                url
            ]
            
            logger.info(f"Starting download for task {task_id}: {url}")
            
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await proc.communicate()
            
            if proc.returncode == 0:
                task["state"] = "ready"
                logger.info(f"Download completed for task {task_id}")
            else:
                task["state"] = "error"
                task["error_message"] = stderr.decode() if stderr else "Download failed"
                logger.error(f"Download failed for task {task_id}: {task['error_message']}")
                
        except Exception as e:
            logger.error(f"Error in download worker: {str(e)}")
            if task_id and task_id in TASKS:
                TASKS[task_id]["state"] = "error"
                TASKS[task_id]["error_message"] = str(e)
        finally:
            QUEUE.task_done()


def start_download_worker():
    """Start the download worker as a background task"""
    asyncio.create_task(download_worker())