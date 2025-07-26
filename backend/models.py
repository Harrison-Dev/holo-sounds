from pydantic import BaseModel, HttpUrl
from typing import Optional, Literal


class DownloadRequest(BaseModel):
    url: HttpUrl


class DownloadResponse(BaseModel):
    task_id: str


class TaskStatus(BaseModel):
    state: Literal["queued", "downloading", "ready", "error"]
    error_message: Optional[str] = None


class ProcessRequest(BaseModel):
    task_id: str
    start: float
    end: float
    fade_in: float = 0.0
    fade_out: float = 0.0
    denoise: bool = False