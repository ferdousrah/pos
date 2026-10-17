import '@fontsource-variable/outfit';
import '@fontsource-variable/geist-mono';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { App } from './App';
import { useSession } from './lib/session';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 20_000, retry: false, refetchOnWindowFocus: false },
    },
});

function Toasts() {
    const theme = useSession((s) => s.theme);

    return (
        <Toaster
            theme={theme}
            position="bottom-right"
            toastOptions={{
                style: {
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    border: '1px solid var(--line)',
                    fontFamily: 'inherit',
                    fontSize: '13.5px',
                },
            }}
        />
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter basename={window.__APP__.base || undefined}>
                <App />
            </BrowserRouter>
            <Toasts />
        </QueryClientProvider>
    </StrictMode>,
);
