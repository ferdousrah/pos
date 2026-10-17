import { ArrowDownRight, ArrowUpRight, Package, Plus, ReceiptText, TrendingUp, Truck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarList, DailyBars, Ring } from '@/components/charts';
import { HeroArt } from '@/components/HeroArt';
import { PaymentBadge } from '@/components/ui/Badge';
import { Card, CardHeader, CornerLink, Page } from '@/components/ui/Layout';
import { PageLoader } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { formatDateTime, money, moneyRound, qty, titleCase } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useCan, useCurrentStore, useSession } from '@/lib/session';
import type { Sale } from '@/lib/types';

interface Totals {
    orders: number;
    net_sales: number;
    gross_profit: number;
    average_order: number;
    expenses?: number;
}

interface DashboardData {
    days: number;
    today: Totals;
    yesterday: Totals;
    current: Totals;
    previous: Totals;
    trend: { date: string; orders: number; sales: number; profit: number }[];
    top_products: { product_id: number; name: string; sku: string; quantity: number; revenue: number }[];
    payment_mix: { name: string; amount: number; orders: number }[];
    by_store: { name: string; amount: number; orders: number }[];
    receivable: number;
    payable: number;
    low_stock_count: number;
    low_stock: { id: number; name: string; sku: string; stock: number | null; reorder_level: number; unit?: { short_name: string } }[];
    recent_sales: Sale[];
}

const paymentNames: Record<string, string> = { cash: 'Cash', card: 'Card', mobile: 'Mobile banking', bank: 'Bank transfer' };

function change(current: number, previous: number) {
    return previous ? ((current - previous) / Math.abs(previous)) * 100 : null;
}

/** A frosted tile that floats on the banner. */
function GlassStat({ icon, label, value, delta, to }: { icon: ReactNode; label: string; value: string; delta: number | null; to?: string }) {
    return (
        <div className="group/glass min-w-0">
            <div className="rounded-[22px] bg-white/70 p-4 text-[#14160f] shadow-[0_10px_30px_-14px_rgb(0_40_40/0.45)] ring-1 ring-white/55 transition-[transform,translate,scale,rotate,background-color] duration-700 ease-smooth will-change-transform group-hover/glass:-translate-y-1.5 group-hover/glass:bg-white/90">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#14160f]/70 [&_svg]:size-3.5">
                {icon}
                {label}
            </p>
            <div className="mt-4 flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="num truncate text-[28px] leading-8 font-medium tracking-[-0.02em]">{value}</p>
                    {delta !== null && (
                        <p className="num mt-1 flex items-center gap-0.5 text-xs text-[#14160f]/70">
                            {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                            {Math.abs(delta).toFixed(1)}% vs before
                        </p>
                    )}
                </div>
                {to && <CornerLink to={to} label={`Open ${label.toLowerCase()}`} className="bg-white text-[#14160f]" />}
                </div>
            </div>
        </div>
    );
}

function PeriodPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <div className="inline-flex rounded-full bg-white/25 p-1 ring-1 ring-white/30 backdrop-blur-md">
            {['7', '30', '90'].map((days) => (
                <button
                    key={days}
                    type="button"
                    onClick={() => onChange(days)}
                    className={cn('h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors', value === days ? 'bg-white text-[#14160f]' : 'text-white hover:bg-white/15')}
                >
                    {days} days
                </button>
            ))}
        </div>
    );
}

