import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProductPicker, type PickedProduct } from '@/components/ProductPicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { qty } from '@/lib/format';

export const inventoryTabs = [
    { to: '/inventory', label: 'Stock on hand', end: true },
    { to: '/inventory/movements', label: 'Movements' },
    { to: '/inventory/adjustments', label: 'Adjustments' },
    { to: '/inventory/transfers', label: 'Transfers' },
];

export interface ItemRow {
    product: PickedProduct;
    quantity: string;
}

interface ItemRowsProps {
    rows: ItemRow[];
    onChange: (rows: ItemRow[]) => void;
    quantityLabel: string;
    allowNegative?: boolean;
    /** Extra column shown after the quantity, e.g. the resulting stock. */
    result?: { label: string; render: (row: ItemRow) => ReactNode };
}

/** Product picker plus an editable list of quantities, shared by adjustments and transfers. */
export function ItemRows({ rows, onChange, quantityLabel, allowNegative, result }: ItemRowsProps) {
    return (
        <div>
            <ProductPicker exclude={rows.map((row) => row.product.id)} onPick={(product) => onChange([...rows, { product, quantity: '' }])} />

            {rows.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-2xl border border-line">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b border-line bg-canvas/60 text-xs text-ink-3">
                                <th className="h-9 px-3 text-left font-medium">Product</th>
                                <th className="px-3 text-right font-medium">On hand</th>
                                <th className="w-28 px-2 text-right font-medium">{quantityLabel}</th>
                                {result && <th className="px-3 text-right font-medium">{result.label}</th>}
                                <th className="w-10" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {rows.map((row) => (
                                <tr key={row.product.id}>
                                    <td className="px-3 py-2">
                                        <p className="font-medium">{row.product.name}</p>
                                        <p className="font-mono text-xs text-ink-3">{row.product.sku}</p>
                                    </td>
                                    <td className="num px-3 text-right text-ink-2">
                                        {qty(row.product.stock)} {row.product.unit?.short_name}
                                    </td>
                                    <td className="px-2">
                                        <Input
                                            type="number"
                                            step="any"
                                            min={allowNegative ? undefined : '0'}
                                            placeholder="0"
                                            aria-label={quantityLabel}
                                            className="h-8 text-right"
                                            value={row.quantity}
                                            onChange={(e) => onChange(rows.map((r) => (r.product.id === row.product.id ? { ...r, quantity: e.target.value } : r)))}
                                        />
                                    </td>
                                    {result && <td className="num px-3 text-right">{result.render(row)}</td>}
                                    <td className="pr-1.5">
                                        <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => onChange(rows.filter((r) => r.product.id !== row.product.id))}>
                                            <Trash2 />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
