export interface PosProduct {
    id: number;
    category_id: number | null;
    name: string;
    sku: string;
    barcode: string | null;
    image_url: string | null;
    sale_price: number;
    tax_rate: number;
    stock: number | null;
    unit: { short_name: string; allow_decimal: boolean };
    promotion: { name: string; amount: number } | null;
}

export interface CartLine {
    product: PosProduct;
    quantity: number;
}

export interface OrderRule {
    id: number;
    name: string;
    code?: string;
    type: 'percent' | 'fixed';
    value: number;
    min_purchase: number;
    max_discount: number | null;
}

export type OrderDiscount =
    | { kind: 'manual'; type: 'percent' | 'fixed'; value: number }
    | { kind: 'coupon'; rule: OrderRule };

export interface CartCustomer {
    id: number;
    name: string;
    phone: string | null;
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function lineTotals(line: CartLine) {
    const gross = round(line.product.sale_price * line.quantity);
    const discount = line.product.promotion ? Math.min(gross, round(line.product.promotion.amount * line.quantity)) : 0;
    const net = round(gross - discount);

    return { gross, discount, net, tax: round((net * line.product.tax_rate) / 100) };
}

function ruleAmount(rule: OrderRule, subtotal: number) {
    if (subtotal < rule.min_purchase) return 0;

    let amount = rule.type === 'percent' ? (subtotal * rule.value) / 100 : rule.value;
    if (rule.max_discount && rule.max_discount > 0) amount = Math.min(amount, rule.max_discount);

    return round(Math.max(0, Math.min(amount, subtotal)));
}

/**
 * Mirrors SaleService on the server so the cashier sees the final figure before
 * paying. The server recalculates everything and rejects the sale if the two disagree.
 */
export function cartTotals(lines: CartLine[], discount: OrderDiscount | null, promotions: OrderRule[]) {
    let subtotal = 0;
    let tax = 0;
    let lineDiscounts = 0;

    for (const line of lines) {
        const totals = lineTotals(line);
        subtotal += totals.net;
        tax += totals.tax;
        lineDiscounts += totals.discount;
    }

    subtotal = round(subtotal);
    tax = round(tax);

    let orderDiscount = 0;
    let discountLabel = '';

    if (discount?.kind === 'manual' && discount.value > 0) {
        const amount = discount.type === 'percent' ? (subtotal * Math.min(100, discount.value)) / 100 : discount.value;
        orderDiscount = round(Math.min(amount, subtotal));
        discountLabel = discount.type === 'percent' ? `Discount (${discount.value}%)` : 'Discount';
    } else if (discount?.kind === 'coupon') {
        orderDiscount = ruleAmount(discount.rule, subtotal);
        discountLabel = `Coupon ${discount.rule.code ?? ''}`.trim();
    } else {
        for (const rule of promotions) {
            const amount = ruleAmount(rule, subtotal);
            if (amount > orderDiscount) {
                orderDiscount = amount;
                discountLabel = rule.name;
            }
        }
    }

    return {
        items: lines.reduce((sum, line) => sum + line.quantity, 0),
        subtotal,
        lineDiscounts: round(lineDiscounts),
        orderDiscount,
        discountLabel,
        tax,
        total: round(subtotal - orderDiscount + tax),
    };
}

export interface HeldSale {
    id: string;
    heldAt: string;
    lines: CartLine[];
    customer: CartCustomer | null;
    total: number;
}

const heldKey = (storeId: number) => `kontor.held.${storeId}`;

export function loadHeld(storeId: number): HeldSale[] {
    try {
        return JSON.parse(localStorage.getItem(heldKey(storeId)) ?? '[]');
    } catch {
        return [];
    }
}

export function saveHeld(storeId: number, sales: HeldSale[]) {
    localStorage.setItem(heldKey(storeId), JSON.stringify(sales));
}
