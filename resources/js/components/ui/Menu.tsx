import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface MenuProps {
    trigger: ReactNode;
    children: ReactNode;
    align?: 'start' | 'end';
    className?: string;
}

export function Menu({ trigger, children, align = 'end', className }: MenuProps) {
    return (
        <Dropdown.Root>
            <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
            <Dropdown.Portal>
                <Dropdown.Content
                    align={align}
                    sideOffset={6}
                    className={cn('z-50 min-w-44 animate-fade rounded-2xl border border-line bg-surface p-1.5 shadow-pop', className)}
                >
                    {children}
                </Dropdown.Content>
            </Dropdown.Portal>
        </Dropdown.Root>
    );
}

interface MenuItemProps {
    onSelect?: () => void;
    icon?: ReactNode;
    children: ReactNode;
    tone?: 'default' | 'danger';
    disabled?: boolean;
    trailing?: ReactNode;
}

export function MenuItem({ onSelect, icon, children, tone = 'default', disabled, trailing }: MenuItemProps) {
    return (
        <Dropdown.Item
            disabled={disabled}
            onSelect={onSelect}
            className={cn(
                'flex h-9 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[13px] outline-none select-none',
                'data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-4',
                tone === 'danger' ? 'text-bad data-[highlighted]:bg-bad-soft' : 'text-ink data-[highlighted]:bg-sunken [&_svg]:text-ink-3',
            )}
        >
            {icon}
            <span className="flex-1 truncate">{children}</span>
            {trailing}
        </Dropdown.Item>
    );
}

export const MenuSeparator = () => <Dropdown.Separator className="-mx-1 my-1 h-px bg-line" />;

export const MenuLabel = ({ children }: { children: ReactNode }) => (
    <Dropdown.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-ink-3 uppercase">{children}</Dropdown.Label>
);

/** The "…" button at the end of a table row. */
export function RowMenu({ children }: { children: ReactNode }) {
    return (
        <Menu
            trigger={
                <Button variant="ghost" size="icon" aria-label="Actions" onClick={(e) => e.stopPropagation()} className="size-8">
                    <MoreHorizontal />
                </Button>
            }
        >
            <div onClick={(e) => e.stopPropagation()}>{children}</div>
        </Menu>
    );
}
