import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { PaymentStatus } from '@/lib/types';

const tones = {
    neutral: 'bg-sunken text-ink-2',
    good: 'bg-good-soft text-good',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
    info: 'bg-info-soft text-info',
    brand: 'bg-accent text-on-accent',
};

export type Tone = keyof typeof tones;

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
    return (
        <span className={cn('inline-flex h-[22px] items-center rounded-full px-2 text-xs font-medium whitespace-nowrap', tones[tone], className)}>
            {children}
        </span>
    );
}

const paymentTone: Record<PaymentStatus, Tone> = { paid: 'good', partial: 'warn', due: 'bad' };
const paymentLabel: Record<PaymentStatus, string> = { paid: 'Paid', partial: 'Partly paid', due: 'Unpaid' };

export const PaymentBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={paymentTone[status]}>{paymentLabel[status]}</Badge>;

export const ActiveBadge = ({ active }: { active: boolean }) => <Badge tone={active ? 'good' : 'neutral'}>{active ? 'Active' : 'Inactive'}</Badge>;
