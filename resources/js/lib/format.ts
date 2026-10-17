import { useSession } from './session';

const amount = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

const symbol = () => useSession.getState().profile?.settings.currency_symbol ?? '';

/** Negative amounts read "-৳120.00", not "৳-120.00". */
const signed = (value: number | null | undefined, format: Intl.NumberFormat) => {
    const number = value ?? 0;
    return `${number < 0 ? '-' : ''}${symbol()}${format.format(Math.abs(number))}`;
};

export const money = (value: number | null | undefined) => signed(value, amount);

/** Money without decimals, for headline figures where paisa are noise. */
export const moneyRound = (value: number | null | undefined) => signed(value, whole);

export const moneyCompact = (value: number | null | undefined) => signed(value, compact);

export const decimal = (value: number | null | undefined) => amount.format(value ?? 0);

export const qty = (value: number | null | undefined) => quantity.format(value ?? 0);

export const percent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dayShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** Plain dates ("2026-10-12") are parsed as local days so they never slip across midnight. */
const parse = (value: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);

export const formatDate = (value: string | null | undefined) => (value ? day.format(parse(value)) : '—');

export const formatDay = (value: string) => dayShort.format(parse(value));

export const formatDateTime = (value: string | null | undefined) => {
    if (!value) return '—';
    const date = parse(value);
    return `${day.format(date)}, ${time.format(date)}`;
};

export const formatTime = (value: string) => time.format(parse(value));

export const isoDate = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};

export const today = () => isoDate(new Date());

export const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const initials = (name: string) =>
    name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
