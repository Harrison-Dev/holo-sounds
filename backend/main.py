import asyncio
import uuid
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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
    title="Holo-Sounds Audio Editor",
    description="Download and edit audio clips",
    version="0.2.0",
    lifespan=lifespan
)

# API Router should be defined before mounting static files
api_router = app.router

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/download", response_model=DownloadResponse)
async def download_audio(request: DownloadRequest):
    """Queue a YouTube audio download task"""
    try:
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
    
    except Exception as e:
        logger.error(f"Error creating download task: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start download: {str(e)}")


@app.get("/api/status/{task_id}", response_model=TaskStatus)
async def get_task_status(task_id: str):
    """Get the status of a download task"""
    task = TASKS.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return TaskStatus(
        state=task["state"],
        error_message=task.get("error_message")
    )


@app.post("/api/process")
async def process_audio_endpoint(request: ProcessRequest):
    """Process audio with trim, fade, and denoise effects"""
    return await process_audio(request)


@app.get("/api/audio/{task_id}")
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

# --- Static file serving ---
# This must be after all API routes
static_folder = Path(__file__).parent.parent / "frontend" / "dist"

# Mount the static assets directory
app.mount("/assets", StaticFiles(directory=static_folder / "assets"), name="assets")

@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """Serve the React application"""
    index_path = static_folder / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend not built. Run `npm run build` in the frontend directory.")
    return FileResponse(index_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)