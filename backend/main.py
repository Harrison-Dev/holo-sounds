import asyncio
import uuid
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .models import DownloadRequest, DownloadResponse, TaskStatus, ProcessRequest
from .download_worker import QUEUE, TASKS, start_download_worker
from .process_handler import process_audio
from .cleanup import start_cleanup_worker, set_tasks_reference, cleanup_old_files

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Start the download worker on startup
    logger.info("Starting download worker...")
    start_download_worker()
    
    # Start the cleanup worker
    logger.info("Starting cleanup worker...")
    set_tasks_reference(TASKS)
    start_cleanup_worker()
    
    yield
    # Cleanup on shutdown
    logger.info("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="YouTube Audio Editor",
    description="Download and edit YouTube audio clips",
    version="0.1.0",
    lifespan=lifespan
)

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite default ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "ok", "service": "YouTube Audio Editor API"}


@app.post("/download", response_model=DownloadResponse)
async def download_audio(request: DownloadRequest):
    """Queue a YouTube audio download task"""
    task_id = str(uuid.uuid4())
    
    # Create task entry
    TASKS[task_id] = {
        "task_id": task_id,
        "url": str(request.url),
        "state": "queued",
        "error_message": None
    }
    
    # Add to download queue
    await QUEUE.put(task_id)
    
    logger.info(f"Created download task {task_id} for URL: {request.url}")
    
    return DownloadResponse(task_id=task_id)


@app.get("/status/{task_id}", response_model=TaskStatus)
async def get_task_status(task_id: str):
    """Get the status of a download task"""
    task = TASKS.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return TaskStatus(
        state=task["state"],
        error_message=task.get("error_message")
    )


@app.post("/process")
async def process_audio_endpoint(request: ProcessRequest):
    """Process audio with trim, fade, and denoise effects"""
    return await process_audio(request)


@app.get("/audio/{task_id}")
async def get_audio_file(task_id: str):
    """Get the downloaded audio file for waveform display"""
    task = TASKS.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["state"] != "ready":
        raise HTTPException(status_code=400, detail=f"Task is not ready. Current state: {task['state']}")
    
    audio_path = f"/tmp/{task_id}/audio.m4a"
    
    return FileResponse(
        path=audio_path,
        media_type="audio/mp4",
        filename=f"audio_{task_id}.m4a"
    )


@app.post("/cleanup")
async def manual_cleanup():
    """Manually trigger cleanup of old files"""
    await cleanup_old_files()
    return {"message": "Cleanup completed"}


@app.get("/stats")
async def get_stats():
    """Get system statistics"""
    import pathlib
    tmp_dirs = list(pathlib.Path("/tmp").glob("*"))
    task_dirs = [d for d in tmp_dirs if d.is_dir() and len(d.name) == 36 and d.name.count('-') == 4]
    
    total_size = 0
    for task_dir in task_dirs:
        for file in task_dir.rglob("*"):
            if file.is_file():
                total_size += file.stat().st_size
    
    return {
        "active_tasks": len(TASKS),
        "stored_directories": len(task_dirs),
        "total_storage_mb": round(total_size / (1024 * 1024), 2),
        "queue_size": QUEUE.qsize()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)