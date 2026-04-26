import React, { useEffect, useMemo, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { OHLC } from '../../types';

interface LightweightFullChartProps {
  data: OHLC[];
  height?: number;
}

const MOVING_AVERAGE_PERIODS = [5, 10, 20, 60, 200] as const;

const maColors: Record<(typeof MOVING_AVERAGE_PERIODS)[number], string> = {
  5: '#f23645',
  10: '#ff9800',
  20: '#00bcd4',
  60: '#2962ff',
  200: '#8e3cf7',
};

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

const LightweightFullChart: React.FC<LightweightFullChartProps> = ({ data, height = 760 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time, any, any, any> | null>(null);
  const maSeriesRefs = useRef<ISeriesApi<'Line', Time, any, any, any>[]>([]);

  const chartData = useMemo(() => {
    return data
      .filter((item) => Number.isFinite(item.open) && Number.isFinite(item.high) && Number.isFinite(item.low) && Number.isFinite(item.close))
      .map((item) => ({
        time: (item.timestamp ?? Math.floor(Date.now() / 1000)) as UTCTimestamp,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }));
  }, [data]);

  const movingAverageData = useMemo(() => {
    return MOVING_AVERAGE_PERIODS.map((period) => {
      const values = calculateMovingAverage(data, period);
      return values
        .map((value, index) =>
          value === null
            ? null
            : {
                time: (data[index]?.timestamp ?? Math.floor(Date.now() / 1000)) as UTCTimestamp,
                value,
              },
        )
        .filter((item): item is { time: UTCTimestamp; value: number } => item !== null);
    });
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: 'rgba(203, 213, 225, 0.78)',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.06)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255,255,255,0.24)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#2b3139',
        },
        horzLine: {
          color: 'rgba(255,255,255,0.24)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#2b3139',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: {
          top: 0.08,
          bottom: 0.08,
        },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        rightOffset: 8,
        barSpacing: 12,
        minBarSpacing: 4,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      priceLineVisible: true,
      lastValueVisible: true,
    });

    const maSeries = MOVING_AVERAGE_PERIODS.map((period) =>
      chart.addSeries(LineSeries, {
        color: maColors[period],
        lineWidth: period === 200 ? 2 : 1.5,
        crosshairMarkerVisible: false,
        lastValueVisible: true,
        priceLineVisible: false,
      }),
    );

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    maSeriesRefs.current = maSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height: observedHeight } = entry.contentRect;
      chart.applyOptions({ width, height: Math.max(observedHeight, height) });
      chart.timeScale().fitContent();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      maSeries.forEach((series) => chart.removeSeries(series));
      chart.removeSeries(candleSeries);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      maSeriesRefs.current = [];
    };
  }, [height]);

  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;

    candleSeriesRef.current.setData(chartData);
    maSeriesRefs.current.forEach((series, index) => {
      series.setData(movingAverageData[index] ?? []);
    });

    chartRef.current.timeScale().fitContent();
  }, [chartData, movingAverageData]);

  return <div ref={containerRef} className="h-full w-full" style={{ height }} />;
};

export default LightweightFullChart;
