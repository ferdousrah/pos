import { HandCoins, Landmark, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AccountSelect, StoreNotice, useHasStore } from '@/components/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, SearchInput, Segmented, Select } from '@/components/ui/Field';
import { Card, Line, Page, PageHeader, Stat, StatRow, Toolbar } from '@/components/ui/Layout';
import { Confirm, FormFooter, Modal } from '@/components/ui/Modal';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, money, moneyRound, today } from '@/lib/format';
import { useAction, useApi, useDebounced, useDisclosure, useForm, usePaged } from '@/lib/hooks';
import { useCan, useSession } from '@/lib/session';
import type { Named, StoreRef, WithSummary } from '@/lib/types';

type Direction = 'taken' | 'given';

interface LoanPayment {
    id: number;
    principal_amount: number;
    interest_amount: number;
    paid_at: string;
    note: string | null;
    account: Named;
    user: Named | null;
}

interface Loan {
    id: number;
    reference_no: string;
    direction: Direction;
    party_name: string;
    party_phone: string | null;
    principal: number;
    principal_repaid: number;
    interest_total: number;
    outstanding: number;
    issued_at: string;
    due_at: string | null;
    status: 'open' | 'settled';
    note: string | null;
    store: StoreRef;
    account: Named;
    user?: Named | null;
    payments?: LoanPayment[];
}

interface Summary {
    payable: number;
    receivable: number;
    interest_paid: number;
    interest_earned: number;
    open_count: number;
}

/** The two kinds of loan read very differently, so every label is chosen per direction. */
const words = {
    taken: { badge: 'Borrowed', party: 'Lender', account: 'Received into', repay: 'Repay', repayAccount: 'Paid from', interest: 'Interest paid', owed: 'You still owe' },
    given: { badge: 'Lent', party: 'Borrower', account: 'Paid from', repay: 'Receive repayment', repayAccount: 'Received into', interest: 'Interest received', owed: 'Still owed to you' },
} as const;

const overdue = (loan: Loan) => loan.status === 'open' && !!loan.due_at && loan.due_at < today();

function LoanForm({ open, onClose }: { open: boolean; onClose: () => void }) {
    const symbol = useSession((s) => s.profile!.settings.currency_symbol);
    const blank = { direction: 'taken' as Direction, party_name: '', party_phone: '', principal: '', account_id: '', issued_at: today(), due_at: '', note: '' };
    const form = useForm(blank);
    const w = words[form.values.direction];

    useEffect(() => {
        if (open) form.reset({ ...blank, issued_at: today() });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const save = useAction(() => api.post('loans', { ...form.values, due_at: form.values.due_at || null }), {
        success: 'Loan recorded',
        onInvalid: form.invalid,
        onSuccess: onClose,
    });

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="New loan"
            icon={<HandCoins />}
            description="The amount moves through the account you pick. It is not counted as income or expense — only interest is."
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel="Record loan" />}
        >
            <Segmented
                className="mb-5 flex w-full"
                value={form.values.direction}
                onChange={(direction) => form.set('direction', direction)}
                options={[
                    { value: 'taken', label: 'We borrowed money' },
                    { value: 'given', label: 'We lent money' },
                ]}
            />

            <div className="grid gap-4 sm:grid-cols-2">
                <Input label={`${w.party} name`} required placeholder={form.values.direction === 'taken' ? 'e.g. City Bank, or a person' : 'Who received the money'} {...form.bind('party_name')} />
                <Input label="Phone" optional inputMode="tel" {...form.bind('party_phone')} />
                <Input label="Loan amount" required type="number" min="0" step="0.01" prefix={symbol} {...form.bind('principal')} />
                <AccountSelect label={w.account} required showBalance {...form.bind('account_id')} />
                <Input label="Date" required type="date" max={today()} {...form.bind('issued_at')} />
                <Input label="Repay by" optional type="date" min={form.values.issued_at} {...form.bind('due_at')} />
                <Input wrapperClassName="sm:col-span-2" label="Note" optional placeholder="Terms, interest rate, purpose…" {...form.bind('note')} />
            </div>
        </Modal>
    );
}

