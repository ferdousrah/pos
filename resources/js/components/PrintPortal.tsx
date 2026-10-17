import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * Content meant for the printer only. It is attached straight to <body>, and while
 * it exists everything else is removed from the printed page — so nothing on screen
 * (a dialog, the page behind it) can clip it, shift it or add blank pages.
 */
export function PrintPortal({ children, className }: { children: ReactNode; className?: string }) {
    return createPortal(<div className={cn('printable print-only', className)}>{children}</div>, document.body);
}
