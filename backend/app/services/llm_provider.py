from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.errors import StonksUpError


@dataclass(frozen=True)
class ModelUsage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(frozen=True)
class ModelResponse:
    content: str | None
    tool_calls: list[dict[str, Any]]
    finish_reason: str | None
    usage: ModelUsage


class ModelClient(Protocol):
    provider: str
    model: str

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ModelResponse: ...


class DeepSeekClient:
    provider = "deepseek"

    def __init__(self, api_key: str, base_url: str, model: str, timeout: float):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self.model = model
        self._timeout = timeout

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ModelResponse:
        body = json.dumps(
            {
                "model": self.model,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "temperature": 0.1,
            },
            ensure_ascii=False,
        ).encode("utf-8")
        request = Request(
            f"{self._base_url}/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self._timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")[:1_000]
            raise StonksUpError(
                "llm_provider_http_error",
                "The LLM provider returned an HTTP error.",
                status_code=502,
                details={"provider": self.provider, "status": exc.code, "body": error_body},
            ) from exc
        except (URLError, TimeoutError) as exc:
            raise StonksUpError(
                "llm_provider_unavailable",
                "The LLM provider is temporarily unavailable.",
                status_code=503,
                details={"provider": self.provider},
            ) from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise StonksUpError(
                "llm_provider_invalid_response",
                "The LLM provider returned an invalid response.",
                status_code=502,
                details={"provider": self.provider},
            ) from exc

        choice = payload["choices"][0]
        message = choice["message"]
        usage = payload.get("usage") or {}
        return ModelResponse(
            content=message.get("content"),
            tool_calls=message.get("tool_calls") or [],
            finish_reason=choice.get("finish_reason"),
            usage=ModelUsage(
                input_tokens=int(usage.get("prompt_tokens", 0)),
                output_tokens=int(usage.get("completion_tokens", 0)),
            ),
        )
