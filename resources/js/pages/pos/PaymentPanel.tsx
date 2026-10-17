import { ArrowLeft, Banknote, CreditCard, Landmark, RotateCcw, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Account } from '@/lib/types';
import type { CartCustomer } from './cart';

export type PosAccount = Pick<Account, 'id' | 'name' | 'type'>;

const icons = { cash: Banknote, card: CreditCard, mobile: Smartphone, bank: Landmark };

/** Notes a cashier is handed, each with its own tint so they are quick to tell apart. */
const notes: { value: number; tint: string }[] = [
    { value: 10, tint: '#f3a8c4' },
    { value: 20, tint: '#a8e0b0' },
    { value: 50, tint: '#a9bdf7' },
    { value: 100, tint: '#7fd6c8' },
    { value: 200, tint: '#e8d08a' },
    { value: 500, tint: '#c7b3f5' },
    { value: 1000, tint: '#f7b995' },
];

interface Props {
    total: number;
    accounts: PosAccount[];
    customer: CartCustomer | null;
    loading: boolean;
    onBack: () => void;
    onConfirm: (payments: { account_id: number; amount: number }[]) => void;
}

/**
 * Takes payment in place of the product grid, so the cart stays in view while
 * the cashier counts the money. Several methods can share one sale.
 */
export function PaymentPanel({ total, accounts, customer, loading, onBack, onConfirm }: Props) {
    const symbol = useSession((s) => s.profile!.settings.currency_symbol);
    const [amounts, setAmounts] = useState<Record<number, string>>({});
    const [activeId, setActiveId] = useState<number | null>(null);
    const [counted, setCounted] = useState<Record<number, number>>({});

    // Most sales are settled in full with the first method, so start there.
    useEffect(() => {
        if (!accounts[0]) return;
        setAmounts({ [accounts[0].id]: total.toFixed(2) });
        setActiveId(accounts[0].id);
        setCounted({});
    }, [total, accounts]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onBack();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onBack]);

    const active = accounts.find((account) => account.id === activeId) ?? null;
    const tendered = useMemo(() => Object.values(amounts).reduce((sum, value) => sum + (parseFloat(value) || 0), 0), [amounts]);
    const change = Math.max(0, tendered - total);
    const due = Math.max(0, total - tendered);
    const unpaid = due > 0.004;
    const needsCustomer = unpaid && !customer;

    const others = (id: number) => Object.entries(amounts).reduce((sum, [key, value]) => (Number(key) === id ? sum : sum + (parseFloat(value) || 0)), 0);

    const setAmount = (id: number, value: string) => {
        setAmounts((current) => ({ ...current, [id]: value }));
        setCounted({});
    };

    /** Each tap adds one note; the cash amount is whatever has been counted so far. */
    const addNote = (value: number) => {
        if (!active) return;
        const next = { ...counted, [value]: (counted[value] ?? 0) + 1 };
        const sum = Object.entries(next).reduce((acc, [note, count]) => acc + Number(note) * count, 0);
        setCounted(next);
        setAmounts((current) => ({ ...current, [active.id]: sum.toFixed(2) }));
    };

    const confirm = () =>
        onConfirm(
            Object.entries(amounts)
                .map(([id, value]) => ({ account_id: Number(id), amount: parseFloat(value) || 0 }))
                .filter((payment) => payment.amount > 0),
        );

    return (
        <section data-payment className="page-enter flex min-w-0 flex-1 flex-col">
            <div className="flex h-[60px] shrink-0 items-center gap-3 px-3 sm:px-4">
                <button type="button" onClick={onBack} className="flex h-9 items-center gap-2 rounded-full bg-surface pr-4 pl-3 text-[13px] font-medium text-ink shadow-card hover:bg-sunken">
                    <ArrowLeft className="size-4" />
                    Products
                </button>
                <h2 className="text-[15px] font-medium">Payment</h2>
                <span className="ml-auto truncate text-[13px] text-ink-2">{customer ? customer.name : 'Walk-in customer'}</span>
            </div>

            <form
                className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 sm:px-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!needsCustomer) confirm();
                }}
            >
                <div className="mx-auto max-w-[760px] space-y-3">
                    {/* How it is being paid */}
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {accounts.map((account) => {
                            const Icon = icons[account.type];
                            const amount = parseFloat(amounts[account.id]) || 0;
                            const selected = account.id === activeId;

                            return (
                                <button
                                    key={account.id}
                                    type="button"
                                    onClick={() => {
                                        setActiveId(account.id);
                                        // Picking a second method moves whatever is still unpaid onto it.
                                        if (!amount) setAmount(account.id, Math.max(0, total - others(account.id)).toFixed(2));
                                    }}
                                    className={cn(
                                        'flex h-[92px] flex-col justify-between rounded-[20px] border bg-surface p-3.5 text-left transition-[border-color,background-color,translate] duration-300 ease-smooth hover:-translate-y-0.5',
                                        selected ? 'border-ink bg-brand-soft/60' : amount > 0 ? 'border-accent-strong' : 'border-transparent',
                                    )}
                                >
                                    <span className="flex items-center justify-between">
                                        <span className={cn('grid size-8 place-items-center rounded-full', selected ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2')}>
                                            <Icon className="size-4" />
                                        </span>
                                        {amount > 0 && <span className="num text-[13px] font-semibold">{money(amount)}</span>}
                                    </span>
                                    <span className="truncate text-[13px] font-medium">{account.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    {active && (
                        <div className="rounded-[24px] bg-surface p-5 shadow-card dark:ring-1 dark:ring-line">
                            <div className="flex flex-wrap items-end justify-between gap-4">
                                <div>
                                    <p className="text-[13px] text-ink-2">Amount to collect</p>
                                    <p className="num mt-0.5 text-[34px] leading-10 font-medium tracking-[-0.02em]">{money(total)}</p>
                                </div>
                                <label className="block">
                                    <span className="mb-1.5 block text-right text-[13px] text-ink-2">Received on {active.name}</span>
                                    <span className="relative block">
                                        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3">{symbol}</span>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            min="0"
                                            step="0.01"
                                            autoFocus
                                            value={amounts[active.id] ?? ''}
                                            onChange={(e) => setAmount(active.id, e.target.value)}
                                            onFocus={(e) => e.target.select()}
                                            placeholder="0.00"
                                            className="num h-13 w-56 rounded-2xl border border-line-strong bg-surface pr-4 pl-9 text-right text-xl font-medium focus:border-ink focus:ring-3 focus:ring-accent/60 focus:outline-none"
                                        />
                                    </span>
                                </label>
                            </div>

                            {active.type === 'cash' ? (
                                <div className="mt-5 border-t border-line pt-4">
                                    <div className="mb-2.5 flex items-center justify-between">
                                        <p className="text-[13px] text-ink-2">Tap the notes you are handed</p>
                                        <div className="flex gap-1.5">
                                            <Button size="sm" onClick={() => setAmount(active.id, Math.max(0, total - others(active.id)).toFixed(2))}>
                                                Exact amount
                                            </Button>
                                            <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => setAmount(active.id, '')}>
                                                Clear
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                                        {notes.map((note) => (
                                            <button
                                                key={note.value}
                                                type="button"
                                                onClick={() => addNote(note.value)}
                                                style={{ background: `color-mix(in srgb, ${note.tint} 38%, var(--surface))`, borderColor: `color-mix(in srgb, ${note.tint} 80%, transparent)` }}
                                                className="relative grid h-14 place-items-center rounded-2xl border transition-[scale,translate] duration-200 ease-smooth hover:-translate-y-0.5 active:scale-95"
                                            >
                                                <span className="num text-[15px] font-semibold text-ink">{note.value.toLocaleString()}</span>
                                                {counted[note.value] ? (
                                                    <span className="num absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-inverse px-1 text-[10.5px] font-semibold text-on-inverse">
                                                        ×{counted[note.value]}
                                                    </span>
                                                ) : null}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                                    <p className="text-[13px] text-ink-2">Confirm the amount on the {active.type === 'card' ? 'card terminal' : active.type === 'mobile' ? 'customer’s phone' : 'bank slip'} before finishing.</p>
                                    <Button size="sm" onClick={() => setAmount(active.id, Math.max(0, total - others(active.id)).toFixed(2))}>
                                        Fill the balance
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-[20px] bg-surface px-5 py-4 shadow-card dark:ring-1 dark:ring-line">
                            <p className="text-xs text-ink-3">Received</p>
                            <p className="num mt-0.5 text-xl font-medium">{money(tendered)}</p>
                        </div>
                        <div className={cn('rounded-[20px] px-5 py-4 shadow-card dark:ring-1 dark:ring-line', unpaid ? 'bg-warn-soft' : change > 0 ? 'bg-brand-soft' : 'bg-surface')}>
                            <p className="text-xs text-ink-3">{unpaid ? 'Left unpaid' : 'Change to give'}</p>
                            <p className={cn('num mt-0.5 text-xl font-medium', unpaid && 'text-warn')}>{money(unpaid ? due : change)}</p>
                        </div>
                    </div>

                    {needsCustomer && <p className="text-center text-[13px] text-bad">Select a customer to sell on credit, or collect the full amount.</p>}

                    <Button type="submit" variant="accent" size="lg" className="w-full" loading={loading} disabled={needsCustomer}>
                        {unpaid ? (tendered > 0 ? `Complete with ${money(due)} due` : 'Sell on credit') : 'Complete sale'}
                    </Button>
                </div>
            </form>
        </section>
    );
}
