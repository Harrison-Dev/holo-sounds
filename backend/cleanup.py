import asyncio
import pathlib
import shutil
import time
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Global reference to tasks for cleanup
TASKS_REF: Dict[str, Dict[str, Any]] = {}


def set_tasks_reference(tasks_dict):
    """Set reference to the tasks dictionary from main module"""
    global TASKS_REF
    TASKS_REF = tasks_dict


async def cleanup_worker():
    """Background worker to clean up old files and completed tasks"""
    while True:
        try:
            await cleanup_old_files()
            await asyncio.sleep(300)  # Run every 5 minutes
        except Exception as e:
            logger.error(f"Error in cleanup worker: {str(e)}")
            await asyncio.sleep(60)  # Wait 1 minute before retry on error


async def cleanup_old_files():
    """Clean up files older than 1 hour and remove completed tasks older than 24 hours"""
    tmp_base = pathlib.Path("/tmp")
    current_time = time.time()
    cleaned_files = 0
    cleaned_tasks = 0
    
    # Clean up old task directories
    for task_dir in tmp_base.glob("*"):
        if not task_dir.is_dir():
            continue
            
        try:
            # Check if directory name looks like a UUID (task_id)
            task_id = task_dir.name
            if len(task_id) != 36 or task_id.count('-') != 4:
                continue
                
            # Get directory age
            dir_age = current_time - task_dir.stat().st_mtime
            
            # Remove directories older than 1 hour
            if dir_age > 3600:  # 1 hour
                logger.info(f"Cleaning up old task directory: {task_id}")
                shutil.rmtree(task_dir, ignore_errors=True)
                cleaned_files += 1
                
                # Also remove from tasks dict if exists
                if task_id in TASKS_REF:
                    del TASKS_REF[task_id]
                    cleaned_tasks += 1
                    
        except Exception as e:
            logger.warning(f"Failed to clean up directory {task_dir}: {str(e)}")
    
    # Clean up old completed tasks from memory (older than 24 hours)
    tasks_to_remove = []
    for task_id, task_data in TASKS_REF.items():
        if task_data.get("state") in ["ready", "error"]:
            # Check if task directory still exists to determine age
            task_dir = tmp_base / task_id
            if not task_dir.exists():
                # Directory was cleaned up, remove from memory too
                tasks_to_remove.append(task_id)
    
    for task_id in tasks_to_remove:
        del TASKS_REF[task_id]
        cleaned_tasks += 1
    
    if cleaned_files > 0 or cleaned_tasks > 0:
        logger.info(f"Cleanup completed: {cleaned_files} directories, {cleaned_tasks} tasks removed")


def cleanup_task_files(task_id: str):
    """Clean up files for a specific task immediately"""
    try:
        task_dir = pathlib.Path("/tmp") / task_id
        if task_dir.exists():
            shutil.rmtree(task_dir, ignore_errors=True)
            logger.info(f"Cleaned up files for task: {task_id}")
    except Exception as e:
        logger.warning(f"Failed to clean up task {task_id}: {str(e)}")


def start_cleanup_worker():
    """Start the cleanup worker as a background task"""
    asyncio.create_task(cleanup_worker())