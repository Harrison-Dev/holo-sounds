import subprocess
import uuid
import pathlib
import logging
from fastapi import HTTPException
from fastapi.responses import FileResponse
from .models import ProcessRequest
from .download_worker import TASKS

logger = logging.getLogger(__name__)


async def process_audio(req: ProcessRequest) -> FileResponse:
    """Process audio file with FFmpeg filters"""
    
    # Check if task exists and is ready
    task = TASKS.get(req.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["state"] != "ready":
        raise HTTPException(status_code=400, detail=f"Task is not ready. Current state: {task['state']}")
    
    tmp_dir = pathlib.Path("/tmp") / req.task_id
    src = tmp_dir / "audio.m4a"
    
    if not src.exists():
        raise HTTPException(status_code=404, detail="Source audio file not found")
    
    # Generate output filename
    output_id = str(uuid.uuid4())
    out = tmp_dir / f"{output_id}.ogg"
    
    # Build FFmpeg filter chain
    filters = []
    
    # Trim audio
    duration = req.end - req.start
    filters.append(f"atrim=start={req.start}:end={req.end},asetpts=PTS-STARTPTS")
    
    # Apply denoising if requested
    if req.denoise:
        filters.append("afftdn=nr=20:nf=-25")  # Noise reduction settings
    
    # Apply fade in
    if req.fade_in > 0:
        filters.append(f"afade=t=in:st=0:d={req.fade_in}")
    
    # Apply fade out
    if req.fade_out > 0 and req.fade_out < duration:
        fade_start = duration - req.fade_out
        filters.append(f"afade=t=out:st={fade_start}:d={req.fade_out}")
    
    # Combine all filters
    filter_string = ",".join(filters)
    
    # Build FFmpeg command
    ffmpeg_cmd = [
        "ffmpeg",
        "-y",  # Overwrite output file
        "-i", str(src),
        "-af", filter_string,
        "-c:a", "libvorbis",  # Ogg Vorbis codec
        "-q:a", "6",  # Quality setting (0-10, higher is better)
        str(out)
    ]
    
    logger.info(f"Processing audio for task {req.task_id} with filters: {filter_string}")
    
    try:
        # Run FFmpeg
        result = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        if not out.exists():
            raise HTTPException(status_code=500, detail="Failed to generate output file")
        
        # Return the processed file
        return FileResponse(
            path=str(out),
            media_type="audio/ogg",
            filename=f"clip_{output_id}.ogg"
        )
        
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg error: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Audio processing failed: {e.stderr}")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")