import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { isoDate, today } from '@/lib/format';
import { Select } from './Field';

export interface Range {
    preset: string;
    from: string;
    to: string;
}

const shift = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return isoDate(date);
};

const presets: Record<string, { label: string; range: () => [string, string] }> = {
    today: { label: 'Today', range: () => [today(), today()] },
    yesterday: { label: 'Yesterday', range: () => [shift(-1), shift(-1)] },
    '7d': { label: 'Last 7 days', range: () => [shift(-6), today()] },
    '30d': { label: 'Last 30 days', range: () => [shift(-29), today()] },
    month: {
        label: 'This month',
        range: () => {
            const now = new Date();
            return [isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), today()];
        },
    },
    'last-month': {
        label: 'Last month',
        range: () => {
            const now = new Date();
            return [isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), isoDate(new Date(now.getFullYear(), now.getMonth(), 0))];
        },
    },
    '90d': { label: 'Last 90 days', range: () => [shift(-89), today()] },
};

export function rangeFor(preset: string): Range {
    const [from, to] = presets[preset].range();
    return { preset, from, to };
}

export function useRange(initial = '30d') {
    return useState<Range>(() => rangeFor(initial));
}

const dateInput =
    'num h-9 rounded-xl border border-line-strong bg-surface px-2.5 text-[13px] text-ink shadow-card focus:border-ink focus:ring-3 focus:ring-accent/60 focus:outline-none';

export function DateRange({ value, onChange }: { value: Range; onChange: (range: Range) => void }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
                <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-ink-3" />
                <Select
                    aria-label="Date range"
                    value={value.preset}
                    className="w-40 pl-8"
                    onChange={(e) => onChange(e.target.value === 'custom' ? { ...value, preset: 'custom' } : rangeFor(e.target.value))}
                >
                    {Object.entries(presets).map(([key, preset]) => (
                        <option key={key} value={key}>
                            {preset.label}
                        </option>
                    ))}
                    <option value="custom">Custom range</option>
                </Select>
            </div>
            {value.preset === 'custom' && (
                <>
                    <input type="date" aria-label="From" className={dateInput} value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
                    <span className="text-ink-3">–</span>
                    <input type="date" aria-label="To" className={dateInput} value={value.to} min={value.from} max={today()} onChange={(e) => onChange({ ...value, to: e.target.value })} />
                </>
            )}
        </div>
    );
}
