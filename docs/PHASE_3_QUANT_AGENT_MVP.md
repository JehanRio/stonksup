# Phase 3: Quant Research Agent MVP

## Goal

Turn a natural-language research request into a reproducible quantitative workflow. The model decides which approved tools to call; deterministic application code owns strategy compilation, market data, backtesting, walk-forward validation, and persistence.

## Runtime flow

1. The user submits a research objective in `Agent Runs`.
2. DeepSeek receives the system policy and the available tool schemas.
3. `compile_strategy` converts the unmodified user request into Strategy IR v1 and a dependency manifest.
4. `get_market_data_status` reports persistent market-data coverage.
5. `run_backtest` executes the deterministic backtest engine.
6. `run_walk_forward` performs rolling out-of-sample validation and parameter search.
7. The model summarizes computed facts, risk judgment, and remaining limitations.
8. Every model turn, tool call, step status, duration, result, and failure is stored.

When compilation returns `needs_clarification`, the runtime stops immediately
and derives deterministic questions from the compiler issue codes. The user can
answer those questions in `Agent Runs`; the original prompt and answers are
combined into a new auditable run and compiled again. Unsupported conditions
remain terminal and cannot use the continuation endpoint.

The model does not calculate returns or invent backtest metrics. It only plans, calls tools, and explains tool outputs.

## Strategy IR v1

The compiler now produces two representations:

- `StrategySpec`: the compatibility parameter model used by the current form and stored experiments.
- `StrategyIR`: the executable, auditable rule graph consumed by the backtest engine.

`StrategyIR` declares indicators, typed operands, comparison operators, `all`/`any`
condition groups, entry and exit rules, position sizing, risk controls, and execution
timing. The four existing templates only translate parameters into IR; the backtest
engine evaluates the same generic condition graph for every template.

The accompanying `StrategyManifest` contains the canonical IR hash, OHLCV field
dependencies, indicator IDs, maximum lookback, required warm-up bars, execution
timing, direction, and look-ahead safety assertion. The IR hash is included in the
run audit so a result can be traced back to its exact executable definition.

EMA pullback strategies retain independent entry and exit periods:

- `entry_ema_period`: the EMA used by the entry condition.
- `exit_ema_period`: the EMA used by the exit condition.
- `ema_period`: retained as a compatibility alias for older stored requests.

Example: `回踩 EMA20 买入，跌破 EMA5 卖出` compiles to an entry EMA of 20 and an exit EMA of 5.

There are now two compilation paths:

- `Template fast path`: the deterministic compiler recognizes the four supported
  strategy templates and builds their IR without a model call.
- `AI semantic path`: DeepSeek maps composed EMA, SMA, RSI, rolling-high, and
  volume conditions into a `custom` IR. Every generated condition carries a
  verbatim `source_text` fragment from the user's request.

The AI output is never executed directly. A deterministic harness validates the
Pydantic schema, indicator references, dimensions, prompt evidence, symbol,
periods, risk, position sizing, execution timing, and unsupported concepts. A
rejected IR cannot reach market data or the backtest engine.

The execution path is now:

```text
Natural language -> deterministic template compiler ----------+
                 -> LLM semantic compiler -> safety harness ---+-> Strategy IR v1
                 -> Manifest -> indicator graph -> condition interpreter
                 -> orders -> metrics -> persisted IR + hash
```

This intentionally avoids executing arbitrary model-generated Python. Future
indicator and condition families extend the typed IR and deterministic interpreter;
an optional Python export can be added later as a derived artifact, not as the source
of truth.

The compiler is fail-closed. It emits `ready`, `needs_clarification`, or
`unsupported`, plus machine-readable issues. Only `ready` contracts may reach
market-data, backtest, or walk-forward tools. The agent cannot replace the
original prompt with a simplified rewrite, so unsupported clauses cannot be
silently discarded.

## API

- `POST /api/v1/backtests/compile`: deterministic four-template compilation.
- `POST /api/v1/backtests/compile-ai`: model-assisted semantic compilation into
  a harness-validated custom IR.
- `POST /api/v1/backtests/run`: execute a supplied `StrategySpec` and optional
  `StrategyIR` through the shared interpreter.
- `GET /api/v1/agent-runs/capabilities`: provider configuration and available tools.
- `POST /api/v1/agent-runs`: execute a research task.
- `POST /api/v1/agent-runs/{run_id}/continue`: answer every pending
  clarification question and create a new auditable run.
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
- Compilation exposes Strategy IR v1 and a reproducible manifest fingerprint.
- All four strategy templates execute through the shared condition interpreter.
- A composed EMA + RSI + volume strategy compiles into custom IR and executes
  through the same condition interpreter.
- Non-verbatim evidence, hallucinated indicators, incompatible dimensions, and
  changed risk or sizing values are rejected before execution.
- Backtest and walk-forward records are persisted by the existing research engines.
- Agent runs remain inspectable after a restart.
- Failed or malformed tool calls are visible in the execution trace.
- The backend test suite and frontend production build pass.

## Known boundaries

- The deterministic compiler supports four strategy families; the AI semantic
  path supports composed EMA, SMA, RSI, rolling-high, and volume rules. Nested
  condition groups, fundamentals, news, multi-asset rules, short selling,
  pyramiding, take-profit rules, and intraday strategies remain unsupported.
- Custom IR currently supports single backtests only. Walk-forward parameter
  search still requires one of the four parameterized templates.
- Agent execution is synchronous and does not yet support cancellation or background progress streaming.
- Tool permissions are static; per-user authorization and portfolio-level limits are future work.
- A provider-side model evaluation is required after a fresh DeepSeek key is configured.
