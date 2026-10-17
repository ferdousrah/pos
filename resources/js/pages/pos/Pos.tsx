import { ArrowLeft, Clock, Minus, Pause, Plus, Printer, ScanBarcode, Search, ShoppingBasket, Star, Tag, Trash2, X } from 'lucide-react';
import { BadgeCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/AppLayout';
import { Receipt } from '@/components/Receipt';
import { Button } from '@/components/ui/Button';
import { Input, Segmented } from '@/components/ui/Field';
import { FormFooter, Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Spinner';
import { Empty } from '@/components/ui/Table';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatTime, initials, money, qty } from '@/lib/format';
import { useAction, useApi, useDebounced } from '@/lib/hooks';
import { useCan, useCurrentStore, useSession } from '@/lib/session';
import type { Named, Paginated, Sale } from '@/lib/types';
import { cartTotals, lineTotals, loadHeld, saveHeld, type CartCustomer, type CartLine, type HeldSale, type OrderDiscount, type OrderRule, type PosProduct } from './cart';
import { CustomerPicker } from './CustomerPicker';
import { PaymentPanel, type PosAccount } from './PaymentPanel';
import { Scanner, type ScanOutcome } from './Scanner';

interface Bootstrap {
    categories: Named[];
    accounts: PosAccount[];
    order_promotions: OrderRule[];
}

function StoreGate() {
    const stores = useSession((s) => s.profile!.stores);
    const setStore = useSession((s) => s.setStore);

    return (
        <div className="grid min-h-dvh place-items-center p-6">
            <div className="w-full max-w-sm">
                <h1 className="text-xl font-semibold tracking-tight">Which register are you opening?</h1>
                <p className="mt-1 text-ink-2">Sales are recorded against one store at a time.</p>
                <ul className="mt-6 space-y-2">
                    {stores.map((store) => (
                        <li key={store.id}>
                            <button
                                onClick={() => setStore(store.id)}
                                className="flex w-full items-center justify-between rounded-[20px] border border-transparent bg-surface px-5 py-4 text-left shadow-card hover:border-ink"
                            >
                                <span>
                                    <span className="block font-medium">{store.name}</span>
                                    <span className="text-xs text-ink-3">{store.address}</span>
                                </span>
                                <span className="font-mono text-xs text-ink-3">{store.code}</span>
                            </button>
                        </li>
                    ))}
                </ul>
                <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
                    <ArrowLeft className="size-3.5" /> Back to the office
                </Link>
            </div>
        </div>
    );
}

function DiscountDialog({ open, onClose, subtotal, onApply }: { open: boolean; onClose: () => void; subtotal: number; onApply: (discount: OrderDiscount) => void }) {
    const can = useCan();
    const allowManual = can('sales.discount');
    const symbol = useSession((s) => s.profile!.settings.currency_symbol);
    const [mode, setMode] = useState<'manual' | 'coupon'>(allowManual ? 'manual' : 'coupon');
    const [type, setType] = useState<'percent' | 'fixed'>('percent');
    const [value, setValue] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');

    const coupon = useAction(() => api.post<OrderRule>('pos/coupon', { code, subtotal }), {
        onInvalid: (errors) => setError(Object.values(errors)[0]),
        onSuccess: (rule) => {
            onApply({ kind: 'coupon', rule });
            onClose();
        },
    });

    useEffect(() => {
        if (open) {
            setValue('');
            setCode('');
            setError('');
        }
    }, [open]);

    const submit = () => {
        if (mode === 'coupon') return coupon.mutate();

        const amount = parseFloat(value);
        if (!amount || amount <= 0) return setError('Enter a discount amount.');
        if (type === 'percent' && amount > 100) return setError('A percentage cannot be more than 100.');

        onApply({ kind: 'manual', type, value: amount });
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} title="Order discount" icon={<Tag />} size="sm" onSubmit={submit} footer={<FormFooter onCancel={onClose} loading={coupon.isPending} submitLabel="Apply" />}>
            {allowManual && (
                <Segmented
                    className="mb-4 flex w-full"
                    value={mode}
                    onChange={(next) => {
                        setMode(next);
                        setError('');
                    }}
                    options={[
                        { value: 'manual', label: 'Manual' },
                        { value: 'coupon', label: 'Coupon code' },
                    ]}
                />
            )}

            {mode === 'manual' ? (
                <div className="flex items-start gap-2">
                    <Segmented
                        value={type}
                        onChange={setType}
                        options={[
                            { value: 'percent', label: '%' },
                            { value: 'fixed', label: symbol },
                        ]}
                    />
                    <Input
                        wrapperClassName="flex-1"
                        type="number"
                        min="0"
                        step="0.01"
                        data-autofocus
                        placeholder={type === 'percent' ? 'e.g. 5' : 'e.g. 50'}
                        value={value}
                        error={error || undefined}
                        onChange={(e) => {
                            setValue(e.target.value);
                            setError('');
                        }}
                    />
                </div>
            ) : (
                <Input
                    label="Coupon code"
                    data-autofocus
                    className="font-mono uppercase"
                    value={code}
                    error={error || undefined}
                    onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        setError('');
                    }}
                />
            )}
        </Modal>
    );
}

