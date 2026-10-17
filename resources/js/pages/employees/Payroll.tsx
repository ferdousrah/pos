import { Banknote, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AccountSelect } from '@/components/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Card, Line, Page, PageHeader, Stat, StatRow, Tabs, Toolbar } from '@/components/ui/Layout';
import { Confirm, FormFooter, Modal } from '@/components/ui/Modal';
import { DataTable, Empty, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDate, money, moneyRound, today } from '@/lib/format';
import { useAction, useApi, useDisclosure, useForm } from '@/lib/hooks';
import { useCan, useSession } from '@/lib/session';
import type { Named, StoreRef } from '@/lib/types';
import { employeeTabs } from './Employees';

interface PayrollRow {
    id: number;
    code: string;
    name: string;
    designation: string | null;
    salary: number;
    store: StoreRef;
    payment: {
        id: number;
        reference_no: string;
        basic_amount: number;
        bonus_amount: number;
        deduction_amount: number;
        net_amount: number;
        paid_at: string;
        account: Named;
    } | null;
}

interface PayrollData {
    period: string;
    rows: PayrollRow[];
    summary: { employees: number; paid_count: number; paid: number; pending: number };
}

const monthLabel = (period: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${period}-01T00:00:00`));

function PayDialog({ row, period, onClose }: { row: PayrollRow | null; period: string; onClose: () => void }) {
    const symbol = useSession((s) => s.profile!.settings.currency_symbol);
    const blank = { basic_amount: '', bonus_amount: '', deduction_amount: '', account_id: '', paid_at: today(), note: '' };
    const form = useForm(blank);

    useEffect(() => {
        if (row) form.reset({ ...blank, basic_amount: String(row.salary) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [row]);

    const number = (value: string) => parseFloat(value) || 0;
    const net = number(form.values.basic_amount) + number(form.values.bonus_amount) - number(form.values.deduction_amount);

    const save = useAction(() => api.post('payroll', { ...form.values, employee_id: row!.id, period, bonus_amount: form.values.bonus_amount || null, deduction_amount: form.values.deduction_amount || null }), {
        success: `Salary paid to ${row?.name}`,
        onInvalid: form.invalid,
        onSuccess: onClose,
    });

    return (
        <Modal
            open={row !== null}
            onClose={onClose}
            title={`Pay ${row?.name ?? ''}`}
            icon={<Banknote />}
            description={`Salary for ${monthLabel(period)}`}
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel={`Pay ${money(Math.max(0, net))}`} disabled={net <= 0} />}
        >
            <div className="grid grid-cols-3 gap-4">
                <Input label="Basic" required type="number" min="0" step="0.01" prefix={symbol} {...form.bind('basic_amount')} />
                <Input label="Bonus" type="number" min="0" step="0.01" placeholder="0" prefix={symbol} {...form.bind('bonus_amount')} />
                <Input label="Deduction" type="number" min="0" step="0.01" placeholder="0" prefix={symbol} {...form.bind('deduction_amount')} />
            </div>
            <div className="my-4 rounded-2xl bg-sunken px-4 py-2.5">
                <Line label="Net pay" value={money(net)} strong />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <AccountSelect label="Paid from" required showBalance {...form.bind('account_id')} />
                <Input label="Payment date" required type="date" max={today()} {...form.bind('paid_at')} />
                <Input wrapperClassName="sm:col-span-2" label="Note" optional {...form.bind('note')} />
            </div>
        </Modal>
    );
}

export default function Payroll() {
    const can = useCan();
    const manage = can('payroll.manage');
    const [period, setPeriod] = useState(() => today().slice(0, 7));
    const { data, isLoading } = useApi<PayrollData>('payroll', { period });
    const paying = useDisclosure<PayrollRow>();
    const voiding = useDisclosure<PayrollRow>();

    const voidPayment = useAction((id: number) => api.delete(`payroll/${id}`), { success: 'Payment reversed', onSuccess: voiding.close });

    const columns: Column<PayrollRow>[] = [
        { key: 'name', header: 'Employee', cell: (r) => <Stack primary={r.name} secondary={r.designation ?? r.code} /> },
        { key: 'store', header: 'Store', hide: 'md', cell: (r) => <span className="text-ink-2">{r.store.name}</span> },
        { key: 'salary', header: 'Salary', align: 'right', cell: (r) => <span className="num text-ink-2">{money(r.salary)}</span> },
        {
            key: 'adjust',
            header: 'Bonus / deduction',
            align: 'right',
            hide: 'lg',
            cell: (r) =>
                r.payment && (r.payment.bonus_amount > 0 || r.payment.deduction_amount > 0) ? (
                    <span className="num text-ink-2">
                        {r.payment.bonus_amount > 0 && `+${money(r.payment.bonus_amount)}`} {r.payment.deduction_amount > 0 && `−${money(r.payment.deduction_amount)}`}
                    </span>
                ) : (
                    <span className="text-ink-3">—</span>
                ),
        },
        { key: 'net', header: 'Net paid', align: 'right', cell: (r) => (r.payment ? <span className="num font-medium">{money(r.payment.net_amount)}</span> : <span className="text-ink-3">—</span>) },
        {
            key: 'status',
            header: 'Status',
            cell: (r) =>
                r.payment ? (
                    <div>
                        <Badge tone="good">Paid</Badge>
                        <p className="mt-0.5 text-xs text-ink-3">
                            {formatDate(r.payment.paid_at)} · {r.payment.account.name}
                        </p>
                    </div>
                ) : (
                    <Badge tone="warn">Pending</Badge>
                ),
        },
        ...(manage
            ? [
                  {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      className: 'w-28',
                      cell: (r: PayrollRow) =>
                          r.payment ? (
                              <Button size="sm" variant="ghost" icon={<Undo2 />} onClick={() => voiding.open(r)}>
                                  Reverse
                              </Button>
                          ) : (
                              <Button size="sm" icon={<Banknote />} onClick={() => paying.open(r)}>
                                  Pay
                              </Button>
                          ),
                  } satisfies Column<PayrollRow>,
              ]
            : []),
    ];

    return (
        <Page>
            <PageHeader title="Employees" description="Pay salaries month by month. Each payment is posted to your accounts as an expense." />
            <Tabs tabs={employeeTabs} />

            <StatRow>
                <Stat label="On the payroll" value={data?.summary.employees ?? 0} hint={data ? `${data.summary.paid_count} paid` : undefined} />
                <Stat label="Paid" value={moneyRound(data?.summary.paid)} tone="good" />
                <Stat label="Still to pay" value={moneyRound(data?.summary.pending)} tone={data?.summary.pending ? 'warn' : 'default'} />
            </StatRow>

            <Card>
                <Toolbar>
                    <span className="text-[13px] text-ink-2">Salary month</span>
                    <input
                        type="month"
                        aria-label="Salary month"
                        value={period}
                        max={today().slice(0, 7)}
                        onChange={(e) => e.target.value && setPeriod(e.target.value)}
                        className="num h-9 rounded-xl border border-line-strong bg-surface px-2.5 text-[13px] shadow-card focus:border-ink focus:ring-3 focus:ring-accent/60 focus:outline-none"
                    />
                </Toolbar>
                <DataTable columns={columns} rows={data?.rows} loading={isLoading} empty={<Empty icon={<Banknote />} title="No one on the payroll for this month" />} />
            </Card>

            <PayDialog row={paying.state} period={period} onClose={paying.close} />

            <Confirm
                open={voiding.isOpen}
                onClose={voiding.close}
                onConfirm={() => voiding.state?.payment && voidPayment.mutate(voiding.state.payment.id)}
                loading={voidPayment.isPending}
                confirmLabel="Reverse payment"
                title="Reverse this salary payment?"
                message={
                    <>
                        <strong className="font-medium text-ink">{voiding.state?.payment && money(voiding.state.payment.net_amount)}</strong> goes back into {voiding.state?.payment?.account.name} and {voiding.state?.name} is marked as unpaid for {monthLabel(period)}.
                    </>
                }
            />
        </Page>
    );
}
