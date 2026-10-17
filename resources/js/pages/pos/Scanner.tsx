import { CameraOff, Check, ScanBarcode, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';

export interface ScanOutcome {
    ok: boolean;
    /** Product name when found, otherwise why nothing was added. */
    message: string;
}

interface ScannerProps {
    open: boolean;
    onClose: () => void;
    onScan: (code: string) => Promise<ScanOutcome>;
}

interface LogEntry extends ScanOutcome {
    id: number;
    code: string;
}

/** A short beep, so the cashier can keep their eyes on the goods. */
function beep(ok: boolean) {
    try {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = ok ? 1100 : 280;
        gain.gain.value = 0.08;
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + (ok ? 0.09 : 0.22));
        oscillator.onended = () => context.close();
    } catch {
        // Sound is a nicety; scanning works without it.
    }
}

/**
 * Scans barcodes with the device camera and keeps scanning until closed, so a
 * whole basket can be rung up in one go. The decoder is loaded on demand.
 */
export function Scanner({ open, onClose, onScan }: ScannerProps) {
    const video = useRef<HTMLVideoElement>(null);
    const handler = useRef(onScan);
    const [state, setState] = useState<'starting' | 'scanning' | 'error'>('starting');
    const [error, setError] = useState('');
    const [log, setLog] = useState<LogEntry[]>([]);

    handler.current = onScan;

    useEffect(() => {
        if (!open) return;

        let stopped = false;
        let stop: (() => void) | undefined;
        let last = { code: '', at: 0 };
        let counter = 0;

        setState('starting');
        setLog([]);

        (async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new DOMException('Camera access needs a secure (https) connection.', 'NotSupportedError');
                }

                const { BrowserMultiFormatReader } = await import('@zxing/browser');
                const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 600 });

                const controls = await reader.decodeFromConstraints(
                    { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
                    video.current!,
                    (result) => {
                        const code = result?.getText().trim();
                        if (!code || stopped) return;

                        // A label stays in view for many frames. Count it once, and only count the
                        // same code again after it has been out of view for a moment.
                        const now = Date.now();
                        const stillInView = code === last.code && now - last.at < 1500;
                        last = { code, at: now };
                        if (stillInView) return;

                        handler.current(code).then((outcome) => {
                            if (stopped) return;
                            beep(outcome.ok);
                            setLog((entries) => [{ id: ++counter, code, ...outcome }, ...entries].slice(0, 5));
                        });
                    },
                );

                stop = () => controls.stop();
                if (stopped) stop();
                else setState('scanning');
            } catch (cause) {
                if (stopped) return;
                const name = (cause as DOMException)?.name;
                setError(
                    name === 'NotAllowedError'
                        ? 'Camera permission was refused. Allow the camera for this site in the address bar, then try again.'
                        : name === 'NotFoundError' || name === 'OverconstrainedError'
                          ? 'No camera was found on this device. A USB or Bluetooth scanner works without one — just scan.'
                          : name === 'NotReadableError'
                            ? 'The camera is being used by another application.'
                            : ((cause as Error)?.message ?? 'The camera could not be started.'),
                );
                setState('error');
            }
        })();

        return () => {
            stopped = true;
            stop?.();
        };
    }, [open]);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Scan barcodes"
            icon={<ScanBarcode />}
            description="Hold each item's barcode in front of the camera. Keep going — every scan is added to the cart. For two of the same item, take it away and show it again."
            size="md"
            footer={
                <Button variant="primary" onClick={onClose}>
                    Done
                </Button>
            }
        >
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-inverse">
                <video ref={video} muted playsInline className={cn('size-full object-cover', state !== 'scanning' && 'opacity-0')} />

                {state === 'scanning' && (
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        <div className="relative h-[46%] w-[72%] rounded-2xl ring-2 ring-accent shadow-[0_0_0_999px_rgb(0_0_0/0.35)]">
                            <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full bg-accent" />
                        </div>
                    </div>
                )}

                {state === 'starting' && (
                    <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 text-on-inverse/70">
                        <Spinner className="size-5" />
                        <p className="text-[13px]">Starting the camera…</p>
                    </div>
                )}

                {state === 'error' && (
                    <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 px-8 text-center text-on-inverse">
                        <CameraOff className="size-7 opacity-70" />
                        <p className="max-w-sm text-[13px] leading-relaxed text-on-inverse/80">{error}</p>
                    </div>
                )}
            </div>

            <ul className="mt-4 space-y-1.5" aria-live="polite">
                {log.length === 0 && state === 'scanning' && (
                    <li className="flex items-center justify-center gap-2 py-3 text-[13px] text-ink-3">
                        <ScanBarcode className="size-4" /> Waiting for a barcode
                    </li>
                )}
                {log.map((entry, index) => (
                    <li key={entry.id} className={cn('flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13px]', index === 0 ? (entry.ok ? 'bg-brand-soft' : 'bg-bad-soft') : 'opacity-60')}>
                        <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', entry.ok ? 'bg-accent text-on-accent' : 'bg-bad text-white')}>
                            {entry.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{entry.message}</span>
                        <span className="shrink-0 font-mono text-xs text-ink-3">{entry.code}</span>
                    </li>
                ))}
            </ul>
        </Modal>
    );
}
