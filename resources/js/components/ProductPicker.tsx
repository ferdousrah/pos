import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { money, qty } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';
import type { Product } from '@/lib/types';
import { Spinner } from './ui/Spinner';

export type PickedProduct = Pick<Product, 'id' | 'name' | 'sku' | 'barcode' | 'cost_price' | 'sale_price' | 'stock'> & { image_url?: string | null; size?: string | null } & {
    unit?: { short_name: string; allow_decimal: boolean };
};

interface ProductPickerProps {
    onPick: (product: PickedProduct) => void;
    /** Ids already added; shown greyed out. */
    exclude?: number[];
    placeholder?: string;
    showStock?: boolean;
}

/**
 * Type-ahead product search. Works with a barcode scanner too: a scan types
 * the code and presses Enter, which picks the first match.
 */
export function ProductPicker({ onPick, exclude = [], placeholder = 'Search by name, SKU or scan a barcode', showStock = true }: ProductPickerProps) {
    const [term, setTerm] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const root = useRef<HTMLDivElement>(null);
    const search = useDebounced(term.trim(), 200);

    const { data, isFetching } = useApi<PickedProduct[]>('products/lookup', { search }, { enabled: open });
    const results = data ?? [];

    useEffect(() => setActive(0), [search]);

    useEffect(() => {
        const close = (event: MouseEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const pick = (product: PickedProduct | undefined) => {
        if (!product || exclude.includes(product.id)) return;
        onPick(product);
        setTerm('');
        setOpen(false);
    };

    return (
        <div ref={root} className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <input
                type="text"
                value={term}
                placeholder={placeholder}
                onFocus={() => setOpen(true)}
                // Already focused after picking an item, so a click has to reopen the list too.
                onClick={() => setOpen(true)}
                onChange={(e) => {
                    setTerm(e.target.value);
                    setOpen(true);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActive((i) => Math.min(i + 1, results.length - 1));
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActive((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        pick(results[active]);
                    } else if (e.key === 'Escape') {
                        setOpen(false);
                    }
                }}
                className="h-10 w-full rounded-xl border border-line-strong bg-surface pr-9 pl-9 text-ink shadow-card placeholder:text-ink-3 focus:border-ink focus:ring-3 focus:ring-accent/60 focus:outline-none"
            />
            {isFetching && <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" />}

            {open && (
                <div className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[300px] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
                    {results.length === 0 ? (
                        <p className="px-3 py-6 text-center text-[13px] text-ink-3">{isFetching ? 'Searching…' : 'No products match.'}</p>
                    ) : (
                        results.map((product, index) => {
                            const added = exclude.includes(product.id);
                            return (
                                <button
                                    key={product.id}
                                    type="button"
                                    disabled={added}
                                    onMouseEnter={() => setActive(index)}
                                    onClick={() => pick(product)}
                                    className={cn(
                                        'flex w-full items-center justify-between gap-4 rounded-md px-3 py-2 text-left text-[13px]',
                                        index === active && !added && 'bg-sunken',
                                        added && 'cursor-default opacity-45',
                                    )}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate font-medium text-ink">{product.name}</span>
                                        <span className="font-mono text-xs text-ink-3">{product.sku}</span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <span className="num block text-ink">{money(product.sale_price)}</span>
                                        {showStock && (
                                            <span className={cn('num text-xs', (product.stock ?? 0) <= 0 ? 'text-bad' : 'text-ink-3')}>
                                                {added ? 'Added' : `${qty(product.stock)} ${product.unit?.short_name ?? ''} in stock`}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
