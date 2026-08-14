import React from 'react';
import {
  Braces,
  CheckCircle2,
  Clock3,
  Database,
  Fingerprint,
  GitBranch,
} from 'lucide-react';

import type {
  StrategyCompilation,
  StrategyIrCondition,
  StrategyIrOperand,
} from '../../../services/backtestApi';
import '../../../styles/strategy-lab-ir.css';


const OPERATOR_LABELS: Record<StrategyIrCondition['operator'], string> = {
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
  crosses_above: '上穿',
  crosses_below: '下穿',
};

const formatOperand = (operand: StrategyIrOperand) => {
  if (operand.source === 'constant') return `${operand.value}`;
  const reference = operand.key?.toUpperCase() || 'UNKNOWN';
  return operand.offset === -1 ? `${reference}[前一日]` : reference;
};

const formatCondition = (condition: StrategyIrCondition) => {
  const tolerance = condition.toleranceBps
    ? ` + ${condition.toleranceBps} bps 容差`
    : '';
  return `${formatOperand(condition.left)} ${OPERATOR_LABELS[condition.operator]} ${formatOperand(condition.right)}${tolerance}`;
};


type Props = {
  compilation: StrategyCompilation;
};


const StrategyIrPreview: React.FC<Props> = ({ compilation }) => {
  const { strategyIr, manifest } = compilation;
  const rawIr = JSON.stringify(strategyIr, null, 2);

  return (
    <section className="strategy-ir-preview" aria-label="Strategy IR 结构预览">
      <header className="strategy-ir-header">
        <div>
          <span className="strategy-ir-kicker"><GitBranch size={15} /> EXECUTABLE IR</span>
          <strong>{strategyIr.version}</strong>
        </div>
        <span className="strategy-ir-valid"><CheckCircle2 size={15} /> 已校验</span>
      </header>

      <div className="strategy-ir-dependencies">
        <span><Database size={15} /> {strategyIr.symbol} / {strategyIr.timeframe.toUpperCase()}</span>
        {strategyIr.indicators.map((indicator) => (
          <code key={indicator.id}>
            {indicator.id} = {indicator.kind.toUpperCase()}({indicator.source}, {indicator.period})
          </code>
        ))}
      </div>

      <div className="strategy-ir-rule-grid">
        {([
          ['ENTRY', strategyIr.entry],
          ['EXIT', strategyIr.exit],
        ] as const).map(([label, rule]) => (
          <article key={label} className={`strategy-ir-rule is-${label.toLowerCase()}`}>
            <div className="strategy-ir-rule-title">
              <span>{label}</span>
              <small>{rule.when.mode === 'all' ? '全部满足' : '任一满足'}</small>
            </div>
            <div className="strategy-ir-condition-list">
              {rule.when.conditions.map((condition, index) => (
                <React.Fragment key={`${label}-${formatCondition(condition)}`}>
                  {index > 0 && <b>{rule.when.mode === 'all' ? 'AND' : 'OR'}</b>}
                  <code>{formatCondition(condition)}</code>
                </React.Fragment>
              ))}
            </div>
          </article>
        ))}
      </div>

      <footer className="strategy-ir-manifest">
        <span><Clock3 size={14} /> 预热 {manifest.warmupBars} bars</span>
        <span><Fingerprint size={14} /> {manifest.irHash.slice(0, 12)}</span>
        <span>{strategyIr.execution.signalAt} 信号 / {strategyIr.execution.fillAt.replace('_', ' ')} 成交</span>
      </footer>

      <details className="strategy-ir-raw">
        <summary><Braces size={15} /> 查看原始 IR</summary>
        <pre>{rawIr}</pre>
      </details>
    </section>
  );
};


export default StrategyIrPreview;
