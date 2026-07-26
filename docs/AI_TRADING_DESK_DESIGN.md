# AI Trading Desk Product Design

## 1. Product Positioning

AI Trading Desk is an investment research, strategy testing, risk control, and trading review workstation.

The product should not be positioned as "an AI stock picker". Its real value is to systematize the full investment decision workflow:

```text
Market data -> Research -> Strategy test -> Risk sizing -> Trade plan -> Journal -> AI review
```

Target positioning:

> A financial technology portfolio project that shows engineering depth, AI application ability, market understanding, and risk awareness.

Recommended resume description:

> Independently developed AI Trading Desk, a research and trading review workstation for US equities and crypto assets. The system supports market monitoring, AI-generated research reports with sources, strategy backtesting, position sizing, portfolio risk snapshots, trading journals, and AI review. Built with React/TypeScript on the frontend, FastAPI/PostgreSQL on the backend, and pluggable LLM providers.

## 2. Target Users

Primary user:

- A technically strong personal investor who follows US equities, AI infrastructure, and crypto markets.
- Needs a disciplined workflow for research, trade planning, risk control, and post-trade review.

Future users:

- Retail investors who need structured research.
- Quant development and fintech job interviewers reviewing this project.
- Trading platform, risk platform, and AI financial application teams.
- Crypto traders who need data, funding rate, position, and review tools.

## 3. Current Project Status

The current project is already a useful frontend prototype:

- React + Vite + TypeScript frontend.
- Watchlist and market dashboard.
- Yahoo Finance based stock price and K-line data.
- AI stock analysis through Gemini/DeepSeek.
- Personal ledger, asset snapshots, trading journal, and report generation.

Current gap:

- It is still closer to a personal investment dashboard and ledger.
- Data is mostly frontend-driven and stored locally.
- There is no durable backend domain model yet.
- There is no unified research, backtest, risk, and journal loop.

Target evolution:

```text
Personal investment dashboard
  -> AI research and trading workflow
  -> Full-stack fintech portfolio system
```

## 4. Core Product Modules

### 4.1 Market Data Layer

Goal:

Collect, normalize, cache, and serve market data.

Core features:

- Instrument master data: stocks, ETFs, crypto pairs.
- OHLCV bars: intraday, daily, weekly, monthly.
- Watchlist management.
- News ingestion and symbol matching.
- Earnings calendar and financial statement snapshots.
- Optional crypto data: spot price, perpetual funding rate, open interest, exchange volume.

Engineering value:

- Data ingestion.
- Backend API design.
- Caching strategy.
- Financial data normalization.

Initial data sources:

- Yahoo Finance for MVP market price data.
- SEC EDGAR for US filings.
- Public news/search APIs where available.
- Later: Polygon, Tiingo, IEX Cloud, Finnhub, Alpha Vantage, or paid market data.

### 4.2 AI Research Layer

Goal:

Turn a ticker into a structured investment research report with facts, sources, risks, and counterarguments.

Research report structure:

- One-line conclusion.
- Business overview.
- Key financial data.
- Price and volume context.
- Bull case.
- Bear case.
- Catalysts.
- Risk factors.
- Valuation range.
- Trading plan suggestion.
- Source list.

Important design rule:

AI output must be evidence-based. Every major claim should either reference a stored source or be marked as model inference.

Engineering value:

- LLM workflow design.
- Retrieval-augmented generation.
- Prompt engineering.
- Source attribution.
- AI reliability and fallback handling.

### 4.3 Strategy Lab

Goal:

Allow users to test trading ideas before acting.

MVP strategies:

- Moving average crossover.
- Momentum breakout.
- RSI mean reversion.

Backtest outputs:

- Equity curve.
- Total return.
- Annualized return.
- Max drawdown.
- Win rate.
- Profit factor.
- Average win/loss.
- Trade list.
- Benchmark comparison.

Important design rule:

Backtest should show limitations clearly:

- No slippage assumption by default.
- No survivorship-bias handling in MVP.
- Delayed signal execution should be explicit.
- Position sizing rule should be visible.

Engineering value:

- Time-series computation.
- Strategy parameter modeling.
- Financial metrics.
- Backend compute service.

### 4.4 Risk And Position System

Goal:

Make every trade plan risk-aware before execution.

