'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  /** Plot on a second axis on the right (for series of a different scale). */
  right?: boolean;
  /** Smaller is better (e.g. search position): flips the axis. */
  reversed?: boolean;
}

const fmtDay = (d: string) => {
  const [, m, day] = d.split('-');
  return `${Number(day)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}`;
};

/** Daily line chart. Data rows: { day: 'YYYY-MM-DD', [series.key]: number | null }. */
export default function TrendChart({
  data, series, height = 260,
}: { data: Array<Record<string, string | number | null>>; series: TrendSeries[]; height?: number }) {
  const hasRight = series.some(s => s.right);
  const points = (key: string) => data.filter(d => d[key] !== null && d[key] !== undefined).length;
  const rightReversed = series.some(s => s.right && s.reversed);
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: hasRight ? 0 : 12, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#9CA3AF" strokeOpacity={0.2} vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={fmtDay}
            tick={{ fontSize: 11, fill: '#6B7280' }}
            tickLine={false}
            axisLine={{ stroke: '#9CA3AF', strokeOpacity: 0.4 }}
            minTickGap={24}
          />
          <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} />
          {hasRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              reversed={rightReversed}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickLine={false}
              axisLine={false}
            />
          )}
          <Tooltip
            labelFormatter={(d: string) => fmtDay(d)}
            formatter={(v: number) => (Number.isInteger(v) ? v : v.toFixed(1))}
            contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map(s => (
            <Line
              key={s.key}
              yAxisId={s.right ? 'right' : 'left'}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              // Dots on short ranges, and always when a series has few points
              // (a single point would otherwise be invisible).
              dot={data.length <= 31 || points(s.key) <= 3 ? { r: data.length <= 31 ? 2.5 : 3 } : false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
