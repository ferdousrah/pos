import { HandCoins, Printer, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Receipt } from '@/components/Receipt';
import { AccountSelect, BackLink, SettleDialog } from '@/components/shared';
import { Badge, PaymentBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Card, CardHeader, Line, Page, PageHeader } from '@/components/ui/Layout';
import { FormFooter, Modal } from '@/components/ui/Modal';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDateTime, money, qty } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { useCan, useSession } from '@/lib/session';
import type { Sale, SaleItem } from '@/lib/types';

function ReturnDialog({ sale, open, onClose }: { sale: Sale; open: boolean; onClose: () => void }) {
    const [quantities, setQuantities] = useState<Record<number, string>>({});
    const [accountId, setAccountId] = useState('');
    const [note, setNote] = useState('');

    const returnable = sale.items!.filter((item) => item.quantity - item.returned_quantity > 0);

    // What the customer actually paid per line once the order discount is spread across it.
    const ratio = sale.subtotal + sale.tax_amount > 0 ? sale.total / (sale.subtotal + sale.tax_amount) : 1;
    const value = useMemo(
        () => returnable.reduce((sum, item) => sum + (item.line_total / item.quantity) * (parseFloat(quantities[item.id]) || 0) * ratio, 0),
        [quantities, returnable, ratio],
    );
    const refund = Math.min(Math.max(0, value - sale.due_amount), sale.paid_amount);

    const save = useAction(
        () =>
            api.post(`sales/${sale.id}/returns`, {
                items: returnable.map((item) => ({ sale_item_id: item.id, quantity: parseFloat(quantities[item.id]) || 0 })).filter((item) => item.quantity > 0),
                account_id: accountId || null,
                note: note || null,
            }),
        {
            success: 'Return recorded and stock updated',
            onSuccess: () => {
                setQuantities({});
                setNote('');
                onClose();
            },
        },
    );

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Return items"
            icon={<Undo2 />}
            description={`${sale.invoice_no} · returned goods go back into stock`}
            size="lg"
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel="Record return" disabled={value <= 0} />}
        >
            <div className="overflow-hidden rounded-2xl border border-line">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="border-b border-line bg-canvas/60 text-xs text-ink-3">
                            <th className="h-9 px-3 text-left font-medium">Item</th>
                            <th className="px-3 text-right font-medium">Sold</th>
                            <th className="px-3 text-right font-medium">Can return</th>
                            <th className="w-28 px-3 text-right font-medium">Returning</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {returnable.map((item) => {
                            const left = item.quantity - item.returned_quantity;
                            return (
                                <tr key={item.id}>
                                    <td className="px-3 py-2 font-medium">{item.product_name}</td>
                                    <td className="num px-3 text-right text-ink-2">{qty(item.quantity)}</td>
                                    <td className="num px-3 text-right text-ink-2">{qty(left)}</td>
                                    <td className="px-3 py-1.5">
                                        <Input
                                            type="number"
                                            min="0"
                                            max={left}
                                            step="any"
                                            placeholder="0"
                                            className="h-8 text-right"
                                            value={quantities[item.id] ?? ''}
                                            onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-4">
                    {refund > 0 && <AccountSelect label="Refund from" required value={accountId} onChange={(e) => setAccountId(e.target.value)} />}
                    <Input label="Reason" optional value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Damaged packaging" />
                </div>
                <div className="rounded-2xl bg-sunken px-4 py-3">
                    <Line label="Value of returned goods" value={money(value)} />
                    {sale.due_amount > 0 && <Line label="Taken off unpaid balance" value={money(Math.min(value, sale.due_amount))} />}
                    <Line label="Refund to customer" value={money(refund)} strong className="mt-1 border-t border-line pt-2" />
                </div>
            </div>
        </Modal>
    );
}

export default function SaleDetail() {
    const { id } = useParams();
    const can = useCan();
    const taxLabel = useSession((s) => s.profile!.settings.tax_label);
    const { data: sale } = useApi<Sale>(`sales/${id}`);
    const [dialog, setDialog] = useState<'collect' | 'return' | 'print' | null>(null);

    if (!sale) return <PageLoader />;

    const canReturn = sale.items!.some((item) => item.quantity > item.returned_quantity);

    const columns: Column<SaleItem>[] = [
        {
            key: 'item',
            header: 'Item',
            cell: (item) => (
                <Stack
                    primary={item.product_name}
                    secondary={
                        <>
                            <span className="font-mono">{item.sku}</span>
                            {item.returned_quantity > 0 && <span className="ml-2 text-info">{qty(item.returned_quantity)} returned</span>}
                        </>
                    }
                />
            ),
        },
        { key: 'qty', header: 'Qty', align: 'right', cell: (item) => <span className="num">{qty(item.quantity)}</span> },
        { key: 'price', header: 'Price', align: 'right', cell: (item) => <span className="num text-ink-2">{money(item.unit_price)}</span> },
        {
            key: 'discount',
            header: 'Discount',
            align: 'right',
            hide: 'sm',
            cell: (item) => (item.discount_amount > 0 ? <span className="num text-good">−{money(item.discount_amount)}</span> : <span className="text-ink-3">—</span>),
        },
        { key: 'tax', header: taxLabel, align: 'right', hide: 'sm', cell: (item) => <span className="num text-ink-2">{item.tax_amount > 0 ? money(item.tax_amount) : '—'}</span> },
        { key: 'total', header: 'Amount', align: 'right', cell: (item) => <span className="num font-medium">{money(item.line_total)}</span> },
    ];

    return (
        <Page>
            <PageHeader
                back={<BackLink to="/sales">Sales</BackLink>}
                title={
                    <span className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-[19px]">{sale.invoice_no}</span>
                        <PaymentBadge status={sale.payment_status} />
                        {sale.status !== 'completed' && <Badge tone="info">{sale.status === 'returned' ? 'Returned' : 'Part returned'}</Badge>}
                    </span>
                }
                description={`${formatDateTime(sale.sold_at)} · ${sale.store?.name}`}
                actions={
                    <>
                        <Button icon={<Printer />} onClick={() => setDialog('print')}>
                            Receipt
                        </Button>
                        {can('sales.manage') && canReturn && (
                            <Button icon={<Undo2 />} onClick={() => setDialog('return')}>
                                Return items
                            </Button>
                        )}
                        {can('sales.manage') && sale.due_amount > 0 && (
                            <Button variant="primary" icon={<HandCoins />} onClick={() => setDialog('collect')}>
                                Collect payment
                            </Button>
                        )}
                    </>
                }
            />

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4">
                    <Card>
                        <DataTable columns={columns} rows={sale.items} />
                        <div className="flex justify-end border-t border-line px-5 py-4">
                            <div className="w-full max-w-xs">
                                <Line label="Subtotal" value={money(sale.subtotal)} />
                                {sale.discount_amount > 0 && (
                                    <Line label={sale.discount ? `Discount · ${sale.discount.code ?? sale.discount.name}` : 'Discount'} value={`−${money(sale.discount_amount)}`} />
                                )}
                                {sale.tax_amount > 0 && <Line label={taxLabel} value={money(sale.tax_amount)} />}
                                <Line label="Total" value={money(sale.total)} strong className="mt-1.5 border-t border-line pt-2.5 text-[15px]" />
                                {sale.returned_amount > 0 && <Line label="Returned" value={`−${money(sale.returned_amount)}`} />}
                                <Line label="Paid" value={money(sale.paid_amount)} />
                                {sale.due_amount > 0 && <Line label="Balance due" value={money(sale.due_amount)} strong className="text-bad [&_span]:text-bad" />}
                            </div>
                        </div>
                    </Card>

                    {sale.returns && sale.returns.length > 0 && (
                        <Card>
                            <CardHeader title="Returns" />
                            <ul className="divide-y divide-line border-t border-line">
                                {sale.returns.map((entry) => (
                                    <li key={entry.id} className="flex items-start justify-between gap-4 px-5 py-3 text-[13px]">
                                        <div className="min-w-0">
                                            <p className="font-mono text-[12.5px] font-medium">{entry.reference_no}</p>
                                            <p className="mt-0.5 text-ink-2">{entry.items.map((item) => `${qty(item.quantity)} × ${item.sale_item?.product_name}`).join(', ')}</p>
                                            <p className="mt-0.5 text-xs text-ink-3">
                                                {formatDateTime(entry.returned_at)}
                                                {entry.user && ` · ${entry.user.name}`}
                                                {entry.note && ` · ${entry.note}`}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="num font-medium">{money(entry.total_amount)}</p>
                                            <p className="num text-xs text-ink-3">{entry.refund_amount > 0 ? `${money(entry.refund_amount)} refunded` : 'No refund'}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}
                </div>

                <div className="space-y-4">
                    <Card className="px-5 py-4">
                        <h2 className="mb-2 text-sm font-semibold">Details</h2>
                        <Line label="Customer" value={sale.customer?.name ?? 'Walk-in'} />
                        {sale.customer?.phone && <Line label="Phone" value={sale.customer.phone} />}
                        <Line label="Sold by" value={sale.user?.name ?? '—'} />
                        <Line label="Store" value={sale.store?.name} />
                        {sale.note && <p className="mt-2 border-t border-line pt-2 text-[13px] text-ink-2">{sale.note}</p>}
                    </Card>

                    <Card>
                        <CardHeader title="Payments" />
                        {sale.payments?.length ? (
                            <ul className="divide-y divide-line border-t border-line">
                                {sale.payments.map((payment) => (
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
                open={dialog === 'collect'}
                onClose={() => setDialog(null)}
                url={`sales/${sale.id}/payments`}
                title="Collect payment"
                due={sale.due_amount}
                submitLabel="Record payment"
                success="Payment recorded"
            />

            {dialog === 'return' && <ReturnDialog sale={sale} open onClose={() => setDialog(null)} />}

            <Modal
                open={dialog === 'print'}
                onClose={() => setDialog(null)}
                title="Receipt"
                icon={<Printer />}
                size="sm"
                bodyClassName="border-t border-line bg-sunken !pt-6"
                footer={
                    <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>
                        Print
                    </Button>
                }
            >
                <div className="overflow-hidden rounded-md shadow-card ring-1 ring-black/5">
                    <Receipt sale={sale} />
                </div>
            </Modal>
        </Page>
    );
}
