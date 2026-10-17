import { decimal, formatDateTime, qty } from '@/lib/format';
import { useSession } from '@/lib/session';
import { PrintPortal } from './PrintPortal';
import type { Sale } from '@/lib/types';

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className={`flex justify-between gap-4 ${bold ? 'text-[13px] font-bold' : ''}`}>
            <span>{label}</span>
            <span className="num">{value}</span>
        </div>
    );
}

function ReceiptPaper({ sale }: { sale: Sale }) {
    const settings = useSession((s) => s.profile!.settings);
    const lineDiscounts = sale.items?.reduce((sum, item) => sum + item.discount_amount, 0) ?? 0;

    return (
        <div className="mx-auto w-[302px] bg-white px-4 py-5 font-mono text-[11.5px] leading-[1.5] text-black">
            <div className="text-center">
                <p className="font-sans text-[15px] font-bold tracking-tight">{settings.business_name}</p>
                {sale.store && <p>{sale.store.name}</p>}
                {sale.store?.address && <p>{sale.store.address}</p>}
                {(sale.store?.phone || settings.business_phone) && <p>Tel: {sale.store?.phone || settings.business_phone}</p>}
            </div>

            <div className="my-3 border-t border-dashed border-black/50" />

            <Row label="Invoice" value={sale.invoice_no} />
            <Row label="Date" value={formatDateTime(sale.sold_at)} />
            {sale.user && <Row label="Cashier" value={sale.user.name} />}
            <Row label="Customer" value={sale.customer?.name ?? 'Walk-in'} />

            <div className="my-3 border-t border-dashed border-black/50" />

            <div className="space-y-1.5">
                {sale.items?.map((item) => (
                    <div key={item.id}>
                        <p className="break-words">{item.product_name}</p>
                        <div className="flex justify-between gap-4">
                            <span className="num pl-2">
                                {qty(item.quantity)} × {decimal(item.unit_price)}
                                {item.discount_amount > 0 && ` − ${decimal(item.discount_amount)}`}
                            </span>
                            <span className="num">{decimal(item.unit_price * item.quantity - item.discount_amount)}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="my-3 border-t border-dashed border-black/50" />

            <Row label="Subtotal" value={decimal(sale.subtotal)} />
            {sale.discount_amount > 0 && <Row label={sale.discount?.code ? `Coupon ${sale.discount.code}` : 'Discount'} value={`−${decimal(sale.discount_amount)}`} />}
            {sale.tax_amount > 0 && <Row label={settings.tax_label} value={decimal(sale.tax_amount)} />}
            <div className="my-1.5 border-t border-black/50" />
            <Row label={`TOTAL (${settings.currency_symbol})`} value={decimal(sale.total)} bold />
            <div className="mt-1.5">
                {sale.payments?.map((payment) => <Row key={payment.id} label={payment.account?.name ?? 'Payment'} value={decimal(payment.amount)} />)}
                {sale.change_amount > 0 && <Row label="Change" value={decimal(sale.change_amount)} />}
                {sale.due_amount > 0 && <Row label="Balance due" value={decimal(sale.due_amount)} bold />}
            </div>

            {lineDiscounts + sale.discount_amount > 0 && (
                <p className="mt-3 border border-black/60 py-1 text-center">You saved {decimal(lineDiscounts + sale.discount_amount)} today</p>
            )}

            <div className="my-3 border-t border-dashed border-black/50" />
            <p className="text-center">{settings.receipt_footer}</p>
        </div>
    );
}

/**
 * An 80mm till receipt: a preview on screen, and an identical copy that is the
 * only thing sent to the printer.
 */
export function Receipt({ sale }: { sale: Sale }) {
    return (
        <>
            <ReceiptPaper sale={sale} />
            <PrintPortal>
                <ReceiptPaper sale={sale} />
            </PrintPortal>
        </>
    );
}
