import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
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

type ChartTheme = 'light' | 'dark';
type ChartMode = 'line' | 'candles';

interface KLineChartProps {
  data: OHLC[];
  theme?: ChartTheme;
  mode?: ChartMode;
  height?: number;
  showBrush?: boolean;
  showLegend?: boolean;
  shell?: 'card' | 'flat';
}

type DragState = {
  startClientX: number;
  startIndex: number;
  endIndex: number;
};

const MOVING_AVERAGE_PERIODS = [5, 10, 20, 60, 200] as const;
const MIN_VISIBLE_POINTS = 20;

const themeTokens = {
  light: {
    bg: 'bg-white',
    border: 'border-slate-200',
    grid: '#e2e8f0',
    axis: '#94a3b8',
    text: 'text-slate-500',
    title: 'text-slate-900',
    subtle: 'bg-slate-50',
    areaLine: '#0f766e',
    areaFillA: '#14b8a6',
    areaFillB: '#ccfbf1',
    closeLine: '#0f172a',
    up: '#14b8a6',
    down: '#f43f5e',
    shell: 'bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]',
  },
  dark: {
    bg: 'bg-[#0b0e11]',
    border: 'border-white/10',
    grid: 'rgba(255,255,255,0.08)',
    axis: 'rgba(255,255,255,0.38)',
    text: 'text-white/55',
    title: 'text-white',
    subtle: 'bg-white/5',
    areaLine: '#00c2a8',
    areaFillA: '#00c2a8',
    areaFillB: 'rgba(0,194,168,0.02)',
    closeLine: '#cbd5e1',
    up: '#00c2a8',
    down: '#ff4d5a',
    shell: 'bg-[linear-gradient(180deg,#101215_0%,#090b0d_100%)] shadow-[0_24px_90px_-50px_rgba(0,0,0,0.8)]',
  },
} as const;