export default function Dashboard() {
    const [days, setDays] = useState('30');
    const can = useCan();
    const user = useSession((s) => s.profile!.user);
    const business = useSession((s) => s.profile!.settings.business_name);
    const store = useCurrentStore();
    const { data } = useApi<DashboardData>('dashboard', { days });

    if (!data) return <PageLoader />;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const margin = data.current.net_sales > 0 ? (data.current.gross_profit / data.current.net_sales) * 100 : 0;
    const netProfit = data.current.gross_profit - (data.current.expenses ?? 0);
    const bars = data.trend.slice(-14);

    return (
        <Page>
            {/* Banner */}
            <section className="relative isolate overflow-hidden rounded-[30px] text-white shadow-card">
                <HeroArt className="-z-10" />

                <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-7">
                    <div className="min-w-0">
                        <h1 className="text-[28px] leading-9 font-medium tracking-[-0.02em] drop-shadow-sm">{store?.name ?? business}</h1>
                        <p className="mt-1 text-[14.5px] text-white/85">
                            {greeting}, {user.name.split(' ')[0]}. Today so far <span className="num font-medium text-white">{money(data.today.net_sales)}</span> from {data.today.orders}{' '}
                            {data.today.orders === 1 ? 'sale' : 'sales'}.
                        </p>
                    </div>
                    <PeriodPicker value={days} onChange={setDays} />
                </div>

                <div className="mt-10 grid items-end gap-3 px-4 pb-4 sm:px-5 sm:pb-5 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="grid gap-3 sm:grid-cols-3 lg:max-w-[720px]">
                        <GlassStat icon={<TrendingUp />} label="Net sales" value={moneyRound(data.current.net_sales)} delta={change(data.current.net_sales, data.previous.net_sales)} to="/reports" />
                        <GlassStat icon={<ReceiptText />} label="Sales made" value={data.current.orders.toLocaleString()} delta={change(data.current.orders, data.previous.orders)} to="/sales" />
                        <GlassStat icon={<Package />} label="Gross profit" value={moneyRound(data.current.gross_profit)} delta={change(data.current.gross_profit, data.previous.gross_profit)} />
                    </div>

                    {(can('pos.access') || can('purchases.manage')) && (
                        <div className="rounded-[22px] bg-accent p-4 text-on-accent shadow-[0_8px_32px_-12px_rgb(0_40_40/0.4)] lg:w-[300px]">
                            <p className="text-[14.5px] font-medium">Quick actions</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {can('pos.access') && (
                                    <Link to="/pos" className="flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-medium text-[#14160f] transition-transform duration-500 ease-smooth hover:scale-105 active:scale-95 [&_svg]:transition-transform [&_svg]:duration-500 hover:[&_svg]:rotate-90">
                                        <Plus className="size-3.5" /> New sale
                                    </Link>
                                )}
                                {can('purchases.manage') && (
                                    <Link to="/purchases" className="flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-medium text-[#14160f] transition-transform duration-500 ease-smooth hover:scale-105 active:scale-95 [&_svg]:transition-transform [&_svg]:duration-500 hover:[&_svg]:translate-x-0.5">
                                        <Truck className="size-3.5" /> Receive stock
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <div className="mt-4 grid gap-4 xl:grid-cols-12">
                {/* Margin */}
                <Card className="lift flex flex-col xl:col-span-3">
                    <CardHeader title="Profit margin" description={`Last ${data.days} days`} />
                    <div className="flex flex-1 flex-col justify-between px-6 pt-1 pb-6">
                        <Ring value={margin} label="of net sales" />
                        <dl className="mt-5 space-y-1.5 text-[13px]">
                            <div className="flex justify-between">
                                <dt className="text-ink-2">Expenses</dt>
                                <dd className="num font-medium">{moneyRound(data.current.expenses)}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-ink-2">Net profit</dt>
                                <dd className={cn('num font-medium', netProfit < 0 && 'text-bad')}>{moneyRound(netProfit)}</dd>
                            </div>
                        </dl>
                    </div>
                </Card>

                {/* Daily sales */}
                <Card className="lift xl:col-span-5">
                    <CardHeader title="Daily sales" description={`${money(data.current.average_order)} average basket`} actions={<span className="rounded-full bg-sunken px-3 py-1 text-xs text-ink-2">Last {bars.length} days</span>} />
                    <div className="pb-4">
                        <DailyBars data={bars} dataKey="sales" label="Net sales" height={270} />
                    </div>
                </Card>

                {/* Latest sales */}
                <Card className="xl:col-span-4 xl:row-span-2">
                    <CardHeader
                        title="Latest sales"
                        description="Straight from the registers"
                        actions={
                            <Link to="/sales" className="flex h-9 shrink-0 items-center rounded-full bg-inverse px-4 text-[13px] font-medium text-on-inverse hover:opacity-90">
                                View all
                            </Link>
                        }
                    />
                    <ul className="space-y-2 px-4 pb-4">
                        {data.recent_sales.slice(0, 5).map((sale) => (
                            <li key={sale.id} className="group/sale">
                                <Link to={`/sales/${sale.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 transition-[transform,translate,scale,rotate,border-color,background-color] duration-700 ease-smooth will-change-transform group-hover/sale:translate-x-1.5 group-hover/sale:border-accent-strong group-hover/sale:bg-brand-soft/50">
                                    <span className="min-w-0">
                                        <span className="block text-[11.5px] text-ink-3">
                                            {formatDateTime(sale.sold_at)}
                                            {!store && sale.store && ` · ${sale.store.code}`}
                                        </span>
                                        <span className="mt-0.5 block truncate text-[14px] font-medium">{sale.customer?.name ?? 'Walk-in customer'}</span>
                                        <span className="font-mono text-[11.5px] text-ink-3">{sale.invoice_no}</span>
                                    </span>
                                    <span className="flex shrink-0 flex-col items-end gap-1">
                                        <span className="num text-[14px] font-medium">{money(sale.total)}</span>
                                        {sale.payment_status !== 'paid' && <PaymentBadge status={sale.payment_status} />}
                                    </span>
                                </Link>
                            </li>
                        ))}
                        {data.recent_sales.length === 0 && <li className="px-2 py-10 text-center text-[13px] text-ink-3">No sales yet.</li>}
                    </ul>
                </Card>

                {/* Stock and dues */}
                <Card className="lift flex flex-col xl:col-span-3">
                    <CardHeader
                        title={data.low_stock_count ? `${data.low_stock_count} running low` : 'Stock is healthy'}
                        description={data.low_stock_count ? 'At or below their reorder level' : 'Nothing is at its reorder level'}
                        actions={can('inventory.view') && <CornerLink to="/inventory" label="Open inventory" className="bg-sunken text-ink" />}
                    />
                    <div className="flex-1 px-6">
                        {data.low_stock_count > 0 ? (
                            <ul className="space-y-1.5 text-[13px]">
                                {data.low_stock.slice(0, 3).map((product) => (
                                    <li key={product.id} className="flex justify-between gap-3">
                                        <span className="truncate text-ink-2">{product.name}</span>
                                        <span className={cn('num shrink-0 font-medium', (product.stock ?? 0) <= 0 ? 'text-bad' : 'text-warn')}>
                                            {qty(product.stock)} {product.unit?.short_name}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {Array.from({ length: 24 }, (_, i) => (
                                    <span key={i} className="size-2.5 rounded-full bg-accent ring-1 ring-accent-strong transition-transform duration-500 ease-smooth ring-inset hover:scale-[1.8]" />
                                ))}
                            </div>
                        )}
                    </div>
                    <dl className="mt-5 grid grid-cols-2 divide-x divide-line border-t border-line">
                        <div className="px-6 py-4">
                            <dt className="text-xs text-ink-3">Customers owe</dt>
                            <dd className="num mt-0.5 text-[17px] font-medium">{moneyRound(data.receivable)}</dd>
                        </div>
                        <div className="px-6 py-4">
                            <dt className="text-xs text-ink-3">You owe suppliers</dt>
                            <dd className="num mt-0.5 text-[17px] font-medium">{moneyRound(data.payable)}</dd>
                        </div>
                    </dl>
                </Card>

                {/* Best sellers */}
                <section className="lift overflow-hidden rounded-[24px] bg-inverse text-on-inverse shadow-card xl:col-span-5">
                    <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4">
                        <h2 className="text-[15px] font-medium">Best sellers</h2>
                        <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-on-accent">By revenue</span>
                    </div>
                    <BarList inverse items={data.top_products.slice(0, 5).map((p) => ({ name: p.name, amount: p.revenue, detail: `${qty(p.quantity)} sold` }))} />
                </section>

                {/* Payment mix / stores */}
                <Card className="lift xl:col-span-6">
                    <CardHeader title="How customers paid" description="Money received in this period" />
                    <BarList share items={data.payment_mix.map((row) => ({ name: paymentNames[row.name] ?? titleCase(row.name), amount: row.amount }))} />
                </Card>

                <Card className="lift xl:col-span-6">
                    {data.by_store.length > 1 ? (
                        <>
                            <CardHeader title="Sales by store" description="Net sales in this period" />
                            <BarList share items={data.by_store.map((row) => ({ name: row.name, amount: row.amount, detail: `${row.orders} sales` }))} />
                        </>
                    ) : (
                        <>
                            <CardHeader title="Profit by day" description="Gross profit, most recent days" />
                            <div className="pb-4">
                                <DailyBars data={bars} dataKey="profit" label="Gross profit" height={190} />
                            </div>
                        </>
                    )}
                </Card>
            </div>
        </Page>
    );
}
