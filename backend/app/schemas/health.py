from typing import Literal

from pydantic import BaseModel


class HealthStatus(BaseModel):
    service: str
    status: Literal["alive", "ready", "not_ready"]
    version: str
    environment: str
    build_sha: str
    checks: dict[str, str]
