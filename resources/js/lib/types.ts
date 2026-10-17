export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
}

export type WithSummary<T, S> = Paginated<T> & { summary: S };

export interface StoreRef {
    id: number;
    name: string;
    code: string;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
}

export interface Profile {
    user: { id: number; name: string; email: string; role: string; permissions: string[] };
    stores: StoreRef[];
    settings: Settings;
}

export interface Settings {
    business_name: string;
    business_phone: string;
    business_address: string;
    currency_symbol: string;
    tax_label: string;
    receipt_footer: string;
    allow_negative_stock: string;
}

export interface Named {
    id: number;
    name: string;
}

export interface Unit extends Named {
    short_name: string;
    allow_decimal: boolean;
}

export interface Product {
    id: number;
    name: string;
    size: string | null;
    sku: string;
    barcode: string | null;
    image_url: string | null;
    category_id: number | null;
    brand_id: number | null;
    unit_id: number;
    cost_price: number;
    sale_price: number;
    tax_rate: number;
    reorder_level: number;
    description: string | null;
    is_active: boolean;
    stock: number | null;
    category?: Named | null;
    brand?: Named | null;
    unit?: Unit;
}

export interface Account {
    id: number;
    store_id: number | null;
    name: string;
    type: 'cash' | 'bank' | 'mobile' | 'card';
    account_number: string | null;
    opening_balance: number;
    balance: number;
    is_active: boolean;
    store?: StoreRef | null;
}

export interface Contact {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    note: string | null;
    contact_person?: string | null;
    is_active: boolean;
    sales_count?: number;
    purchases_count?: number;
    total_spent?: number | null;
    total_purchased?: number | null;
    total_due?: number | null;
}

export interface Payment {
    id: number;
    direction: 'in' | 'out';
    amount: number;
    category: string;
    reference: string | null;
    description: string | null;
    transacted_at: string;
    account?: Pick<Account, 'id' | 'name' | 'type'>;
    store?: StoreRef | null;
    user?: Named | null;
}

export interface SaleItem {
    id: number;
    product_id: number;
    product_name: string;
    sku: string;
    quantity: number;
    returned_quantity: number;
    unit_price: number;
    discount_amount: number;
    tax_rate: number;
    tax_amount: number;
    line_total: number;
}

export type PaymentStatus = 'paid' | 'partial' | 'due';

export interface Sale {
    id: number;
    invoice_no: string;
    sold_at: string;
    status: 'completed' | 'partially_returned' | 'returned';
    subtotal: number;
    discount_type: string | null;
    discount_value: number;
    discount_amount: number;
    tax_amount: number;
    total: number;
    paid_amount: number;
    change_amount: number;
    due_amount: number;
    returned_amount: number;
    payment_status: PaymentStatus;
    note: string | null;
    items_count?: number;
    store?: StoreRef;
    customer?: Pick<Contact, 'id' | 'name' | 'phone' | 'address'> | null;
    user?: Named | null;
    discount?: { id: number; name: string; code: string | null } | null;
    items?: SaleItem[];
    payments?: Payment[];
    returns?: SaleReturn[];
}

export interface SaleReturn {
    id: number;
    reference_no: string;
    returned_at: string;
    total_amount: number;
    refund_amount: number;
    note: string | null;
    user?: Named | null;
    items: { id: number; quantity: number; amount: number; sale_item?: { id: number; product_name: string } }[];
}

export interface Purchase {
    id: number;
    reference_no: string;
    supplier_invoice_no: string | null;
    purchased_at: string;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    shipping_cost: number;
    total: number;
    paid_amount: number;
    due_amount: number;
    payment_status: PaymentStatus;
    note: string | null;
    items_count?: number;
    store?: StoreRef;
    supplier?: Contact;
    user?: Named | null;
    items?: { id: number; quantity: number; unit_cost: number; line_total: number; product: Pick<Product, 'id' | 'name' | 'sku'> & { unit?: Unit } }[];
    payments?: Payment[];
}

export interface TotalsSummary {
    count: number;
    total: number;
    paid: number;
    due: number;
}
