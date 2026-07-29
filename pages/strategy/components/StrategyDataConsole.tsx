import React from 'react';
import { CalendarDays, Database, History } from 'lucide-react';

import type {
  BacktestDataConfig,
  BacktestRunSummary,
  MarketDataCapability,
} from '../../../services/backtestApi';
import '../../../styles/strategy-lab-phase2.css';
import '../../../styles/strategy-lab-phase2-mobile.css';


const formatPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;


type Props = {
  assetSymbol: string;
  config: BacktestDataConfig;
  capability: MarketDataCapability | null;
  history: BacktestRunSummary[];
  onChange: <Key extends keyof BacktestDataConfig>(
    key: Key,
    value: BacktestDataConfig[Key],
  ) => void;
};


const StrategyDataConsole: React.FC<Props> = ({
  assetSymbol,
  config,
  capability,
  history,
  onChange,
}) => {
  const realReady = Boolean(capability?.configured);
  const benchmarkOptions = Array.from(
    new Set(['SPY', 'QQQ', assetSymbol.toUpperCase()]),
  );

  return (
    <>
      <section className="strategy-data-console phase2" aria-label="回测数据设置">
        <div className="strategy-data-title">
          <span><Database size={17} /> DATASET</span>
          <strong>{config.mode === 'real' ? '真实复权日线' : '确定性演示行情'}</strong>
          <small className={realReady ? 'is-ready' : 'is-missing'}>
            {realReady ? 'Twelve Data 已连接' : '真实数据密钥未配置'}
          </small>
        </div>

        <div className="strategy-mode-switch" aria-label="数据模式">
          <button
            type="button"
            className={config.mode === 'demo' ? 'is-active' : ''}
            onClick={() => onChange('mode', 'demo')}
          >
            演示
          </button>
          <button
            type="button"
            className={config.mode === 'real' ? 'is-active' : ''}
            onClick={() => onChange('mode', 'real')}
            disabled={!realReady}
            title={realReady ? '使用真实行情' : '服务器需要配置 Twelve Data API Key'}
          >
            真实
          </button>
        </div>

        <label className="strategy-date-field strategy-benchmark-field">
          <span>独立基准</span>
          <select
            value={config.benchmarkSymbol}
            onChange={(event) => onChange('benchmarkSymbol', event.target.value)}
          >
            {benchmarkOptions.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol === assetSymbol.toUpperCase()
                  ? `${symbol} · 标的持有`
                  : symbol}
              </option>
            ))}
          </select>
        </label>

        <label className="strategy-date-field">
          <span><CalendarDays size={14} /> 起始日期</span>
          <input
            type="date"
            value={config.startDate}
            disabled={config.mode === 'demo'}
            onChange={(event) => onChange('startDate', event.target.value)}
          />
        </label>

        <label className="strategy-date-field">
          <span><CalendarDays size={14} /> 结束日期</span>
          <input
            type="date"
            value={config.endDate}
            disabled={config.mode === 'demo'}
            onChange={(event) => onChange('endDate', event.target.value)}
          />
        </label>

        <div className="strategy-adjustment-readout">
          <span>PRICE BASIS</span>
          <strong>{config.mode === 'real' ? 'FULLY ADJUSTED' : 'SYNTHETIC'}</strong>
          <small>{config.mode === 'real' ? '拆股 + 分红复权' : '仅用于体验流程'}</small>
        </div>

        <label className="strategy-refresh-toggle">
          <input
            type="checkbox"
            checked={config.refresh}
            disabled={config.mode === 'demo'}
            onChange={(event) => onChange('refresh', event.target.checked)}
          />
          <span>运行前刷新</span>
        </label>
      </section>

      {history.length > 0 && (
        <section className="strategy-history-strip" aria-label="最近回测">
          <div className="strategy-history-label">
            <History size={17} />
            <span>RECENT RUNS</span>
          </div>
          <div className="strategy-history-list">
            {history.slice(0, 4).map((run) => (
              <article key={run.runId}>
                <div>
                  <strong>{run.symbol}</strong>
                  <span>vs {run.benchmarkSymbol}</span>
                </div>
                <b className={run.excessReturn >= 0 ? 'positive' : 'negative'}>
                  {formatPercent(run.excessReturn)}
                </b>
                <small>
                  超额 / {run.barCount} bars / {run.adjustment}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
};


export default StrategyDataConsole;
