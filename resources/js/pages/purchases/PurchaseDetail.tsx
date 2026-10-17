import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { BackLink, SettleDialog } from '@/components/shared';
import { PaymentBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, Line, Page, PageHeader } from '@/components/ui/Layout';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable, Stack, type Column } from '@/components/ui/Table';
import { formatDate, formatDateTime, money, qty } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useCan } from '@/lib/session';
import type { Purchase } from '@/lib/types';

type Item = NonNullable<Purchase['items']>[number];

export default function PurchaseDetail() {
    const { id } = useParams();
    const can = useCan();
    const { data: purchase } = useApi<Purchase>(`purchases/${id}`);
    const [paying, setPaying] = useState(false);

    if (!purchase) return <PageLoader />;

    const columns: Column<Item>[] = [
        { key: 'product', header: 'Product', cell: (item) => <Stack primary={item.product.name} secondary={<span className="font-mono">{item.product.sku}</span>} /> },
        {
            key: 'qty',
            header: 'Quantity',
            align: 'right',
            cell: (item) => (
                <span className="num">
                    {qty(item.quantity)} <span className="text-ink-3">{item.product.unit?.short_name}</span>
                </span>
            ),
        },
        { key: 'cost', header: 'Unit cost', align: 'right', cell: (item) => <span className="num text-ink-2">{money(item.unit_cost)}</span> },
        { key: 'total', header: 'Amount', align: 'right', cell: (item) => <span className="num font-medium">{money(item.line_total)}</span> },
    ];

    return (
        <Page>
            <PageHeader
                back={<BackLink to="/purchases">Purchases</BackLink>}
                title={
                    <span className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-[19px]">{purchase.reference_no}</span>
                        <PaymentBadge status={purchase.payment_status} />
                    </span>
                }
                description={`${formatDate(purchase.purchased_at)} · received at ${purchase.store?.name}`}
                actions={
                    can('purchases.manage') &&
                    purchase.due_amount > 0 && (
                        <Button variant="primary" icon={<HandCoins />} onClick={() => setPaying(true)}>
                            Pay supplier
                        </Button>
                    )
                }
            />

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <Card>
                    <DataTable columns={columns} rows={purchase.items} />
                    <div className="flex justify-end border-t border-line px-5 py-4">
                        <div className="w-full max-w-xs">
                            <Line label="Subtotal" value={money(purchase.subtotal)} />
                            {purchase.discount_amount > 0 && <Line label="Discount" value={`−${money(purchase.discount_amount)}`} />}
                            {purchase.tax_amount > 0 && <Line label="Tax" value={money(purchase.tax_amount)} />}
                            {purchase.shipping_cost > 0 && <Line label="Shipping" value={money(purchase.shipping_cost)} />}
                            <Line label="Total" value={money(purchase.total)} strong className="mt-1.5 border-t border-line pt-2.5 text-[15px]" />
                            <Line label="Paid" value={money(purchase.paid_amount)} />
                            {purchase.due_amount > 0 && <Line label="Still owed" value={money(purchase.due_amount)} strong className="text-bad [&_span]:text-bad" />}
                        </div>
                    </div>
                </Card>

                <div className="space-y-4">
                    <Card className="px-5 py-4">
                        <h2 className="mb-2 text-sm font-semibold">Supplier</h2>
                        <p className="text-[13.5px] font-medium">{purchase.supplier?.name}</p>
                        {purchase.supplier?.contact_person && <p className="text-[13px] text-ink-2">{purchase.supplier.contact_person}</p>}
                        {purchase.supplier?.phone && <p className="num text-[13px] text-ink-2">{purchase.supplier.phone}</p>}
                        <div className="mt-3 border-t border-line pt-2">
                            {purchase.supplier_invoice_no && <Line label="Their invoice" value={purchase.supplier_invoice_no} />}
                            <Line label="Recorded by" value={purchase.user?.name ?? '—'} />
                        </div>
                        {purchase.note && <p className="mt-2 border-t border-line pt-2 text-[13px] text-ink-2">{purchase.note}</p>}
                    </Card>

                    <Card>
                        <CardHeader title="Payments" />
                        {purchase.payments?.length ? (
                            <ul className="divide-y divide-line border-t border-line">
                                {purchase.payments.map((payment) => (
                                    <li key={payment.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                                        <span>
                                            <span className="block font-medium">{payment.account?.name}</span>
                                            <span className="text-xs text-ink-3">{formatDateTime(payment.transacted_at)}</span>
                                        </span>
                                        <span className="num font-medium">{money(payment.amount)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="border-t border-line px-5 py-6 text-center text-[13px] text-ink-3">Nothing has been paid yet.</p>
                        )}
                    </Card>
                </div>
            </div>

            <SettleDialog
                open={paying}
                onClose={() => setPaying(false)}
                url={`purchases/${purchase.id}/payments`}
                title="Pay supplier"
                due={purchase.due_amount}
                submitLabel="Record payment"
                success="Supplier payment recorded"
            />
        </Page>
    );
}
