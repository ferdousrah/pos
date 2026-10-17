import type { PointerEvent, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

export function Page({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('page-enter mx-auto w-full max-w-[1400px] px-4 pt-2 pb-8 sm:px-6', className)}>{children}</div>;
}

interface PageHeaderProps {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    back?: ReactNode;
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
    return (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
                {back}
                <h1 className="text-[26px] leading-8 font-medium tracking-[-0.02em] text-ink">{title}</h1>
                {description && <p className="mt-1 text-[14px] text-ink-2">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
    return <section className={cn('overflow-hidden rounded-[24px] bg-surface shadow-card dark:ring-1 dark:ring-line', className)}>{children}</section>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="min-w-0">
                <h2 className="text-[15px] font-medium text-ink">{title}</h2>
                {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
            </div>
            {actions}
        </div>
    );
}

/** Filter row that sits on top of a table inside a Card. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('flex flex-wrap items-center gap-2 border-b border-line px-6 py-4', className)}>{children}</div>;
}

export function Tabs({ tabs }: { tabs: { to: string; label: string; end?: boolean }[] }) {
    return (
        <div className="mb-5 max-w-full overflow-x-auto">
            <div className="inline-flex rounded-full bg-surface p-1 shadow-card dark:ring-1 dark:ring-line">
                {tabs.map((tab) => (
                    <NavLink
                        key={tab.to}
                        to={tab.to}
                        end={tab.end}
                        className={({ isActive }) =>
                            cn(
                                'flex h-9 items-center rounded-full px-4 text-[13.5px] font-medium whitespace-nowrap transition-colors',
                                isActive ? 'bg-inverse text-on-inverse' : 'text-ink-2 hover:text-ink',
                            )
                        }
                    >
                        {tab.label}
                    </NavLink>
                ))}
            </div>
        </div>
    );
}

interface StatProps {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    tone?: 'default' | 'good' | 'bad' | 'warn';
    className?: string;
}

const statTone = { default: 'text-ink', good: 'text-good', bad: 'text-bad', warn: 'text-warn' };

/** A single figure with its label. Several of these sit side by side in a StatRow. */
export function Stat({ label, value, hint, tone = 'default', className }: StatProps) {
    return (
        <Card className={cn('min-w-0 px-6 py-5 dark:ring-0', className)}>
            <p className="truncate text-[13px] text-ink-2">{label}</p>
            <p className={cn('num mt-2 truncate text-[28px] leading-8 font-medium tracking-[-0.02em]', statTone[tone])}>{value}</p>
            {hint && <div className="mt-1.5 truncate text-xs text-ink-3">{hint}</div>}
        </Card>
    );
}

/**
 * Feeds the pointer position to the tile under it, so its highlight can follow the cursor.
 * Attach to any container using the `stat-row` class.
 */
export function trackPointer(event: PointerEvent<HTMLElement>) {
    const tile = (event.target as HTMLElement).closest<HTMLElement>('.stat-row > *');
    if (!tile) return;

    const box = tile.getBoundingClientRect();
    tile.style.setProperty('--mx', `${event.clientX - box.left}px`);
    tile.style.setProperty('--my', `${event.clientY - box.top}px`);
}

export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div onPointerMove={trackPointer} className={cn('stat-row mb-4 grid grid-cols-2 gap-3 lg:auto-cols-fr lg:grid-flow-col lg:gap-4', className)}>
            {children}
        </div>
    );
}

/** Label/value pairs used in detail panels and document totals. */
export function Line({ label, value, strong, className }: { label: ReactNode; value: ReactNode; strong?: boolean; className?: string }) {
    return (
        <div className={cn('flex items-baseline justify-between gap-4 py-1 text-[13px]', strong ? 'font-semibold text-ink' : 'text-ink-2', className)}>
            <span>{label}</span>
            <span className={cn('num', !strong && 'text-ink')}>{value}</span>
        </div>
    );
}

/** The round arrow button that sits in the corner of a card and links deeper. */
export function CornerLink({ to, label, className }: { to: string; label: string; className?: string }) {
    return (
        <NavLink
            to={to}
            aria-label={label}
            title={label}
            className={cn('grid size-9 shrink-0 place-items-center rounded-full transition-transform duration-700 ease-smooth hover:scale-110 hover:rotate-45', className)}
        >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 11.5l7-7M5.5 4.5h6v6" />
            </svg>
        </NavLink>
    );
}
