import { useId, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/cn';
import { formatDate, formatDay, money, moneyCompact } from '@/lib/format';

export const chartColors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

export interface Series {
    key: string;
    label: string;
}

type Datum = Record<string, number | string>;

const axisTick = { fontSize: 11.5, fill: 'var(--ink-3)' };

function ChartTooltip({ active, payload, label, series, colors }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; series: Series[]; colors: string[] }) {
    if (!active || !payload?.length || !label) return null;

    return (
        <div className="min-w-40 rounded-2xl border border-line bg-surface px-3.5 py-3 text-[13px] shadow-pop">
            <p className="mb-1.5 text-xs text-ink-3">{formatDate(label)}</p>
            {series.map((item, index) => {
                const point = payload.find((p) => p.dataKey === item.key);
                if (!point) return null;
                return (
                    <div key={item.key} className="flex items-center justify-between gap-6 py-0.5">
                        <span className="flex items-center gap-2 text-ink-2">
                            <span className="size-2 rounded-full" style={{ background: colors[index] }} />
                            {item.label}
                        </span>
                        <span className="num font-medium text-ink">{money(point.value)}</span>
                    </div>
                );
            })}
        </div>
    );
}

/** Daily amounts over time. All series share one money axis. */
export function TrendChart({ data, series, height = 260 }: { data: Datum[]; series: Series[]; height?: number }) {
    return (
        <div>
            {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.label, color: chartColors[i] }))} className="mb-3 px-6" />}
            <ResponsiveContainer width="100%" height={height}>
                <AreaChart data={data} margin={{ top: 6, right: 24, bottom: 0, left: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="date" tickFormatter={formatDay} tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--line-strong)' }} tickMargin={8} minTickGap={36} />
                    <YAxis tickFormatter={(value: number) => moneyCompact(value)} tick={axisTick} tickLine={false} axisLine={false} width={56} />
                    <Tooltip content={<ChartTooltip series={series} colors={chartColors} />} cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }} isAnimationActive={false} />
                    {series.map((item, index) => (
                        <Area
                            key={item.key}
                            type="monotone"
                            dataKey={item.key}
                            stroke={chartColors[index]}
                            strokeWidth={2}
                            fill={index === 0 ? 'var(--accent)' : 'transparent'}
                            fillOpacity={index === 0 ? 0.45 : 0}
                            dot={false}
                            activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                            isAnimationActive={false}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

/**
 * One rounded bar per day. The best day is hatched so it stands out without
 * relying on colour alone.
 */
export function DailyBars({ data, dataKey, label, height = 250 }: { data: Datum[]; dataKey: string; label: string; height?: number }) {
    const id = useId().replace(/:/g, '');
    const peak = Math.max(...data.map((row) => Number(row[dataKey]) || 0));

    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: 8 }} barCategoryGap="28%">
                <defs>
                    <pattern id={`hatch-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <rect width="6" height="6" fill="var(--accent)" />
                        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--on-accent)" strokeOpacity="0.35" strokeWidth="2" />
                    </pattern>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 6" />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={axisTick} tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tickFormatter={(value: number) => moneyCompact(value)} tick={axisTick} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<ChartTooltip series={[{ key: dataKey, label }]} colors={['var(--accent-strong)']} />} cursor={{ fill: 'var(--sunken)', radius: 12 }} isAnimationActive={false} />
                <Bar dataKey={dataKey} radius={[999, 999, 999, 999]} maxBarSize={22} isAnimationActive={false}>
                    {data.map((row) => (
                        <Cell key={String(row.date)} fill={Number(row[dataKey]) === peak && peak > 0 ? `url(#hatch-${id})` : 'var(--accent)'} stroke="var(--accent-strong)" strokeWidth={1} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

/** A ticked ring that fills clockwise; the figure sits in the middle. */
export function Ring({ value, label, size = 176 }: { value: number; label?: string; size?: number }) {
    const clamped = Math.max(0, Math.min(100, value));
    const radius = 62;
    const circumference = 2 * Math.PI * radius;

    return (
        <div className="gauge relative mx-auto" style={{ width: size, height: size }}>
            <svg viewBox="0 0 160 160" className="size-full -rotate-90">
                <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--line-strong)" strokeWidth="13" strokeDasharray="2 5.2" />
                <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke="var(--accent-strong)"
                    strokeWidth="13"
                    strokeLinecap="round"
                    className="ring-arc"
                    strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
                />
            </svg>
            <div className="ring-figure absolute inset-0 grid place-content-center text-center">
                <span className="num text-[34px] leading-9 font-medium tracking-[-0.02em]">{value.toFixed(value >= 10 ? 0 : 1)}%</span>
                {label && <span className="mt-0.5 text-xs text-ink-3">{label}</span>}
            </div>
        </div>
    );
}

export function Legend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
    return (
        <div className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2', className)}>
            {items.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: item.color }} />
                    {item.label}
                </span>
            ))}
        </div>
    );
}

interface BarListProps {
    items: { name: string; amount: number; detail?: ReactNode }[];
    format?: (value: number) => string;
    empty?: string;
    /** Show each bar's share of the total next to its value. */
    share?: boolean;
    /** For use on the dark "inverse" card. */
    inverse?: boolean;
}

/** Ranked horizontal bars — the plainest way to compare a handful of categories. */
export function BarList({ items, format = money, empty = 'No data for this period.', share, inverse }: BarListProps) {
    const max = Math.max(...items.map((item) => item.amount), 0);
    const total = items.reduce((sum, item) => sum + item.amount, 0);

    if (items.length === 0 || max <= 0) return <p className={cn('px-6 py-8 text-center text-[13px]', inverse ? 'text-on-inverse/50' : 'text-ink-3')}>{empty}</p>;

    return (
        <ul className="space-y-3.5 px-6 pb-6">
            {items.map((item) => (
                <li key={item.name} className="bar-row">
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                        <span className={cn('min-w-0 truncate', inverse ? 'text-on-inverse' : 'text-ink')}>
                            {item.name}
                            {item.detail && <span className={cn('ml-2 text-xs', inverse ? 'text-on-inverse/50' : 'text-ink-3')}>{item.detail}</span>}
                        </span>
                        <span className={cn('num shrink-0 font-medium', inverse ? 'text-on-inverse' : 'text-ink')}>
                            {format(item.amount)}
                            {share && total > 0 && <span className={cn('ml-2 font-normal', inverse ? 'text-on-inverse/50' : 'text-ink-3')}>{((item.amount / total) * 100).toFixed(0)}%</span>}
                        </span>
                    </div>
                    <div className={cn('bar-track h-2 rounded-full', inverse ? 'bg-on-inverse/10' : 'bg-sunken')}>
                        <div className={cn('bar-fill h-full rounded-full bg-accent', !inverse && 'ring-1 ring-accent-strong ring-inset')} style={{ width: `${Math.max(2, (item.amount / max) * 100)}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}