Core features:

- Account equity input.
- Entry price, stop loss, target price.
- Position size calculator.
- Single-trade maximum loss.
- Portfolio exposure by symbol, sector, asset class.
- Cash ratio and leverage ratio.
- Drawdown tracking.
- Risk alerts.

MVP formulas:

```text
risk_per_share = abs(entry_price - stop_loss)
max_trade_loss = account_equity * risk_budget_percent
position_size = max_trade_loss / risk_per_share
position_value = position_size * entry_price
reward_risk_ratio = abs(target_price - entry_price) / risk_per_share
```

Engineering value:

- Risk model design.
- Trading platform thinking.
- Portfolio-level aggregation.
- A more professional workflow than pure AI chat.

### 4.5 Trading Journal And AI Coach

Goal:

Build a disciplined feedback loop from plan to execution to review.

Core journal sections:

- Market phase.
- Watchlist and thesis.
- Trade plan.
- Entry trigger.
- Stop loss.
- Target.
- Actual execution.
- Emotion state.
- Mistake type.
- Post-trade review.
- AI review.

AI Coach responsibilities:

- Compare actual trade with original plan.
- Identify rule violations.
- Check if thesis was factually supported.
- Detect emotional patterns.
- Generate next-action rules.

Example AI review output:

- What you did well.
- What violated the plan.
- Evidence quality score.
- Risk discipline score.
- Next time rule.

Engineering value:

- AI product workflow.
- User behavior loop.
- Persistent domain data.
- Strong personal differentiation for interviews.

## 5. Information Architecture

Recommended primary navigation:

1. Dashboard
   - Market overview.
   - Watchlist.
   - Portfolio snapshot.
   - Today risk summary.
   - AI alerts.

2. Market
   - Symbol search.
   - K-line chart.
   - News.
   - Fundamentals.
   - Earnings calendar.

3. Research
   - AI research reports.
   - Filing and earnings call summaries.
   - Bull/bear comparison.
   - Saved reports.

4. Strategy Lab
   - Strategy templates.
   - Parameter form.
   - Backtest result.
   - Strategy comparison.

5. Portfolio Risk
   - Positions.
   - Exposure.
   - Position sizing.
   - Risk alerts.

6. Journal
   - Pre-trade plan.
   - Post-trade review.
   - AI Coach.
   - Mistake statistics.

## 6. Core User Flows

### 6.1 Research To Trade Plan

```text
Open MU
-> Review price/news/fundamentals
-> Generate AI research report
-> Save thesis
-> Create trade plan
-> Calculate position size and max loss
-> Save as planned trade
```

### 6.2 Strategy Validation

```text
Select symbol
-> Choose strategy template
-> Set parameters
-> Run backtest
-> Review return, drawdown, win rate
-> Save strategy or discard
```

### 6.3 Trade Review

```text
Record actual trade
-> Link to original plan
-> Compare planned vs actual behavior
-> AI reviews facts, logic, risk, and emotion
-> Save correction rule
```

## 7. Technical Architecture

### 7.1 Frontend

Keep the current stack:

- React.
- TypeScript.
- Vite.
- lightweight-charts.
- Recharts.

Recommended frontend refactor:

- Keep UI pages under `pages/`.
- Move reusable finance components into `components/finance/`.
- Add a typed API client under `services/apiClient.ts`.
- Stop calling market data APIs directly from UI when backend is ready.

### 7.2 Backend

Recommended stack:

- Python FastAPI.
- SQLAlchemy or SQLModel.
- Pydantic schemas.
- APScheduler for MVP scheduled jobs.
- Celery + Redis later if background jobs become heavy.

Why Python backend:

- Better ecosystem for market data, pandas, backtesting, and AI workflows.
- Easier to demonstrate fintech and quant-adjacent capability.
- More natural for future research and strategy modules.

### 7.3 Database

Recommended DB:

- PostgreSQL.

Optional later:

- Redis for caching.
- ClickHouse for high-frequency market data.
- Object storage for filings, transcripts, and report artifacts.

### 7.4 AI Provider Layer

Create a provider abstraction:

```text
AIProvider
  - OpenAIProvider
  - DeepSeekProvider
  - GeminiProvider
```

The application should not hardcode one model throughout the business code.