const movingAverageColors: Record<(typeof MOVING_AVERAGE_PERIODS)[number], string> = {
  5: '#dc2626',
  10: '#d97706',
  20: '#06b6d4',
  60: '#2563eb',
  200: '#7c3aed',
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

const ChartTooltip = ({ active, payload, label, theme }: any) => {
  if (!(active && payload?.length)) return null;

  const point = payload[0].payload;
  const isDark = theme === 'dark';

  return (
    <div
      className={`min-w-[180px] rounded-2xl border p-3 text-xs shadow-2xl ${
        isDark ? 'border-white/10 bg-[#12161b]/95 text-white backdrop-blur-sm' : 'border-slate-200 bg-white/95 text-slate-900 backdrop-blur-sm'
      }`}
    >
      <div className={`mb-2 flex items-center justify-between border-b pb-2 ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
        <span className="font-semibold">{label}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${point.isUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
          {point.isUp ? 'Up' : 'Down'}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-6">
          <span className={isDark ? 'text-white/55' : 'text-slate-500'}>Open</span>
          <span className="font-mono">{point.open.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className={isDark ? 'text-white/55' : 'text-slate-500'}>High</span>
          <span className="font-mono">{point.high.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className={isDark ? 'text-white/55' : 'text-slate-500'}>Low</span>
          <span className="font-mono">{point.low.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className={isDark ? 'text-white/55' : 'text-slate-500'}>Close</span>
          <span className="font-mono">{point.close.toFixed(2)}</span>
        </div>
        <div className={`grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-2 ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
          {MOVING_AVERAGE_PERIODS.map((period) => {
            const value = point[`ma${period}`];
            if (value === null || value === undefined) return null;

            return (
              <div key={period} className="flex items-center justify-between gap-2">
                <span className={isDark ? 'text-white/55' : 'text-slate-500'}>{`MA${period}`}</span>
                <span className="font-mono font-medium" style={{ color: movingAverageColors[period] }}>
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

const KLineChart: React.FC<KLineChartProps> = ({
  data,
  theme = 'light',
  mode = 'line',
  height = 480,
  showBrush = true,
  showLegend = true,
  shell = 'card',
}) => {
  const tokens = themeTokens[theme];
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
      isUp: row.close >= row.open,
      body: [Math.min(row.open, row.close), Math.max(row.open, row.close)],
      wick: [row.low, row.high],
      navigatorClose: row.close,
      ma5: movingAverages[5][index],
      ma10: movingAverages[10][index],
      ma20: movingAverages[20][index],
      ma60: movingAverages[60][index],
      ma200: movingAverages[200][index],
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
        if (prev.start === nextRange.start && prev.end === nextRange.end) return prev;
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
    const step = Math.max(4, Math.round(visiblePoints * 0.12));
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
    scheduleRangeUpdate(dragState.startIndex - movedPoints, dragState.endIndex - movedPoints);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  };

  const bodySize = visibleData.length > 90 ? 3 : visibleData.length > 45 ? 6 : 10;

  const commonAxis = {
    axisLine: false,
    tickLine: false,
    tick: { fontSize: 10, fill: tokens.axis },
  };

  const outerClassName =
    shell === 'flat'
      ? 'h-full border-0 bg-transparent p-0 shadow-none'
      : `rounded-[28px] border p-4 ${tokens.border} ${tokens.shell}`;

  const viewportClassName =
    shell === 'flat'
      ? `${mode === 'candles' ? 'cursor-grab' : 'cursor-crosshair'} h-full select-none rounded-none border-0 bg-transparent px-0 pt-0`
      : `${mode === 'candles' ? 'cursor-grab' : 'cursor-crosshair'} select-none rounded-[22px] border px-2 pt-2 ${tokens.border} ${tokens.bg}`;

  return (
    <div className={outerClassName}>
      {showLegend && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${tokens.border} ${tokens.bg} ${tokens.text}`}>
              {mode === 'candles' ? 'Candles' : 'Price'}
            </span>
            {mode === 'candles' &&
              MOVING_AVERAGE_PERIODS.map((period) => (
                <span
                  key={period}
                  className={`rounded-full border px-3 py-1 text-[11px] ${tokens.border} ${tokens.bg} ${tokens.text}`}
                >
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: movingAverageColors[period] }}></span>
                  {`MA${period}`}
                </span>
              ))}
          </div>
          <span className={`text-[11px] ${tokens.text}`}>Window {visibleData.length}/{chartData.length || 0}</span>
        </div>
      )}

      <div
        ref={viewportRef}
        className={viewportClassName}
        style={{ height, touchAction: 'none' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDoubleClick={() => scheduleRangeUpdate(0, maxIndex)}
      >
        <ResponsiveContainer width="100%" height="100%">
          {mode === 'line' ? (
            <AreaChart data={visibleData} margin={{ top: 10, right: 18, left: -8, bottom: showBrush ? 24 : 0 }}>
              <defs>
                <linearGradient id={`area-fill-${theme}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tokens.areaFillA} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={tokens.areaFillB} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tokens.grid} />
              <XAxis dataKey="time" minTickGap={24} {...commonAxis} />
              <YAxis orientation="right" domain={['auto', 'auto']} tickFormatter={(value) => value.toFixed(1)} {...commonAxis} />
              {!isDragging && <Tooltip content={<ChartTooltip theme={theme} />} cursor={{ stroke: tokens.axis, strokeDasharray: '4 4' }} />}
              <Area type="monotone" dataKey="close" stroke={tokens.areaLine} strokeWidth={2.2} fill={`url(#area-fill-${theme})`} isAnimationActive={false} />
            </AreaChart>
          ) : (
            <ComposedChart data={visibleData} margin={{ top: 10, right: 18, left: -8, bottom: showBrush ? 24 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tokens.grid} />
              <XAxis dataKey="time" minTickGap={24} {...commonAxis} />
              <YAxis orientation="right" domain={['auto', 'auto']} tickFormatter={(value) => value.toFixed(1)} {...commonAxis} />
              {!isDragging && <Tooltip content={<ChartTooltip theme={theme} />} cursor={{ stroke: tokens.axis, strokeDasharray: '4 4' }} />}
              {MOVING_AVERAGE_PERIODS.map((period) => (
                <Line
                  key={period}
                  type="monotone"
                  dataKey={`ma${period}`}
                  stroke={movingAverageColors[period]}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
              <Bar dataKey="wick" barSize={1.5} isAnimationActive={false}>
                {visibleData.map((point, index) => (
                  <Cell key={`wick-${index}`} fill={point.isUp ? tokens.up : tokens.down} />
                ))}
              </Bar>
              <Bar dataKey="body" barSize={bodySize} isAnimationActive={false}>
                {visibleData.map((point, index) => (
                  <Cell key={`body-${index}`} fill={point.isUp ? tokens.up : tokens.down} />
                ))}
              </Bar>
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      {showBrush && chartData.length > minVisiblePoints && (
        <div className={`mt-4 overflow-hidden rounded-[18px] border ${tokens.border} ${tokens.bg}`}>
          <ResponsiveContainer width="100%" height={84}>
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id={`brush-fill-${theme}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tokens.areaFillA} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={tokens.areaFillB} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="navigatorClose" stroke={tokens.areaLine} fill={`url(#brush-fill-${theme})`} isAnimationActive={false} />
              <Brush
                dataKey="time"
                height={34}
                travellerWidth={10}
                startIndex={safeRange.start}
                endIndex={safeRange.end}
                stroke={tokens.areaLine}
                fill={theme === 'dark' ? '#111827' : '#eff6ff'}
                onChange={(next) => {
                  if (typeof next.startIndex !== 'number' || typeof next.endIndex !== 'number') return;
                  scheduleRangeUpdate(next.startIndex, next.endIndex);
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default KLineChart;