function LoanPanel({ id, onClose }: { id: number | null; onClose: () => void }) {
    const can = useCan();
    const manage = can('accounts.manage');
    const symbol = useSession((s) => s.profile!.settings.currency_symbol);
    const { data } = useApi<Loan>(`loans/${id}`, undefined, { enabled: id !== null });
    const loan = id !== null && data?.id === id ? data : null;
    const w = words[loan?.direction ?? 'taken'];

    const blank = { principal_amount: '', interest_amount: '', account_id: '', paid_at: today(), note: '' };
    const form = useForm(blank);
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
        form.reset({ ...blank, paid_at: today() });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const repay = useAction(() => api.post(`loans/${id}/payments`, { ...form.values, principal_amount: form.values.principal_amount || 0, interest_amount: form.values.interest_amount || 0 }), {
        success: 'Repayment recorded',
        onInvalid: form.invalid,
        onSuccess: () => form.reset({ ...blank, paid_at: today(), account_id: form.values.account_id }),
    });

    const undo = useAction((paymentId: number) => api.delete(`loans/${id}/payments/${paymentId}`), { success: 'Repayment removed and balances restored' });

    const remove = useAction(() => api.delete(`loans/${id}`), {
        success: 'Loan deleted',
        onSuccess: () => {
            setRemoving(false);
            onClose();
        },
    });

    const total = (parseFloat(form.values.principal_amount) || 0) + (parseFloat(form.values.interest_amount) || 0);
    const progress = loan && loan.principal > 0 ? Math.min(100, (loan.principal_repaid / loan.principal) * 100) : 0;

    return (
        <>
            <Modal
                open={id !== null}
                onClose={onClose}
                variant="sheet"
                icon={<HandCoins />}
                title={loan?.party_name ?? ' '}
                description={loan ? `${w.badge} · ${loan.reference_no} · ${formatDate(loan.issued_at)}` : undefined}
                flush
            >
                {!loan ? (
                    <PageLoader />
                ) : (
                    <>
                        <div className="px-6 py-5">
                            <div className="flex items-end justify-between gap-4">
                                <div>
                                    <p className="text-[13px] text-ink-2">{w.owed}</p>
                                    <p className={cn('num mt-0.5 text-[30px] leading-9 font-medium tracking-[-0.02em]', loan.status === 'settled' && 'text-good')}>{money(loan.outstanding)}</p>
                                </div>
                                {loan.status === 'settled' ? <Badge tone="good">Settled</Badge> : overdue(loan) ? <Badge tone="bad">Overdue</Badge> : <Badge tone="warn">Open</Badge>}
                            </div>

                            <div className="mt-4 h-2 rounded-full bg-sunken">
                                <div className="bar-fill h-full rounded-full bg-accent ring-1 ring-accent-strong ring-inset" style={{ width: `${Math.max(progress, progress > 0 ? 3 : 0)}%` }} />
                            </div>

                            <div className="mt-4">
                                <Line label="Loan amount" value={money(loan.principal)} />
                                <Line label="Principal repaid" value={money(loan.principal_repaid)} />
                                <Line label={w.interest} value={money(loan.interest_total)} />
                                {loan.due_at && <Line label="Repay by" value={formatDate(loan.due_at)} className={overdue(loan) ? 'text-bad [&_span]:text-bad' : undefined} />}
                                <Line label={w.account} value={loan.account.name} />
                                {loan.party_phone && <Line label="Phone" value={loan.party_phone} />}
                            </div>
                            {loan.note && <p className="mt-3 rounded-2xl bg-sunken px-4 py-3 text-[13px] text-ink-2">{loan.note}</p>}
                        </div>

                        {manage && loan.status === 'open' && (
                            <form
                                className="border-t border-line bg-sunken/40 px-6 py-5"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    repay.mutate();
                                }}
                            >
                                <h3 className="mb-3 text-sm font-medium">{w.repay}</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        label="Principal"
                                        type="number"
                                        min="0"
                                        max={loan.outstanding}
                                        step="0.01"
                                        placeholder="0.00"
                                        prefix={symbol}
                                        hint={
                                            <button type="button" className="font-medium text-ink underline decoration-accent-strong decoration-2 underline-offset-4" onClick={() => form.set('principal_amount', loan.outstanding.toFixed(2))}>
                                                Full balance
                                            </button>
                                        }
                                        {...form.bind('principal_amount')}
                                    />
                                    <Input label="Interest" type="number" min="0" step="0.01" placeholder="0.00" prefix={symbol} hint={loan.direction === 'taken' ? 'Counts as an expense.' : 'Counts as income.'} {...form.bind('interest_amount')} />
                                    <AccountSelect label={w.repayAccount} required {...form.bind('account_id')} />
                                    <Input label="Date" required type="date" min={loan.issued_at} max={today()} {...form.bind('paid_at')} />
                                    <Input wrapperClassName="col-span-2" label="Note" optional {...form.bind('note')} />
                                </div>
                                <Button type="submit" variant="primary" className="mt-4 w-full" loading={repay.isPending} disabled={total <= 0}>
                                    {total > 0 ? `${loan.direction === 'taken' ? 'Pay' : 'Receive'} ${money(total)}` : w.repay}
                                </Button>
                            </form>
                        )}

                        <div className="border-t border-line">
                            <h3 className="px-6 pt-4 pb-2 text-sm font-medium">Repayments</h3>
                            {loan.payments?.length ? (
                                <ul className="divide-y divide-line border-t border-line">
                                    {loan.payments.map((payment) => (
                                        <li key={payment.id} className="flex items-center gap-3 px-6 py-3 text-[13px]">
                                            <div className="min-w-0 flex-1">
                                                <p className="num font-medium">{money(payment.principal_amount + payment.interest_amount)}</p>
                                                <p className="num mt-0.5 text-xs text-ink-3">
                                                    {money(payment.principal_amount)} principal{payment.interest_amount > 0 && ` + ${money(payment.interest_amount)} interest`}
                                                </p>
                                                <p className="mt-0.5 truncate text-xs text-ink-3">
                                                    {formatDate(payment.paid_at)} · {payment.account.name}
                                                    {payment.note && ` · ${payment.note}`}
                                                </p>
                                            </div>
                                            {manage && (
                                                <Button variant="ghost" size="icon" aria-label="Remove this repayment" title="Remove this repayment" disabled={undo.isPending} onClick={() => undo.mutate(payment.id)}>
                                                    <Trash2 />
                                                </Button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="px-6 pb-6 text-[13px] text-ink-3">Nothing repaid yet.</p>
                            )}
                        </div>

                        {manage && !loan.payments?.length && (
                            <div className="border-t border-line px-6 py-4">
                                <Button variant="ghost" icon={<Trash2 />} className="text-bad hover:bg-bad-soft hover:text-bad" onClick={() => setRemoving(true)}>
                                    Delete this loan
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </Modal>

            <Confirm
                open={removing}
                onClose={() => setRemoving(false)}
                onConfirm={() => remove.mutate()}
                loading={remove.isPending}
                title="Delete this loan?"
                message={
                    <>
                        Use this only for a loan entered by mistake. <strong className="font-medium text-ink">{loan && money(loan.principal)}</strong> will be {loan?.direction === 'taken' ? 'taken back out of' : 'put back into'} {loan?.account.name}.
                    </>
                }
            />
        </>
    );
}

export default function Loans() {
    const can = useCan();
    const manage = can('accounts.manage');
    const hasStore = useHasStore();
    const allStores = useSession((s) => s.storeId === null);
    const [search, setSearch] = useState('');
    const [direction, setDirection] = useState('');
    const [status, setStatus] = useState('');
    const term = useDebounced(search);
    const creating = useDisclosure();
    const [viewing, setViewing] = useState<number | null>(null);

    const { data, isLoading, setPage } = usePaged<Loan, WithSummary<Loan, Summary>>('loans', { search: term, direction, status });

    const columns: Column<Loan>[] = [
        { key: 'party', header: 'With', cell: (l) => <Stack primary={l.party_name} secondary={<span className="font-mono">{l.reference_no}</span>} /> },
        { key: 'kind', header: 'Type', cell: (l) => <Badge tone={l.direction === 'taken' ? 'info' : 'brand'}>{words[l.direction].badge}</Badge> },
        ...(allStores ? [{ key: 'store', header: 'Store', hide: 'lg', cell: (l: Loan) => <span className="text-ink-2">{l.store.name}</span> } satisfies Column<Loan>] : []),
        { key: 'date', header: 'Date', hide: 'md', cell: (l) => <span className="num text-ink-2">{formatDate(l.issued_at)}</span> },
        { key: 'principal', header: 'Amount', align: 'right', hide: 'sm', cell: (l) => <span className="num text-ink-2">{money(l.principal)}</span> },
        { key: 'interest', header: 'Interest', align: 'right', hide: 'lg', cell: (l) => (l.interest_total > 0 ? <span className="num text-ink-2">{money(l.interest_total)}</span> : <span className="text-ink-3">—</span>) },
        { key: 'outstanding', header: 'Outstanding', align: 'right', cell: (l) => <span className={cn('num font-medium', l.outstanding <= 0 && 'text-ink-3')}>{money(l.outstanding)}</span> },
        {
            key: 'due',
            header: 'Repay by',
            hide: 'md',
            cell: (l) => (l.due_at ? <span className={cn('num', overdue(l) ? 'font-medium text-bad' : 'text-ink-2')}>{formatDate(l.due_at)}</span> : <span className="text-ink-3">—</span>),
        },
        {
            key: 'status',
            header: 'Status',
            cell: (l) => (l.status === 'settled' ? <Badge tone="good">Settled</Badge> : overdue(l) ? <Badge tone="bad">Overdue</Badge> : <Badge tone="warn">Open</Badge>),
        },
    ];

    return (
        <Page>
            <PageHeader
                title="Loans"
                description="Money you have borrowed and money you have lent. Only the interest affects your profit."
                actions={
                    manage && (
                        <Button variant="primary" icon={<Plus />} disabled={!hasStore} onClick={() => creating.open(true)}>
                            New loan
                        </Button>
                    )
                }
            />
            {manage && <StoreNotice action="record a loan" />}

            <StatRow>
                <Stat label="You owe (borrowed)" value={moneyRound(data?.summary.payable)} tone={data?.summary.payable ? 'bad' : 'default'} />
                <Stat label="Owed to you (lent)" value={moneyRound(data?.summary.receivable)} />
                <Stat label="Interest paid" value={moneyRound(data?.summary.interest_paid)} hint="An expense" />
                <Stat label="Interest earned" value={moneyRound(data?.summary.interest_earned)} hint="Income" />
            </StatRow>

            <Card>
                <Toolbar>
                    <SearchInput value={search} onChange={setSearch} placeholder="Name, phone or reference" />
                    <Select aria-label="Type" value={direction} onChange={(e) => setDirection(e.target.value)} className="w-40">
                        <option value="">Borrowed and lent</option>
                        <option value="taken">Borrowed</option>
                        <option value="given">Lent</option>
                    </Select>
                    <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
                        <option value="">Any status</option>
                        <option value="open">Open</option>
                        <option value="settled">Settled</option>
                    </Select>
                </Toolbar>
                <DataTable
                    columns={columns}
                    rows={data?.data}
                    loading={isLoading}
                    onRowClick={(loan) => setViewing(loan.id)}
                    empty={<Empty icon={<Landmark />} title="No loans recorded" hint="Record money you borrow to invest in the business, or money you lend to someone else." />}
                />
                <Pager meta={data} onPage={setPage} />
            </Card>

            {hasStore && <LoanForm open={creating.isOpen} onClose={creating.close} />}
            <LoanPanel id={viewing} onClose={() => setViewing(null)} />
        </Page>
    );
}
