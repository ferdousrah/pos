import { PackagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ProductPicker, type PickedProduct } from '@/components/ProductPicker';
import { AccountSelect, BackLink, useHasStore } from '@/components/shared';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Card, CardHeader, Line, Page, PageHeader } from '@/components/ui/Layout';
import { Empty } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { money, qty, today } from '@/lib/format';
import { useAction, useApi, useForm } from '@/lib/hooks';
import { useCurrentStore } from '@/lib/session';
import type { Named, Purchase } from '@/lib/types';

interface Row {
    product: PickedProduct;
    quantity: string;
    unit_cost: string;
}

const number = (value: string) => parseFloat(value) || 0;

export default function PurchaseCreate() {
    const navigate = useNavigate();
    const hasStore = useHasStore();
    const store = useCurrentStore();
    const { data: suppliers } = useApi<Named[]>('suppliers/options');
    const [rows, setRows] = useState<Row[]>([]);

    const form = useForm({
        supplier_id: '',
        purchased_at: today(),
        supplier_invoice_no: '',
        discount_amount: '',
        tax_amount: '',
        shipping_cost: '',
        paid_amount: '',
        account_id: '',
        note: '',
    });

    const subtotal = rows.reduce((sum, row) => sum + number(row.quantity) * number(row.unit_cost), 0);
    const total = subtotal - number(form.values.discount_amount) + number(form.values.tax_amount) + number(form.values.shipping_cost);
    const paid = number(form.values.paid_amount);

    const update = (id: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.product.id === id ? { ...row, ...patch } : row)));

    const save = useAction(
        () =>
            api.post<Purchase>('purchases', {
                ...form.values,
                paid_amount: paid > 0 ? paid : null,
                account_id: paid > 0 ? form.values.account_id : null,
                items: rows.map((row) => ({ product_id: row.product.id, quantity: number(row.quantity), unit_cost: number(row.unit_cost) })),
            }),
        {
            success: (purchase) => `Purchase ${purchase.reference_no} received into stock`,
            onInvalid: form.invalid,
            onSuccess: (purchase) => navigate(`/purchases/${purchase.id}`, { replace: true }),
        },
    );

    if (!hasStore) return <Navigate to="/purchases" replace />;

    return (
        <Page>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate();
                }}
            >
                <PageHeader
                    back={<BackLink to="/purchases">Purchases</BackLink>}
                    title="New purchase"
                    description={`Receiving into ${store?.name}. Stock and average cost update as soon as you save.`}
                    actions={
                        <>
                            <Button onClick={() => navigate('/purchases')}>Cancel</Button>
                            <Button type="submit" variant="primary" loading={save.isPending} disabled={rows.length === 0}>
                                Save and receive
                            </Button>
                        </>
                    }
                />

                <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-4">
                        <Card className="grid gap-4 p-5 sm:grid-cols-3">
                            <Select label="Supplier" required {...form.bind('supplier_id')}>
                                <option value="">Choose a supplier</option>
                                {suppliers?.map((supplier) => (
                                    <option key={supplier.id} value={supplier.id}>
                                        {supplier.name}
                                    </option>
                                ))}
                            </Select>
                            <Input label="Purchase date" type="date" required max={today()} {...form.bind('purchased_at')} />
                            <Input label="Supplier invoice no." optional {...form.bind('supplier_invoice_no')} />
                        </Card>

                        <Card>
                            <CardHeader title="Items" description="Enter what the supplier charged you per unit." />
                            <div className="px-5 pb-4">
                                <ProductPicker
                                    exclude={rows.map((row) => row.product.id)}
                                    onPick={(product) => setRows((current) => [...current, { product, quantity: '1', unit_cost: String(product.cost_price) }])}
                                />
                            </div>

                            {rows.length === 0 ? (
                                <div className="border-t border-line">
                                    <Empty icon={<PackagePlus />} title="No items yet" hint="Search above to add the products on this delivery." />
                                </div>
                            ) : (
                                <div className="overflow-x-auto border-t border-line">
                                    <table className="w-full text-[13px]">
                                        <thead>
                                            <tr className="border-b border-line text-xs text-ink-3">
                                                <th className="h-10 pr-3 pl-5 text-left font-medium">Product</th>
                                                <th className="w-28 px-2 text-right font-medium">Quantity</th>
                                                <th className="w-32 px-2 text-right font-medium">Unit cost</th>
                                                <th className="w-32 px-3 text-right font-medium">Amount</th>
                                                <th className="w-12" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-line">
                                            {rows.map((row) => (
                                                <tr key={row.product.id}>
                                                    <td className="py-2 pr-3 pl-5">
                                                        <p className="font-medium">{row.product.name}</p>
                                                        <p className="text-xs text-ink-3">
                                                            <span className="font-mono">{row.product.sku}</span> · {qty(row.product.stock)} {row.product.unit?.short_name} on hand
                                                        </p>
                                                    </td>
                                                    <td className="px-2">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            aria-label="Quantity"
                                                            className="h-8 text-right"
                                                            value={row.quantity}
                                                            onChange={(e) => update(row.product.id, { quantity: e.target.value })}
                                                            onFocus={(e) => e.target.select()}
                                                        />
                                                    </td>
                                                    <td className="px-2">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            aria-label="Unit cost"
                                                            className="h-8 text-right"
                                                            value={row.unit_cost}
                                                            onChange={(e) => update(row.product.id, { unit_cost: e.target.value })}
                                                            onFocus={(e) => e.target.select()}
                                                        />
                                                    </td>
                                                    <td className="num px-3 text-right font-medium">{money(number(row.quantity) * number(row.unit_cost))}</td>
                                                    <td className="pr-3">
                                                        <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setRows((current) => current.filter((r) => r.product.id !== row.product.id))}>
                                                            <Trash2 />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>

                        <Card className="p-5">
                            <Textarea label="Note" optional rows={2} {...form.bind('note')} />
                        </Card>
                    </div>

                    <div className="space-y-4 lg:sticky lg:top-[72px]">
                        <Card className="p-5">
                            <h2 className="mb-3 text-sm font-semibold">Summary</h2>
                            <Line label={`Subtotal · ${rows.length} ${rows.length === 1 ? 'item' : 'items'}`} value={money(subtotal)} />
                            <div className="my-3 grid grid-cols-3 gap-2">
                                <Input label="Discount" type="number" min="0" step="0.01" placeholder="0.00" {...form.bind('discount_amount')} />
                                <Input label="Tax" type="number" min="0" step="0.01" placeholder="0.00" {...form.bind('tax_amount')} />
                                <Input label="Shipping" type="number" min="0" step="0.01" placeholder="0.00" {...form.bind('shipping_cost')} />
                            </div>
                            <Line label="Total" value={money(total)} strong className="border-t border-line pt-3 text-[15px]" />
                        </Card>

                        <Card className="space-y-4 p-5">
                            <h2 className="text-sm font-semibold">Payment</h2>
                            <Input
                                label="Paid now"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                hint={
                                    <button type="button" className="font-medium text-ink underline decoration-accent-strong decoration-2 underline-offset-4 hover:decoration-ink" onClick={() => form.set('paid_amount', total.toFixed(2))}>
                                        Pay in full
                                    </button>
                                }
                                {...form.bind('paid_amount')}
                            />
                            {paid > 0 && <AccountSelect label="Paid from" required showBalance {...form.bind('account_id')} />}
                            <Line label="Left on credit" value={money(Math.max(0, total - paid))} className="border-t border-line pt-3" />
                        </Card>
                    </div>
                </div>
            </form>
        </Page>
    );
}
