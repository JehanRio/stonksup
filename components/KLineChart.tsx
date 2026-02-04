
import React from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { OHLC } from '../types';

interface KLineChartProps {
  data: OHLC[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Get original data from the payload of any bar
    const d = payload[0].payload;
    
    return (
      <div className="bg-white border border-slate-200 p-3 shadow-xl rounded-lg text-xs z-50">
        <p className="font-bold mb-2 text-slate-800 border-b pb-1">{label}</p>
        <div className="space-y-1">
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">开盘:</span> 
            <span className="font-mono font-medium">{d.open.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">收盘:</span> 
            <span className="font-mono font-medium">{d.close.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">最高:</span> 
            <span className="font-mono font-bold text-emerald-600">{d.high.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">最低:</span> 
            <span className="font-mono font-bold text-red-600">{d.low.toFixed(2)}</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between gap-6">
            <span className="text-slate-500">成交量:</span> 
            <span className="font-mono text-slate-600">{(d.volume / 1000).toFixed(0)}K</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const KLineChart: React.FC<KLineChartProps> = ({ data }) => {
  // Prep data: Recharts Bar can accept [min, max] as a dataKey value to render a range
  const chartData = data.map(item => ({
    ...item,
    isUp: item.close >= item.open,
    // Body range: [min(open, close), max(open, close)]
    body: [Math.min(item.open, item.close), Math.max(item.open, item.close)],
    // Wick range: [low, high]
    wick: [item.low, item.high]
  }));

  // Adjust bar width based on density
  const bodySize = chartData.length > 50 ? 4 : chartData.length > 20 ? 10 : 16;
  const wickSize = 1.5;

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="time" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            minTickGap={25}
          />
          <YAxis 
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            domain={['auto', 'auto']}
            tickFormatter={(val) => val.toFixed(1)}
          />
          <Tooltip 
            content={<CustomTooltip />} 
            cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
            allowEscapeViewBox={{ x: true, y: true }}
          />
          
          {/* Shadow/Wick (rendered as a very thin bar) */}
          <Bar dataKey="wick" barSize={wickSize} isAnimationActive={false}>
            {chartData.map((entry, index) => (
              <Cell 
                key={`wick-${index}`} 
                fill={entry.isUp ? '#10b981' : '#ef4444'} 
              />
            ))}
          </Bar>

          {/* Candle Body */}
          <Bar dataKey="body" barSize={bodySize} isAnimationActive={false}>
            {chartData.map((entry, index) => (
              <Cell 
                key={`body-${index}`} 
                fill={entry.isUp ? '#10b981' : '#ef4444'} 
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default KLineChart;
