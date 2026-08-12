from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies import get_app_settings, get_db_session, success_response
from app.core.config import Settings
from app.schemas.agent_runs import (
    AgentCapability,
    AgentRunDetail,
    AgentRunHistory,
    CreateAgentRunRequest,
)
from app.schemas.common import ApiResponse
from app.services.agent_runtime import TOOLS, get_agent_run, get_agent_runs, run_quant_agent


router = APIRouter(prefix="/agent-runs", tags=["agent-runs"])


@router.get("/capabilities", response_model=ApiResponse[AgentCapability])
def get_agent_capabilities(
    request: Request,
    settings: Settings = Depends(get_app_settings),
) -> ApiResponse[AgentCapability]:
    configured = bool(
        settings.deepseek_api_key
        and settings.deepseek_api_key.get_secret_value().strip()
    )
    return success_response(
        request,
        AgentCapability(
            configured=configured,
            model=settings.deepseek_model,
            tools=[item["function"]["name"] for item in TOOLS],
            message=(
                "DeepSeek is configured for auditable tool calling."
                if configured
                else "Set STONKSUP_DEEPSEEK_API_KEY on the backend to enable the agent."
            ),
        ),
    )


@router.get("", response_model=ApiResponse[AgentRunHistory])
def list_agent_runs(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_db_session),
) -> ApiResponse[AgentRunHistory]:
    return success_response(request, get_agent_runs(session, limit))


@router.get("/{run_id}", response_model=ApiResponse[AgentRunDetail])
def read_agent_run(
    run_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> ApiResponse[AgentRunDetail]:
    return success_response(request, get_agent_run(session, run_id))


@router.post("", response_model=ApiResponse[AgentRunDetail])
def create_agent_run(
    payload: CreateAgentRunRequest,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: Session = Depends(get_db_session),
) -> ApiResponse[AgentRunDetail]:
    return success_response(request, run_quant_agent(session, settings, payload))