/** One soft colour per category, so the grid can be scanned by colour as well as by name. */
const tints = ['#e3ec78', '#7fd6c8', '#a9bdf7', '#f7b995', '#f3a8c4', '#c7b3f5', '#e8d08a', '#a8e0b0'];

const FAVOURITES = -1;
const favouritesKey = 'kontor.favourites';

function loadFavourites(): number[] {
    try {
        return JSON.parse(localStorage.getItem(favouritesKey) ?? '[]');
    } catch {
        return [];
    }
}

interface TileProps {
    product: PosProduct;
    inCart: number;
    blocked: boolean;
    favourite: boolean;
    onAdd: () => void;
    onToggleFavourite: () => void;
}

function ProductTile({ product, inCart, blocked, favourite, onAdd, onToggleFavourite }: TileProps) {
    const stock = product.stock ?? 0;
    const price = product.sale_price - (product.promotion?.amount ?? 0);
    const tint = tints[(product.category_id ?? 0) % tints.length];

    return (
        <div
            data-tile
            role="button"
            tabIndex={blocked ? -1 : 0}
            aria-disabled={blocked}
            onClick={blocked ? undefined : onAdd}
            onKeyDown={(event) => {
                if (!blocked && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onAdd();
                }
            }}
            className={cn(
                'group relative flex h-[124px] flex-col justify-between rounded-[20px] border bg-surface p-3 text-left transition-[border-color,translate,scale,box-shadow] duration-500 ease-smooth select-none',
                inCart ? 'border-ink bg-brand-soft/50' : 'border-transparent',
                blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_14px_28px_-18px_rgb(var(--shadow-color)/0.45)] active:translate-y-0 active:scale-[0.97]',
            )}
        >
            <div className="flex items-start gap-2.5">
                {product.image_url ? (
                    <img src={product.image_url} alt="" loading="lazy" className="size-12 shrink-0 rounded-xl bg-sunken object-cover" />
                ) : (
                    <span
                        className="grid size-12 shrink-0 place-items-center rounded-xl text-[12px] font-semibold text-ink"
                        style={{ background: `color-mix(in srgb, ${tint} 55%, var(--surface))` }}
                        aria-hidden
                    >
                        {initials(product.name.replace(/[^\p{L}\p{N}\s]/gu, ''))}
                    </span>
                )}
                <span className="line-clamp-2 min-w-0 flex-1 pr-4 text-[13px] leading-[1.3] font-medium text-ink">{product.name}</span>
            </div>

            <span className="flex items-end justify-between gap-2">
                <span>
                    {product.promotion && <span className="num mr-1.5 text-xs text-ink-3 line-through">{money(product.sale_price)}</span>}
                    <span className={cn('num text-sm font-semibold', product.promotion && 'text-good')}>{money(price)}</span>
                </span>
                <span className={cn('num text-[11px]', stock <= 0 ? 'font-medium text-bad' : 'text-ink-3')}>{stock <= 0 ? 'Out of stock' : `${qty(stock)} ${product.unit.short_name}`}</span>
            </span>

            <button
                type="button"
                aria-label={favourite ? `Remove ${product.name} from favourites` : `Add ${product.name} to favourites`}
                aria-pressed={favourite}
                onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavourite();
                }}
                className={cn(
                    'absolute top-2 right-2 grid size-6 place-items-center rounded-full transition-[opacity,scale] duration-300 hover:scale-125',
                    favourite ? 'text-warn opacity-100' : 'text-ink-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                )}
            >
                <Star className="size-3.5" fill={favourite ? 'currentColor' : 'none'} />
            </button>

            {inCart > 0 && (
                <span className="num absolute -top-2 -left-2 grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-on-accent ring-2 ring-canvas">{qty(inCart)}</span>
            )}
        </div>
    );
}

