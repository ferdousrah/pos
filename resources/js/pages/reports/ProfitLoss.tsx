import { Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { DateRange, useRange } from '@/components/ui/DateRange';
import { Card, Page, PageHeader, Tabs } from '@/components/ui/Layout';
import { PageLoader } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { formatDate, money, percent } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useCurrentStore, useSession } from '@/lib/session';
import { reportTabs, type TradingTotals } from './common';

interface ProfitLossData {
    from: string;
    to: string;
    trading: TradingTotals;
    other_income: { name: string; amount: number }[];
    expenses: { name: string; amount: number }[];
    total_other_income: number;
    total_expenses: number;
    net_profit: number;
    loans: { payable: number; receivable: number };
}

function Row({ label, amount, indent, negative, strong, rule }: { label: ReactNode; amount: number; indent?: boolean; negative?: boolean; strong?: boolean; rule?: boolean }) {
    return (
        <div className={cn('flex items-baseline justify-between gap-6 py-1.5 text-[13.5px]', indent && 'pl-5', strong && 'font-semibold', rule && 'mt-1 border-t border-line pt-2.5')}>
            <span className={cn(!strong && 'text-ink-2')}>{label}</span>
            <span className="num">{negative && amount > 0 ? `(${money(amount)})` : money(amount)}</span>
        </div>
    );
}

const Heading = ({ children }: { children: ReactNode }) => <h3 className="mt-6 mb-1 text-[11px] font-medium tracking-wider text-ink-3 uppercase first:mt-0">{children}</h3>;

export default function ProfitLoss() {
    const [range, setRange] = useRange('month');
    const store = useCurrentStore();
    const business = useSession((s) => s.profile!.settings.business_name);
    const { data } = useApi<ProfitLossData>('reports/profit-loss', { from: range.from, to: range.to });

    return (
        <Page>
            <PageHeader
                title="Reports"
                description="What you earned, what it cost, and what is left."
                actions={
                    <>
                        <DateRange value={range} onChange={setRange} />
                        <Button icon={<Printer />} onClick={() => window.print()}>
                            Print
                        </Button>
                    </>
                }
            />
            <Tabs tabs={reportTabs} />

            {!data ? (
                <PageLoader />
            ) : (
                <Card className="printable mx-auto max-w-2xl px-6 py-7 sm:px-10">
                    <div className="mb-6 border-b border-line pb-5 text-center">
                        <p className="text-[15px] font-semibold">{business}</p>
                        <p className="mt-0.5 text-[13px] text-ink-2">Profit and loss statement · {store?.name ?? 'All stores'}</p>
                        <p className="num mt-0.5 text-xs text-ink-3">
                            {formatDate(data.from)} – {formatDate(data.to)}
                        </p>
                    </div>

                    <Heading>Revenue</Heading>
                    <Row label="Gross sales" amount={data.trading.gross_sales} />
                    <Row label="Less: discounts" amount={data.trading.discounts} indent negative />
                    <Row label="Less: returns" amount={data.trading.returns} indent negative />
                    <Row label="Net sales" amount={data.trading.net_sales} strong rule />

                    <Heading>Cost of sales</Heading>
                    <Row label="Cost of goods sold" amount={data.trading.cogs} negative />
                    <Row
                        label={
                            <>
                                Gross profit
                                {data.trading.net_sales > 0 && <span className="ml-2 text-xs font-normal text-ink-3">{percent((data.trading.gross_profit / data.trading.net_sales) * 100)} margin</span>}
                            </>
                        }
                        amount={data.trading.gross_profit}
                        strong
                        rule
                    />

                    {data.other_income.length > 0 && (
                        <>
                            <Heading>Other income</Heading>
                            {data.other_income.map((row) => (
                                <Row key={row.name} label={row.name} amount={row.amount} />
                            ))}
                            <Row label="Total other income" amount={data.total_other_income} strong rule />
                        </>
                    )}

                    <Heading>Operating expenses</Heading>
                    {data.expenses.length === 0 && <p className="py-1.5 text-[13px] text-ink-3">No expenses recorded in this period.</p>}
                    {data.expenses.map((row) => (
                        <Row key={row.name} label={row.name} amount={row.amount} negative />
                    ))}
                    <Row label="Total operating expenses" amount={data.total_expenses} strong rule negative />

                    <div className={cn('mt-6 flex items-baseline justify-between rounded-lg px-4 py-3.5', data.net_profit >= 0 ? 'bg-good-soft' : 'bg-bad-soft')}>
                        <span className="text-sm font-semibold">{data.net_profit >= 0 ? 'Net profit' : 'Net loss'}</span>
                        <span className={cn('num text-xl font-semibold tracking-tight', data.net_profit >= 0 ? 'text-good' : 'text-bad')}>{money(Math.abs(data.net_profit))}</span>
                    </div>

                    {(data.loans.payable > 0 || data.loans.receivable > 0) && (
                        <div className="mt-4 rounded-lg border border-line px-4 py-3">
                            <p className="mb-1 text-[11px] font-medium tracking-wider text-ink-3 uppercase">Loans — not part of profit</p>
                            {data.loans.payable > 0 && <Row label="You still owe on money borrowed" amount={data.loans.payable} />}
                            {data.loans.receivable > 0 && <Row label="Still owed to you on money lent" amount={data.loans.receivable} />}
                            <p className="mt-1.5 text-xs leading-relaxed text-ink-3">
                                Borrowing or lending moves cash but is neither income nor expense. Only the interest appears above{data.loans.payable > 0 ? ', under operating expenses' : ''}.
                            </p>
                        </div>
                    )}

                    <p className="mt-4 text-xs text-ink-3">
                        {money(data.trading.tax)} of tax was collected on these sales. It is owed to the tax authority and is not part of revenue.
                    </p>
                </Card>
            )}
        </Page>
    );
}
