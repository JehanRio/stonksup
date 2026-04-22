import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  Bar,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { OHLC } from '../types';

interface KLineChartProps {
  data: OHLC[];
}

type DragState = {
  startClientX: number;
  startIndex: number;
  endIndex: number;
};

const MOVING_AVERAGE_PERIODS = [5, 10, 20, 60, 200] as const;
const MIN_VISIBLE_POINTS = 20;

const MOVING_AVERAGE_COLORS: Record<(typeof MOVING_AVERAGE_PERIODS)[number], string> = {
  5: '#2563eb',
  10: '#f59e0b',
  20: '#8b5cf6',
  60: '#14b8a6',
  200: '#64748b',
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const calculateMovingAverage = (rows: OHLC[], period: number): Array<number | null> => {
  let rollingSum = 0;

  return rows.map((row, index) => {
    rollingSum += row.close;

    if (index >= period) {
      rollingSum -= rows[index - period].close;
    }

    if (index < period - 1) {
      return null;
    }

    return Number((rollingSum / period).toFixed(4));
  });
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!(active && payload?.length)) return null;

  const point = payload[0].payload;

  return (
    <div className="min-w-[180px] rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-2xl backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
        <span className="font-semibold text-slate-800">{label}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${point.isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {point.isUp ? 'Bullish' : 'Bearish'}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-6">
          <span className="text-slate-500">Open</span>
          <span className="font-mono text-slate-700">{point.open.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-slate-500">Close</span>
          <span className="font-mono text-slate-700">{point.close.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-slate-500">High</span>
          <span className="font-mono text-emerald-600">{point.high.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-slate-500">Low</span>
          <span className="font-mono text-rose-600">{point.low.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-6 border-t border-slate-100 pt-2">
          <span className="text-slate-500">Volume</span>
          <span className="font-mono text-slate-700">{(point.volume / 1000).toFixed(0)}K</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-2">
          {MOVING_AVERAGE_PERIODS.map((period) => {
            const value = point[`ma${period}`];
            if (value === null || value === undefined) return null;

            return (
              <div key={period} className="flex items-center justify-between gap-2">
                <span className="text-slate-500">{`MA${period}`}</span>
                <span className="font-mono font-medium" style={{ color: MOVING_AVERAGE_COLORS[period] }}>
                  {value.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const KLineChart: React.FC<KLineChartProps> = ({ data }) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const frameRef = useRef<number | null>(null);
  const queuedRangeRef = useRef<{ start: number; end: number } | null>(null);

  const [range, setRange] = useState({ start: 0, end: Math.max(data.length - 1, 0) });
  const [isDragging, setIsDragging] = useState(false);

  const chartData = useMemo(() => {
    const movingAverages = MOVING_AVERAGE_PERIODS.reduce((acc, period) => {
      acc[period] = calculateMovingAverage(data, period);
      return acc;
    }, {} as Record<(typeof MOVING_AVERAGE_PERIODS)[number], Array<number | null>>);

    return data.map((row, index) => ({
      ...row,
      body: [Math.min(row.open, row.close), Math.max(row.open, row.close)],
      wick: [row.low, row.high],
      isUp: row.close >= row.open,
      ma5: movingAverages[5][index],
      ma10: movingAverages[10][index],
      ma20: movingAverages[20][index],
      ma60: movingAverages[60][index],
      ma200: movingAverages[200][index],
      navigatorClose: row.close,
    }));
  }, [data]);

  const maxIndex = Math.max(chartData.length - 1, 0);
  const maxVisiblePoints = Math.max(chartData.length, 1);
  const minVisiblePoints = Math.min(MIN_VISIBLE_POINTS, maxVisiblePoints);

  useEffect(() => {
    setRange({ start: 0, end: maxIndex });
    dragStateRef.current = null;
    setIsDragging(false);
  }, [maxIndex]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const safeRange = useMemo(() => {
    const start = clamp(range.start, 0, maxIndex);
    const end = clamp(range.end, start, maxIndex);
    return { start, end };
  }, [maxIndex, range.end, range.start]);

  const visibleData = useMemo(
    () => chartData.slice(safeRange.start, safeRange.end + 1),
    [chartData, safeRange.end, safeRange.start],
  );

  const visiblePoints = safeRange.end - safeRange.start + 1;
  const bodySize = visibleData.length > 80 ? 3 : visibleData.length > 40 ? 6 : 11;

  const scheduleRangeUpdate = (nextStart: number, nextEnd: number) => {
    if (chartData.length === 0) return;

    const width = nextEnd - nextStart + 1;
    const normalizedWidth = clamp(width, minVisiblePoints, maxVisiblePoints);
    const clampedStart = clamp(nextStart, 0, Math.max(maxIndex - normalizedWidth + 1, 0));
    const clampedEnd = Math.min(clampedStart + normalizedWidth - 1, maxIndex);
    queuedRangeRef.current = { start: clampedStart, end: clampedEnd };

    if (frameRef.current !== null) return;

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const nextRange = queuedRangeRef.current;
      queuedRangeRef.current = null;
      if (!nextRange) return;

      setRange((prev) => {
        if (prev.start === nextRange.start && prev.end === nextRange.end) {
          return prev;
        }
        return nextRange;
      });
    });
  };

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    if (chartData.length <= minVisiblePoints) return;

    event.preventDefault();

    const container = viewportRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width || 1);
    const ratio = rect.width > 0 ? x / rect.width : 0.5;
    const direction = event.deltaY > 0 ? 1 : -1;
    const step = Math.max(5, Math.round(visiblePoints * 0.12));
    const nextVisiblePoints = clamp(visiblePoints + direction * step, minVisiblePoints, maxVisiblePoints);

    if (nextVisiblePoints === visiblePoints) return;

    const anchorIndex = safeRange.start + Math.round((visiblePoints - 1) * ratio);
    const nextStart = Math.round(anchorIndex - (nextVisiblePoints - 1) * ratio);
    scheduleRangeUpdate(nextStart, nextStart + nextVisiblePoints - 1);
  };

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (chartData.length <= visiblePoints) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startClientX: event.clientX,
      startIndex: safeRange.start,
      endIndex: safeRange.end,
    };
    setIsDragging(true);
  };

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    const dragState = dragStateRef.current;
    const container = viewportRef.current;
    if (!dragState || !container) return;

    const pointsPerPixel = visiblePoints / Math.max(container.clientWidth, 1);
    const movedPoints = Math.round((event.clientX - dragState.startClientX) * pointsPerPixel);
    const nextStart = dragState.startIndex - movedPoints;
    const nextEnd = dragState.endIndex - movedPoints;
    scheduleRangeUpdate(nextStart, nextEnd);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  };

  const handleBrushChange = (next: { startIndex?: number; endIndex?: number }) => {
    if (typeof next.startIndex !== 'number' || typeof next.endIndex !== 'number') return;
    scheduleRangeUpdate(next.startIndex, next.endIndex);
  };

  return (
    <div className="w-full rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.10),_transparent_36%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-[0_28px_90px_-50px_rgba(15,23,42,0.55)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white">TradingView-style</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500">Drag chart to pan</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500">Wheel to zoom</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500">Double-click to reset</span>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-400">
          Window {visibleData.length}/{chartData.length || 0}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {MOVING_AVERAGE_PERIODS.map((period) => (
          <div
            key={period}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-[11px] text-slate-600 shadow-sm"
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: MOVING_AVERAGE_COLORS[period] }}></span>
            <span>{`MA${period}`}</span>
          </div>
        ))}
      </div>

      <div
        ref={viewportRef}
        className={`h-[420px] rounded-[24px] border border-slate-200 bg-white/90 px-3 pt-3 shadow-inner shadow-slate-100 ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDoubleClick={() => scheduleRangeUpdate(0, maxIndex)}
        style={{ touchAction: 'none' }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visibleData} margin={{ top: 8, right: 18, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} minTickGap={24} />
            <YAxis
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              domain={['auto', 'auto']}
              tickFormatter={(value) => value.toFixed(1)}
            />
            {!isDragging && (
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1 }}
                allowEscapeViewBox={{ x: true, y: true }}
              />
            )}

            {MOVING_AVERAGE_PERIODS.map((period) => (
              <Line
                key={period}
                type="monotone"
                dataKey={`ma${period}`}
                stroke={MOVING_AVERAGE_COLORS[period]}
                strokeWidth={1.6}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}

            <Bar dataKey="wick" barSize={1.5} isAnimationActive={false}>
              {visibleData.map((point, index) => (
                <Cell key={`wick-${index}`} fill={point.isUp ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>

            <Bar dataKey="body" barSize={bodySize} isAnimationActive={false}>
              {visibleData.map((point, index) => (
                <Cell key={`body-${index}`} fill={point.isUp ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-white/80">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          <span>Time Navigator</span>
          <span>Drag handles or selection to adjust range</span>
        </div>
        <div className="px-2 py-2">
          <ResponsiveContainer width="100%" height={88}>
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="tv-navigator-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.08" />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="navigatorClose" stroke="#60a5fa" fill="url(#tv-navigator-fill)" isAnimationActive={false} />
              <Brush
                dataKey="time"
                height={36}
                travellerWidth={12}
                stroke="#3b82f6"
                fill="#eff6ff"
                startIndex={safeRange.start}
                endIndex={safeRange.end}
                onChange={handleBrushChange}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default KLineChart;