export default function Pos() {
    const store = useCurrentStore();
    return store ? <Register key={store.id} storeId={store.id} storeName={store.name} /> : <StoreGate />;
}

function Register({ storeId, storeName }: { storeId: number; storeName: string }) {
    const profile = useSession((s) => s.profile!);
    const canOversell = profile.settings.allow_negative_stock === '1';
    const searchRef = useRef<HTMLInputElement>(null);

    const [term, setTerm] = useState('');
    const [categoryId, setCategoryId] = useState<number | null>(null);
    const [favourites, setFavourites] = useState<number[]>(loadFavourites);
    const [lines, setLines] = useState<CartLine[]>([]);
    const [customer, setCustomer] = useState<CartCustomer | null>(null);
    const [discount, setDiscount] = useState<OrderDiscount | null>(null);
    const [held, setHeld] = useState<HeldSale[]>(() => loadHeld(storeId));
    const [dialog, setDialog] = useState<'pay' | 'discount' | 'held' | 'scan' | null>(null);
    const [receipt, setReceipt] = useState<Sale | null>(null);
    const [cartOpen, setCartOpen] = useState(false);
    const [clock, setClock] = useState(() => new Date());

    const search = useDebounced(term.trim(), 220);
    const { data: boot } = useApi<Bootstrap>('pos/bootstrap');
    const { data: products, isLoading } = useApi<Paginated<PosProduct>>('pos/products', {
        search,
        category_id: categoryId === FAVOURITES ? undefined : categoryId,
        // "0" matches nothing, so an empty favourites list shows the empty state rather than everything.
        ids: categoryId === FAVOURITES ? favourites.join(',') || '0' : undefined,
        per_page: 60,
    });

    const totals = useMemo(() => cartTotals(lines, discount, boot?.order_promotions ?? []), [lines, discount, boot]);

    useEffect(() => {
        const timer = setInterval(() => setClock(new Date()), 30_000);
        return () => clearInterval(timer);
    }, []);

    const add = useCallback(
        (product: PosProduct, amount = 1) => {
            setLines((current) => {
                const existing = current.find((line) => line.product.id === product.id);
                const next = (existing?.quantity ?? 0) + amount;

                if (!canOversell && next > (product.stock ?? 0)) {
                    toast.error(`Only ${qty(product.stock)} ${product.unit.short_name} of ${product.name} in stock.`);
                    return current;
                }

                return existing
                    ? current.map((line) => (line.product.id === product.id ? { product, quantity: next } : line))
                    : [...current, { product, quantity: next }];
            });
        },
        [canOversell],
    );

    const toggleFavourite = (productId: number) => {
        setFavourites((current) => {
            const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
            localStorage.setItem(favouritesKey, JSON.stringify(next));
            return next;
        });
    };

    const setQuantity = (productId: number, quantity: number) => {
        setLines((current) =>
            current.flatMap((line) => {
                if (line.product.id !== productId) return [line];
                if (!quantity || quantity <= 0) return [];

                const allowed = line.product.unit.allow_decimal ? quantity : Math.round(quantity);
                if (!canOversell && allowed > (line.product.stock ?? 0)) {
                    toast.error(`Only ${qty(line.product.stock)} ${line.product.unit.short_name} in stock.`);
                    return [{ ...line, quantity: line.product.stock ?? line.quantity }];
                }

                return [{ ...line, quantity: allowed }];
            }),
        );
    };

    const clear = () => {
        setLines([]);
        setCustomer(null);
        setDiscount(null);
    };

    /**
     * Finds the product a code belongs to and adds it to the cart. Shared by the
     * search box, the camera scanner and hardware scanners.
     */
    const lookup = useCallback(
        async (code: string): Promise<ScanOutcome> => {
            try {
                const { data } = await api.get<Paginated<PosProduct>>('pos/products', { params: { search: code, per_page: 5 } });
                const match = data.data.find((p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase()) ?? (data.data.length === 1 ? data.data[0] : null);

                if (!match) return { ok: false, message: data.data.length ? 'More than one product matches' : 'No product with this code' };
                if (!canOversell && (match.stock ?? 0) <= 0) return { ok: false, message: `${match.name} is out of stock` };

                add(match);
                return { ok: true, message: match.name };
            } catch (error) {
                return { ok: false, message: errorMessage(error) };
            }
        },
        [add, canOversell],
    );

    /** Enter in the search box. */
    const scan = async () => {
        const code = term.trim();
        if (!code) return;

        const outcome = await lookup(code);
        if (outcome.ok) setTerm('');
        else if (outcome.message !== 'More than one product matches') toast.error(`${outcome.message}: “${code}”.`);
    };

    // A USB or Bluetooth scanner "types" the code very fast and presses Enter.
    // Catch that burst wherever the focus is, so the cashier never has to click the search box first.
    useEffect(() => {
        let buffer = '';
        let lastKey = 0;

        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
            if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

            const now = performance.now();
            // Scanners send a character every 5–50 ms; people typing by hand are far slower.
            if (now - lastKey > 120) buffer = '';
            lastKey = now;

            if (event.key === 'Enter') {
                const code = buffer;
                buffer = '';
                if (code.length >= 4) {
                    event.preventDefault();
                    event.stopPropagation();
                    lookup(code).then((outcome) => (outcome.ok ? toast.success(`Added ${outcome.message}`) : toast.error(`${outcome.message}: “${code}”.`)));
                }
            } else if (event.key.length === 1) {
                buffer += event.key;
            }
        };

        // Capture phase: runs before a focused product tile treats Enter as a click.
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [lookup]);

    const checkout = useAction(
        (payments: { account_id: number; amount: number }[]) =>
            api.post<Sale>('sales', {
                customer_id: customer?.id ?? null,
                items: lines.map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
                discount: discount?.kind === 'manual' ? { type: discount.type, value: discount.value } : null,
                coupon_code: discount?.kind === 'coupon' ? discount.rule.code : null,
                payments,
                expected_total: totals.total,
            }),
        {
            onSuccess: (sale) => {
                setDialog(null);
                setReceipt(sale);
                clear();
                setCartOpen(false);
            },
        },
    );

    const hold = () => {
        const next = [{ id: crypto.randomUUID(), heldAt: new Date().toISOString(), lines, customer, total: totals.total }, ...held];
        setHeld(next);
        saveHeld(storeId, next);
        clear();
        toast.success('Sale put on hold');
    };

    const resume = (sale: HeldSale) => {
        const next = held.filter((item) => item.id !== sale.id);
        setHeld(next);
        saveHeld(storeId, next);
        setLines(sale.lines);
        setCustomer(sale.customer);
        setDiscount(null);
        setDialog(null);
    };

    const discardHeld = (id: string) => {
        const next = held.filter((item) => item.id !== id);
        setHeld(next);
        saveHeld(storeId, next);
    };

    // Register shortcuts: F2 jumps to search, F9 opens payment.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'F2') {
                event.preventDefault();
                searchRef.current?.focus();
                searchRef.current?.select();
            }
            if (event.key === 'F9' && lines.length > 0 && !dialog && !receipt) {
                event.preventDefault();
                setDialog('pay');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lines.length, dialog, receipt]);

    const quantities = useMemo(() => new Map(lines.map((line) => [line.product.id, line.quantity])), [lines]);

    return (
        <div className="flex h-dvh flex-col bg-canvas">
            <header className="flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
                <Link to="/" className="flex h-9 items-center gap-2 rounded-md pr-3 pl-2 text-[13px] font-medium text-ink-2 hover:bg-sunken hover:text-ink">
                    <ArrowLeft className="size-4" />
                    <span className="hidden sm:inline">Back office</span>
                </Link>
                <div className="h-5 w-px bg-line" />
                <div className="min-w-0 leading-tight">
                    <p className="truncate text-[13.5px] font-semibold">{storeName}</p>
                    <p className="truncate text-[11px] text-ink-3">{profile.user.name}</p>
                </div>

                <div className="relative mx-auto hidden w-full max-w-md md:block">
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                        ref={searchRef}
                        autoFocus
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && scan()}
                        placeholder="Search products or scan a barcode"
                        className="h-10 w-full rounded-full border border-transparent bg-surface pr-12 pl-10 text-[13.5px] placeholder:text-ink-3 focus:border-ink focus:bg-surface focus:ring-3 focus:ring-accent/60 focus:outline-none"
                    />
                    <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-line bg-surface px-1.5 font-mono text-[10px] text-ink-3">F2</kbd>
                </div>

                <div className="ml-auto flex items-center gap-1.5 md:ml-0">
                    <Button variant="accent" icon={<ScanBarcode />} onClick={() => setDialog('scan')} title="Scan barcodes with the camera">
                        <span className="hidden sm:inline">Scan</span>
                    </Button>
                    {held.length > 0 && (
                        <Button variant="subtle" size="sm" icon={<Pause />} onClick={() => setDialog('held')}>
                            {held.length} on hold
                        </Button>
                    )}
                    <span className="num hidden items-center gap-1.5 px-2 text-[13px] text-ink-2 lg:flex">
                        <Clock className="size-3.5 text-ink-3" />
                        {formatTime(clock.toISOString())}
                    </span>
                    <ThemeToggle />
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                {dialog === 'pay' && (
                    <PaymentPanel
                        total={totals.total}
                        accounts={boot?.accounts ?? []}
                        customer={customer}
                        loading={checkout.isPending}
                        onBack={() => setDialog(null)}
                        onConfirm={(payments) => checkout.mutate(payments)}
                    />
                )}

                {/* Catalogue (kept mounted while paying so the grid keeps its place) */}
                <section className={cn('flex min-w-0 flex-1 flex-col', dialog === 'pay' && 'hidden')}>
                    <div className="px-3 pt-3 md:hidden">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                            <input
                                value={term}
                                onChange={(e) => setTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && scan()}
                                placeholder="Search or scan"
                                className="h-10 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-9 placeholder:text-ink-3 focus:border-brand focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 py-3 sm:px-4">
                        {[{ id: null as number | null, name: 'All items' }, { id: FAVOURITES, name: 'Favourites' }, ...(boot?.categories ?? [])].map((category) => (
                            <button
                                key={category.id ?? 'all'}
                                onClick={() => setCategoryId(category.id)}
                                className={cn(
                                    'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium whitespace-nowrap transition-colors duration-300',
                                    categoryId === category.id ? 'bg-inverse text-on-inverse' : 'bg-surface text-ink-2 hover:text-ink',
                                )}
                            >
                                {category.id === FAVOURITES && <Star className="size-3.5" fill={favourites.length ? 'currentColor' : 'none'} />}
                                {category.name}
                            </button>
                        ))}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 sm:px-4 lg:pb-4">
                        {isLoading ? (
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5">
                                {Array.from({ length: 18 }, (_, i) => (
                                    <Skeleton key={i} className="h-[124px] rounded-[20px]" />
                                ))}
                            </div>
                        ) : products?.data.length === 0 ? (
                            categoryId === FAVOURITES && !search ? (
                                <Empty icon={<Star />} title="No favourites yet" hint="Hover a product and tap its star to keep your fastest sellers one tap away. Saved on this device." />
                            ) : (
                                <Empty icon={<Search />} title="No products found" hint="Try a different name, SKU or category." />
                            )
                        ) : (
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5 pt-2">
                                {products?.data.map((product) => (
                                    <ProductTile
                                        key={product.id}
                                        product={product}
                                        inCart={quantities.get(product.id) ?? 0}
                                        blocked={!canOversell && (product.stock ?? 0) <= 0}
                                        favourite={favourites.includes(product.id)}
                                        onAdd={() => add(product, product.unit.allow_decimal ? 0.5 : 1)}
                                        onToggleFavourite={() => toggleFavourite(product.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                {/* Cart */}
                <aside
                    className={cn(
                        'flex w-full flex-col bg-surface lg:static lg:my-3 lg:mr-3 lg:w-[400px] lg:translate-x-0 lg:overflow-hidden lg:rounded-[26px] lg:shadow-card',
                        'max-lg:fixed max-lg:inset-0 max-lg:z-30 max-lg:transition-transform',
                        !cartOpen && 'max-lg:translate-x-full',
                    )}
                >
                    <div className="flex shrink-0 items-center gap-2 border-b border-line p-3">
                        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setCartOpen(false)} aria-label="Back to products">
                            <ArrowLeft />
                        </Button>
                        <div className="min-w-0 flex-1">
                            <CustomerPicker value={customer} onChange={setCustomer} />
                        </div>
                    </div>

                    {lines.length === 0 ? (
                        <div className="grid flex-1 place-items-center">
                            <Empty icon={<ShoppingBasket />} title="The cart is empty" hint="Tap a product or scan a barcode to start a sale." />
                        </div>
                    ) : (
                        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
                            {lines.map((line) => {
                                const line$ = lineTotals(line);
                                const step = line.product.unit.allow_decimal ? 0.5 : 1;

                                return (
                                    <li key={line.product.id} className="flex items-center gap-3 px-4 py-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13.5px] font-medium">{line.product.name}</p>
                                            <p className="num text-xs text-ink-3">
                                                {money(line.product.sale_price)} / {line.product.unit.short_name}
                                                {line$.discount > 0 && <span className="ml-1.5 text-good">−{money(line$.discount)}</span>}
                                            </p>
                                        </div>

                                        <div className="flex h-9 shrink-0 items-center overflow-hidden rounded-full border border-line-strong">
                                            <button
                                                type="button"
                                                aria-label="Decrease"
                                                onClick={() => setQuantity(line.product.id, line.quantity - step)}
                                                className="grid h-full w-8 place-items-center text-ink-2 hover:bg-sunken hover:text-ink"
                                            >
                                                {line.quantity <= step ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
                                            </button>
                                            <input
                                                type="number"
                                                aria-label="Quantity"
                                                value={line.quantity}
                                                step={step}
                                                min="0"
                                                onChange={(e) => setQuantity(line.product.id, parseFloat(e.target.value) || 0)}
                                                onFocus={(e) => e.target.select()}
                                                className="num h-full w-11 border-x border-line bg-transparent text-center text-[13px] font-medium focus:outline-none"
                                            />
                                            <button
                                                type="button"
                                                aria-label="Increase"
                                                onClick={() => add(line.product, step)}
                                                className="grid h-full w-8 place-items-center text-ink-2 hover:bg-sunken hover:text-ink"
                                            >
                                                <Plus className="size-3.5" />
                                            </button>
                                        </div>

                                        <span className="num w-[76px] shrink-0 text-right text-[13.5px] font-semibold">{money(line$.net)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <div className="shrink-0 border-t border-line bg-canvas/50 px-4 pt-3 pb-4">
                        <dl className="space-y-1.5 text-[13px]">
                            <div className="flex justify-between text-ink-2">
                                <dt>
                                    Subtotal <span className="text-ink-3">· {qty(totals.items)} items</span>
                                </dt>
                                <dd className="num text-ink">{money(totals.subtotal)}</dd>
                            </div>

                            <div className="flex items-center justify-between text-ink-2">
                                {totals.orderDiscount > 0 ? (
                                    <>
                                        <dt className="flex min-w-0 items-center gap-1.5">
                                            <Tag className="size-3.5 shrink-0 text-good" />
                                            <span className="truncate">{totals.discountLabel}</span>
                                            {discount && (
                                                <button type="button" aria-label="Remove discount" onClick={() => setDiscount(null)} className="grid size-5 place-items-center rounded text-ink-3 hover:bg-sunken hover:text-ink">
                                                    <X className="size-3.5" />
                                                </button>
                                            )}
                                        </dt>
                                        <dd className="num text-good">−{money(totals.orderDiscount)}</dd>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={lines.length === 0}
                                        onClick={() => setDialog('discount')}
                                        className="flex items-center gap-1.5 font-medium text-brand hover:underline disabled:text-ink-3 disabled:no-underline dark:text-brand-strong"
                                    >
                                        <Tag className="size-3.5" />
                                        {discount ? 'Change discount' : 'Add discount or coupon'}
                                    </button>
                                )}
                            </div>

                            {totals.tax > 0 && (
                                <div className="flex justify-between text-ink-2">
                                    <dt>{profile.settings.tax_label}</dt>
                                    <dd className="num text-ink">{money(totals.tax)}</dd>
                                </div>
                            )}
                        </dl>

                        <div className="mt-3 flex gap-2 border-t border-line pt-3">
                            <Button size="lg" className="px-3.5" disabled={lines.length === 0} onClick={hold} aria-label="Hold sale" title="Hold this sale">
                                <Pause />
                            </Button>
                            <Button size="lg" className="px-3.5" disabled={lines.length === 0} onClick={clear} aria-label="Clear cart" title="Clear the cart">
                                <Trash2 />
                            </Button>
                            <Button
                                variant={dialog === 'pay' ? 'secondary' : 'accent'}
                                size="lg"
                                className="flex-1 justify-between px-5"
                                disabled={lines.length === 0}
                                onClick={() => {
                                    setDialog(dialog === 'pay' ? null : 'pay');
                                    setCartOpen(false);
                                }}
                            >
                                <span className="flex items-center gap-2">
                                    {dialog === 'pay' ? 'Paying' : 'Charge'}
                                    <kbd className="rounded border border-current/25 px-1.5 font-mono text-[10px] font-normal opacity-60">F9</kbd>
                                </span>
                                <span className="num text-[19px] font-semibold tracking-[-0.01em]">{money(totals.total)}</span>
                            </Button>
                        </div>
                    </div>
                </aside>
            </div>

            {/* Phone: a bar that opens the cart */}
            {lines.length > 0 && !cartOpen && (
                <button
                    onClick={() => setCartOpen(true)}
                    className="fixed inset-x-3 bottom-3 z-20 flex h-13 items-center justify-between rounded-xl bg-brand px-5 py-3.5 text-on-brand shadow-pop lg:hidden"
                >
                    <span className="flex items-center gap-2 text-sm font-medium">
                        <ShoppingBasket className="size-4" /> {qty(totals.items)} items
                    </span>
                    <span className="num text-base font-semibold">{money(totals.total)}</span>
                </button>
            )}

            <Scanner open={dialog === 'scan'} onClose={() => setDialog(null)} onScan={lookup} />

            <DiscountDialog open={dialog === 'discount'} onClose={() => setDialog(null)} subtotal={totals.subtotal} onApply={setDiscount} />

            <Modal open={dialog === 'held'} onClose={() => setDialog(null)} title="Sales on hold" icon={<Pause />} description="Held on this device only." flush>
                <ul className="divide-y divide-line">
                    {held.map((sale) => (
                        <li key={sale.id} className="flex items-center gap-3 px-5 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13.5px] font-medium">{sale.customer?.name ?? 'Walk-in customer'}</p>
                                <p className="text-xs text-ink-3">
                                    {sale.lines.length} {sale.lines.length === 1 ? 'line' : 'lines'} · held at {formatTime(sale.heldAt)}
                                </p>
                            </div>
                            <span className="num text-[13.5px] font-semibold">{money(sale.total)}</span>
                            <Button size="sm" variant="primary" disabled={lines.length > 0} title={lines.length > 0 ? 'Finish or hold the current sale first' : undefined} onClick={() => resume(sale)}>
                                Resume
                            </Button>
                            <Button size="icon" variant="ghost" aria-label="Discard" onClick={() => discardHeld(sale.id)}>
                                <Trash2 />
                            </Button>
                        </li>
                    ))}
                    {held.length === 0 && <li className="px-5 py-10 text-center text-[13px] text-ink-3">Nothing on hold.</li>}
                </ul>
            </Modal>

            <Modal
                open={receipt !== null}
                onClose={() => setReceipt(null)}
                title="Sale complete"
                icon={<BadgeCheck />}
                description={receipt ? `${receipt.invoice_no}${receipt.change_amount > 0 ? ` · give ${money(receipt.change_amount)} change` : ''}` : undefined}
                size="sm"
                bodyClassName="border-t border-line bg-sunken !pt-6"
                footer={
                    <>
                        <Button icon={<Printer />} onClick={() => window.print()}>
                            Print receipt
                        </Button>
                        <Button variant="primary" data-autofocus onClick={() => setReceipt(null)}>
                            New sale
                        </Button>
                    </>
                }
            >
                {receipt && (
                    <div className="overflow-hidden rounded-md shadow-card ring-1 ring-black/5">
                        <Receipt sale={receipt} />
                    </div>
                )}
            </Modal>
        </div>
    );
}