Required AI metadata:

- Provider.
- Model.
- Prompt version.
- Source ids.
- Created time.
- Cost or token usage if available.

## 8. Database Design Draft

### users

- id
- email
- display_name
- created_at

For MVP, this can be a single local user, but keeping the table helps the model stay extensible.

### instruments

- id
- symbol
- name
- asset_type
- exchange
- currency
- sector
- industry
- is_active

### price_bars

- id
- instrument_id
- timeframe
- timestamp
- open
- high
- low
- close
- volume
- source

Unique index:

```text
(instrument_id, timeframe, timestamp, source)
```

### news_items

- id
- title
- source
- url
- published_at
- summary
- raw_payload

### news_instruments

- news_id
- instrument_id

### filings

- id
- instrument_id
- filing_type
- filing_date
- period
- source_url
- text_path
- parsed_json

### research_reports

- id
- instrument_id
- report_type
- conclusion
- content_markdown
- source_ids
- ai_provider
- ai_model
- prompt_version
- created_at

### strategies

- id
- name
- strategy_type
- parameters_json
- description
- created_at

### backtest_runs

- id
- strategy_id
- instrument_id
- start_date
- end_date
- initial_cash
- result_metrics_json
- equity_curve_json
- trades_json
- created_at

### positions

- id
- instrument_id
- quantity
- average_cost
- current_price
- opened_at
- updated_at

### trades

- id
- instrument_id
- side
- quantity
- price
- fees
- traded_at
- broker
- strategy_id
- journal_id

### risk_snapshots

- id
- snapshot_at
- net_liquidation
- cash
- gross_exposure
- net_exposure
- max_drawdown
- risk_metrics_json

### journal_entries

- id
- date
- market_phase
- thesis
- trade_plan
- execution_review
- emotion_state
- mistake_tags
- created_at
- updated_at

### ai_reviews

- id
- target_type
- target_id
- review_markdown
- score_json
- ai_provider
- ai_model
- created_at

## 9. API Design Draft

### Market

```text
GET /api/market/watchlist
POST /api/market/watchlist
DELETE /api/market/watchlist/{symbol}

GET /api/market/instruments/{symbol}
GET /api/market/bars/{symbol}?timeframe=1d&start=2025-01-01&end=2026-01-01
GET /api/news?symbol=MU
```

### Research

```text
POST /api/research/reports
GET /api/research/reports?symbol=MU
GET /api/research/reports/{id}
```

Request example:

```json
{
  "symbol": "MU",
  "report_type": "earnings",
  "include_sources": true
}
```

### Strategy Lab

```text
GET /api/strategies
POST /api/strategies
POST /api/backtests
GET /api/backtests/{id}
```

### Risk

```text
POST /api/risk/position-size
GET /api/portfolio/summary
GET /api/portfolio/risk-snapshot
```

Request example:

```json
{
  "account_equity": 100000,
  "risk_budget_percent": 0.01,
  "entry_price": 120,
  "stop_loss": 110,
  "target_price": 150
}
```

### Journal

```text
GET /api/journal?date=2026-07-21
POST /api/journal
PUT /api/journal/{id}
POST /api/journal/{id}/ai-review
```

## 10. Deployment Plan

### 10.1 Current Server

User-provided server addresses:

```text
Public IP: 175.178.17.89
Private IP: 172.16.16.11
```

Do not commit passwords, SSH private keys, API keys, database passwords, or `.env` values into the repository.

### 10.2 What Public IP Is For

The public IP is used for access from the internet.

Typical uses:

- SSH from your laptop to the server.
- Expose the frontend website.
- Expose backend HTTPS API.
- Bind a domain name with DNS A record.

Example:

```bash
ssh root@175.178.17.89
```

The actual username may be `root`, `ubuntu`, `debian`, or a custom user depending on how the server was created.

### 10.3 What Private IP Is For

The private IP is used inside the cloud provider's internal network or VPC.

Typical uses:

- Backend server connects to a database server in the same VPC.
- Backend connects to Redis, monitoring, or another internal service.
- Load balancer forwards traffic to backend instances.
- Multiple servers communicate without exposing DB/Redis to the public internet.

Important notes:

