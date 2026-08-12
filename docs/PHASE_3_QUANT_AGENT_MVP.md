# Phase 3: Quant Research Agent MVP

## Goal

Turn a natural-language research request into a reproducible quantitative workflow. The model decides which approved tools to call; deterministic application code owns strategy compilation, market data, backtesting, walk-forward validation, and persistence.

## Runtime flow

1. The user submits a research objective in `Agent Runs`.
2. DeepSeek receives the system policy and the available tool schemas.
3. `compile_strategy` converts the request into Strategy Contract v0.3.
4. `get_market_data_status` reports persistent market-data coverage.
5. `run_backtest` executes the deterministic backtest engine.
6. `run_walk_forward` performs rolling out-of-sample validation and parameter search.
7. The model summarizes computed facts, risk judgment, and remaining limitations.
8. Every model turn, tool call, step status, duration, result, and failure is stored.

The model does not calculate returns or invent backtest metrics. It only plans, calls tools, and explains tool outputs.

## Strategy Contract v0.3

EMA pullback strategies now support independent entry and exit periods:

- `entry_ema_period`: the EMA used by the entry condition.
- `exit_ema_period`: the EMA used by the exit condition.
- `ema_period`: retained as a compatibility alias for older stored requests.

Example: `回踩 EMA20 买入，跌破 EMA5 卖出` compiles to an entry EMA of 20 and an exit EMA of 5.

## API

- `GET /api/v1/agent-runs/capabilities`: provider configuration and available tools.
- `POST /api/v1/agent-runs`: execute a research task.
- `GET /api/v1/agent-runs`: list persisted runs.
- `GET /api/v1/agent-runs/{run_id}`: inspect the complete execution trace.

The first MVP executes synchronously. Nginx allows up to 180 seconds for the full orchestration request. Moving execution to a durable job queue is the next scalability step.

## Configuration

Set these variables only in the server environment or untracked `.env` file:

```dotenv
STONKSUP_DEEPSEEK_API_KEY=<rotated-secret>
STONKSUP_DEEPSEEK_BASE_URL=https://api.deepseek.com
STONKSUP_DEEPSEEK_MODEL=deepseek-chat
```

Never commit API keys. A key pasted into chat, an issue, or logs must be revoked and replaced before use.

## MVP acceptance criteria

- A user can describe a supported strategy in Chinese.
- The agent invokes all four approved tools and returns a grounded conclusion.
- Entry and exit EMA periods remain distinct throughout compilation and execution.
- Backtest and walk-forward records are persisted by the existing research engines.
- Agent runs remain inspectable after a restart.
- Failed or malformed tool calls are visible in the execution trace.
- The backend test suite and frontend production build pass.

## Known boundaries

- The deterministic compiler currently supports the four existing strategy families and their current grammar.
- Agent execution is synchronous and does not yet support cancellation or background progress streaming.
- Tool permissions are static; per-user authorization and portfolio-level limits are future work.
- A provider-side model evaluation is required after a fresh DeepSeek key is configured.
