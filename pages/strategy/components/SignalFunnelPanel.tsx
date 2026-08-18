import React from 'react';
import { Activity, ArrowRight, Crosshair, ShieldAlert } from 'lucide-react';

import type {
  SignalDiagnostics,
  SignalRuleDiagnostic,
} from '../../../services/backtestApi';
import '../../../styles/strategy-lab-signal-funnel.css';


type Props = {
  diagnostics: SignalDiagnostics;
  eyebrow: string;
  title?: string;
  scopeLabel?: string;
};

const formatRate = (value: number) => `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;

const conclusionCopy = (diagnostics: SignalDiagnostics) => ({
  no_evaluable_entry_bars: '数据窗口不足，入场条件尚未进入可计算状态。',
  entry_conditions_never_aligned: diagnostics.bottleneck
    ? `没有形成完整入场信号；最稀缺条件是“${diagnostics.bottleneck.expression}”。`
    : '没有形成完整入场信号。',
  orders_generated: `完整入场信号已生成 ${diagnostics.entryOrders} 笔买入订单。`,
}[diagnostics.conclusion]);

const RuleFunnel = ({
  label,
  rule,
  bottleneckIndex,
}: {
  label: string;
  rule: SignalRuleDiagnostic;
  bottleneckIndex?: number;
}) => (
  <div className="signal-funnel-rule">
    <header>
      <div>
        <span>{label}</span>
        <strong>{rule.mode === 'all' ? '全部同时成立' : '任一条件成立'}</strong>
      </div>
      <b>{rule.matchedBars} / {rule.evaluatedBars}</b>
    </header>

    <div className="signal-condition-list">
      {rule.conditions.map((condition) => {
        const isBottleneck = condition.index === bottleneckIndex;
        const expressionLabel = condition.expressionVariants.length > 1
          ? `${condition.expression} 等 ${condition.expressionVariants.length} 组窗口参数`
          : condition.expression;
        return (
          <div
            className={`signal-condition-row ${isBottleneck ? 'is-bottleneck' : ''}`}
            key={`${label}-${condition.index}`}
            title={condition.expressionVariants.join('\n') || condition.sourceText || condition.expression}
          >
            <div className="signal-condition-copy">
              <span>C{condition.index + 1}</span>
              <strong>{expressionLabel}</strong>
              {isBottleneck && <small>BOTTLENECK</small>}
            </div>
            <div className="signal-condition-meter" aria-hidden="true">
              <i style={{ width: `${Math.max(0, Math.min(100, condition.matchRate * 100))}%` }} />
            </div>
            <div className="signal-condition-value">
              <strong>{condition.matchedBars}</strong>
              <span>/ {condition.evaluatedBars}</span>
              <small>{formatRate(condition.matchRate)}</small>
            </div>
          </div>
        );
      })}
    </div>

    <div className="signal-joint-row">
      <Crosshair size={17} />
      <span>组合命中</span>
      <strong>{rule.matchedBars}</strong>
      <small>{formatRate(rule.matchRate)}</small>
    </div>
  </div>
);


const SignalFunnelPanel: React.FC<Props> = ({
  diagnostics,
  eyebrow,
  title = '条件命中与订单转化',
  scopeLabel = '完整回测区间',
}) => (
  <section className="signal-funnel-section">
    <div className="strategy-result-heading signal-funnel-heading">
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      <span>{scopeLabel}</span>
    </div>

    <div className="signal-funnel-flow" aria-label="信号诊断摘要">
      <div><span>入场可计算</span><strong>{diagnostics.entry.evaluatedBars}</strong></div>
      <ArrowRight size={17} />
      <div><span>联合命中</span><strong>{diagnostics.entry.matchedBars}</strong></div>
      <ArrowRight size={17} />
      <div><span>买入订单</span><strong>{diagnostics.entryOrders}</strong></div>
      <ArrowRight size={17} />
      <div>
        <span>卖出 / 止损 / 期末</span>
        <strong>{diagnostics.exitOrders} / {diagnostics.protectiveStops} / {diagnostics.forcedExits}</strong>
      </div>
    </div>

    <div className="signal-funnel-rules">
      <RuleFunnel
        label="ENTRY CONDITIONS"
        rule={diagnostics.entry}
        bottleneckIndex={diagnostics.bottleneck?.side === 'entry'
          ? diagnostics.bottleneck.conditionIndex
          : undefined}
      />
      <RuleFunnel label="EXIT CONDITIONS" rule={diagnostics.exit} />
    </div>

    <div className={`signal-funnel-conclusion is-${diagnostics.conclusion}`}>
      {diagnostics.conclusion === 'orders_generated'
        ? <Activity size={18} />
        : <ShieldAlert size={18} />}
      <strong>诊断结论</strong>
      <span>{conclusionCopy(diagnostics)}</span>
    </div>
  </section>
);


export default SignalFunnelPanel;