- You usually cannot access `172.16.16.11` directly from your home network.
- Private IP traffic is normally safer and often cheaper inside the same cloud region/VPC.
- Databases should prefer `localhost`, Docker internal network, or private IP, not public IP.
- If backend and DB are on the same server, use `localhost` or Docker service names.

## 11. How To Put Code On The Server

### Option A: Git Pull On Server

Best when the code is hosted on GitHub/Gitee/GitLab.

On the server:

```bash
ssh root@175.178.17.89
sudo apt update
sudo apt install -y git nginx
git clone <your-repo-url> /opt/ai-investment-agent
cd /opt/ai-investment-agent
npm ci
npm run build
```

Then serve `dist/` with Nginx.

Example Nginx config:

```nginx
server {
    listen 80;
    server_name 175.178.17.89;

    root /opt/ai-investment-agent/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

If this Vite app keeps `base: '/stonksup/'`, access path will usually be:

```text
http://175.178.17.89/stonksup/
```

If the project will be deployed at the root domain, change Vite `base` to `/`.

### Option B: Build Locally And Upload dist

Best when you only want to deploy the frontend quickly.

On local machine:

```bash
npm ci
npm run build
```

Upload:

```bash
scp -r dist root@175.178.17.89:/opt/ai-investment-agent-dist
```

Then point Nginx root to:

```text
/opt/ai-investment-agent-dist
```

### Option C: Docker Compose For Full Stack

Recommended once backend and DB are added.

Target services:

- `frontend`: static build served by Nginx.
- `backend`: FastAPI service.
- `postgres`: PostgreSQL database.
- `redis`: optional cache/task queue.

Example production layout:

```text
/opt/ai-trading-desk
  docker-compose.yml
  frontend/
  backend/
  nginx/
  .env
```

Example service communication:

```text
Browser -> Public IP / domain -> Nginx -> frontend
Browser -> Public IP / domain -> Nginx /api -> backend
backend -> postgres through Docker network
backend -> redis through Docker network
```

In this setup, PostgreSQL should not expose port `5432` to the public internet unless there is a strong reason and proper firewall rules.

## 12. MVP Roadmap

### Phase 1: Frontend Cleanup And Product Shell

Time: 2 weeks.

Deliverables:

- Unified navigation: Dashboard, Market, Research, Strategy Lab, Risk, Journal.
- Fix visible encoding/Chinese text issues.
- Keep current watchlist, chart, AI analysis, ledger, and journal features.
- Add README and screenshots.
- Add this design document as project direction.

### Phase 2: Backend And Database Foundation

Time: 2 to 3 weeks.

Deliverables:

- FastAPI project.
- PostgreSQL schema and migrations.
- Market data cache endpoints.
- Watchlist stored in DB.
- Journal stored in DB.
- Frontend calls backend instead of localStorage for key data.

### Phase 3: AI Research Reports

Time: 3 to 4 weeks.

Deliverables:

- Research report generation endpoint.
- Report persistence.
- Source list and evidence block.
- Bull/bear/catalyst/risk structure.
- Filing/news ingestion MVP.

### Phase 4: Strategy Lab And Risk

Time: 4 to 6 weeks.

Deliverables:

- Backtest engine MVP.
- MA crossover, breakout, RSI strategies.
- Backtest metrics and equity curve.
- Position sizing calculator.
- Portfolio risk snapshot.

### Phase 5: Crypto And Web3 Extension

Time: later.

Deliverables:

- Crypto spot market data.
- Perpetual funding rate.
- Open interest.
- Wallet/position import where compliant.
- Crypto-specific risk dashboard.

Important:

Crypto modules should focus on analysis, simulation, and risk management first. Avoid real-money execution until legal, exchange, and operational risks are fully understood.

## 13. Project Priorities

Highest priority:

1. Turn the current local frontend prototype into a coherent product shell.
2. Add backend and database persistence.
3. Build one excellent AI research report workflow.
4. Build one simple but correct backtest workflow.
5. Build risk sizing and journal review loop.

Avoid early distractions:

- Do not start with real-money trading.
- Do not overbuild Web3 execution.
- Do not add too many data vendors before the domain model is stable.
- Do not make the product a generic chatbot.

The strongest interview story is:

> I built a full-stack AI trading workstation that connects data, research, strategy testing, risk control, and trading review into one disciplined workflow.
