import React from 'react';
import {
  ArrowRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileSearch,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { navigateTo } from '../../app/navigation';

const baseAssetPath = '/stonksup/assets/logos/';

const positions = [
  { symbol: 'NVDA', name: 'NVIDIA', value: '$25,402', weight: '24.2%', change: '+2.64%', logo: 'nvidia.svg' },
  { symbol: 'MU', name: 'Micron', value: '$18,930', weight: '18.1%', change: '+4.18%', logo: 'micron.png' },
  { symbol: 'AAPL', name: 'Apple', value: '$14,260', weight: '13.6%', change: '-0.42%', logo: 'apple.svg' },
  { symbol: 'BTC', name: 'Bitcoin', value: '$9,840', weight: '9.4%', change: '+1.17%', logo: 'bitcoin.svg' },
];

const workflow = [
  { label: 'Parse request', state: 'done' },
  { label: 'Market context', state: 'done' },
  { label: 'Evidence retrieval', state: 'running' },
  { label: 'Counter thesis', state: 'queued' },
  { label: 'Risk gate', state: 'queued' },
];

const DashboardPage: React.FC = () => (
  <div className="decision-dashboard">
    <section className="dashboard-main">
      <header className="dashboard-heading">
        <div>
          <span className="dashboard-kicker">Thursday · 24 Jul</span>
          <h1>决策总览</h1>
          <p>把今天需要关注、验证和处理的事项压缩在一个工作面上。</p>
        </div>
        <div className="dashboard-heading-actions">
          <button type="button" className="secondary-command" onClick={() => navigateTo('#/overview')}>
            查看组合
            <ArrowRight size={15} />
          </button>
          <button type="button" className="primary-command" onClick={() => navigateTo('#/research/new')}>
            <FileSearch size={15} />
            发起研究
          </button>
        </div>
      </header>

      <div className="metric-strip">
        <article>
          <small>净资产</small>
          <strong>$104,820.42</strong>
          <span className="positive">+$1,894.30 today</span>
        </article>
        <article>
          <small>现金可用</small>
          <strong>$26,388.12</strong>
          <span>25.2% of equity</span>
        </article>
        <article>
          <small>当前回撤</small>
          <strong>-3.28%</strong>
          <span>Limit -12.0%</span>
        </article>
        <article>
          <small>风险预算</small>
          <strong>0.74%</strong>
          <span className="warning">Single trade max 1.0%</span>
        </article>
      </div>

      <section className="dashboard-section">
        <div className="section-title-row">
          <div>
            <span className="section-code">PORTFOLIO / EXPOSURE</span>
            <h2>持仓与敞口</h2>
          </div>
          <button type="button" className="text-command" onClick={() => navigateTo('#/assets')}>
            资产明细
            <ExternalLink size={14} />
          </button>
        </div>

        <div className="portfolio-layout">
          <div className="asset-treemap" aria-label="资产配置图">
            <button type="button" className="asset-tile tile-nvda" onClick={() => navigateTo('#/investor/stock/NVDA?tf=INTRADAY')}>
              <img src={`${baseAssetPath}nvidia.svg`} alt="" />
              <span><strong>NVDA</strong><small>24.2%</small></span>
            </button>
            <button type="button" className="asset-tile tile-mu" onClick={() => navigateTo('#/investor/stock/MU?tf=INTRADAY')}>
              <img src={`${baseAssetPath}micron.png`} alt="" />
              <span><strong>MU</strong><small>18.1%</small></span>
            </button>
            <button type="button" className="asset-tile tile-cash" onClick={() => navigateTo('#/overview')}>
              <span><strong>CASH</strong><small>25.2%</small></span>
            </button>
            <button type="button" className="asset-tile tile-aapl" onClick={() => navigateTo('#/investor/stock/AAPL?tf=INTRADAY')}>
              <img src={`${baseAssetPath}apple.svg`} alt="" />
              <span><strong>AAPL</strong><small>13.6%</small></span>
            </button>
            <button type="button" className="asset-tile tile-btc" onClick={() => navigateTo('#/investor/stock/BTC-USD?tf=INTRADAY')}>
              <img src={`${baseAssetPath}bitcoin.svg`} alt="" />
              <span><strong>BTC</strong><small>9.4%</small></span>
            </button>
            <div className="asset-tile tile-other">
              <span><strong>OTHER</strong><small>9.5%</small></span>
            </div>
          </div>

          <div className="position-table">
            <div className="position-row position-head">
              <span>Instrument</span><span>Value</span><span>Weight</span><span>Day</span>
            </div>
            {positions.map((position) => (
              <button
                type="button"
                className="position-row"
                key={position.symbol}
                onClick={() => navigateTo(`#/investor/stock/${position.symbol === 'BTC' ? 'BTC-USD' : position.symbol}?tf=INTRADAY`)}
              >
                <span className="position-name">
                  <img src={`${baseAssetPath}${position.logo}`} alt="" />
                  <span><strong>{position.symbol}</strong><small>{position.name}</small></span>
                </span>
                <span>{position.value}</span>
                <span>{position.weight}</span>
                <span className={position.change.startsWith('+') ? 'positive' : 'negative'}>{position.change}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-title-row">
          <div>
            <span className="section-code">WATCHLIST / SIGNALS</span>
            <h2>今日观察</h2>
          </div>
          <button type="button" className="text-command" onClick={() => navigateTo('#/investor/summary')}>
            打开行情终端
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="watch-grid">
          <button type="button" onClick={() => navigateTo('#/investor/stock/MU?tf=INTRADAY')}>
            <span><strong>MU</strong><small>Micron Technology</small></span>
            <span className="watch-price">$132.84</span>
            <span className="positive">+4.18%</span>
            <span className="signal-tag">Earnings follow-through</span>
          </button>
          <button type="button" onClick={() => navigateTo('#/investor/stock/NVDA?tf=INTRADAY')}>
            <span><strong>NVDA</strong><small>NVIDIA</small></span>
            <span className="watch-price">$178.26</span>
            <span className="positive">+2.64%</span>
            <span className="signal-tag">Momentum intact</span>
          </button>
          <button type="button" onClick={() => navigateTo('#/investor/stock/TSLA?tf=INTRADAY')}>
            <span><strong>TSLA</strong><small>Tesla</small></span>
            <span className="watch-price">$301.18</span>
            <span className="negative">-1.86%</span>
            <span className="signal-tag risk">Volatility elevated</span>
          </button>
        </div>
      </section>
    </section>

    <aside className="dashboard-context">
      <section className="context-section agent-focus">
        <div className="context-title">
          <span><TrendingUp size={16} /> Active research</span>
          <span className="run-id">RUN-0241</span>
        </div>
        <h2>MU 财报后，现在上车是否还来得及？</h2>
        <p>验证 HBM 必要性、存储周期变化与未来 6-12 个月风险收益比。</p>
        <div className="workflow-list">
          {workflow.map((item, index) => (
            <div key={item.label} className={`workflow-step ${item.state}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item.label}</strong>
              <small>{item.state}</small>
            </div>
          ))}
        </div>
        <button type="button" className="context-primary" onClick={() => navigateTo('#/research')}>
          查看研究轨迹
          <ArrowRight size={15} />
        </button>
      </section>

      <section className="context-section">
        <div className="context-title">
          <span><ShieldCheck size={16} /> Risk guardrails</span>
        </div>
        <div className="guardrail-row">
          <span>单标的最大敞口</span><strong>25%</strong>
          <i><b style={{ width: '72%' }} /></i>
        </div>
        <div className="guardrail-row">
          <span>单笔最大损失</span><strong>1.0%</strong>
          <i><b style={{ width: '48%' }} /></i>
        </div>
        <div className="guardrail-row">
          <span>组合最大回撤</span><strong>12%</strong>
          <i><b style={{ width: '27%' }} /></i>
        </div>
      </section>

      <section className="context-section action-queue">
        <div className="context-title">
          <span><Clock3 size={16} /> Action queue</span>
          <span className="queue-count">3</span>
        </div>
        <button type="button" onClick={() => navigateTo('#/research')}>
          <CircleAlert size={16} />
          <span><strong>MU 研究等待证据覆盖检查</strong><small>8 min ago</small></span>
        </button>
        <button type="button" onClick={() => navigateTo('#/journal')}>
          <ShieldCheck size={16} />
          <span><strong>补全昨日 TSLA 交易复盘</strong><small>Due today</small></span>
        </button>
      </section>
    </aside>
  </div>
);

export default DashboardPage;
