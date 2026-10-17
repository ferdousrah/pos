import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Logo } from './components/Logo';
import { PageLoader, Spinner } from './components/ui/Spinner';
import { Empty } from './components/ui/Table';
import { api } from './lib/api';
import { useCan, useSession } from './lib/session';
import type { Profile } from './lib/types';
import { navigation } from './navigation';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Pos = lazy(() => import('./pages/pos/Pos'));
const Sales = lazy(() => import('./pages/sales/Sales'));
const SaleDetail = lazy(() => import('./pages/sales/SaleDetail'));
const Purchases = lazy(() => import('./pages/purchases/Purchases'));
const PurchaseCreate = lazy(() => import('./pages/purchases/PurchaseCreate'));
const PurchaseDetail = lazy(() => import('./pages/purchases/PurchaseDetail'));
const Products = lazy(() => import('./pages/products/Products'));
const Taxonomy = lazy(() => import('./pages/products/Taxonomy'));
const Stock = lazy(() => import('./pages/inventory/Stock'));
const Movements = lazy(() => import('./pages/inventory/Movements'));
const Adjustments = lazy(() => import('./pages/inventory/Adjustments'));
const Transfers = lazy(() => import('./pages/inventory/Transfers'));
const Contacts = lazy(() => import('./pages/contacts/Contacts'));
const Discounts = lazy(() => import('./pages/discounts/Discounts'));
const Accounts = lazy(() => import('./pages/accounts/Accounts'));
const Transactions = lazy(() => import('./pages/accounts/Transactions'));
const Finance = lazy(() => import('./pages/accounts/Finance'));
const Loans = lazy(() => import('./pages/accounts/Loans'));
const Employees = lazy(() => import('./pages/employees/Employees'));
const Payroll = lazy(() => import('./pages/employees/Payroll'));
const SalesReport = lazy(() => import('./pages/reports/SalesReport'));
const ProfitLoss = lazy(() => import('./pages/reports/ProfitLoss'));
const StockReport = lazy(() => import('./pages/reports/StockReport'));
const ReportLibrary = lazy(() => import('./pages/reports/Library'));
const ReportView = lazy(() => import('./pages/reports/ReportView'));
const Business = lazy(() => import('./pages/settings/Business'));
const Stores = lazy(() => import('./pages/settings/Stores'));
const Users = lazy(() => import('./pages/settings/Users'));
const Roles = lazy(() => import('./pages/settings/Roles'));

function Splash() {
    return (
        <div className="grid h-dvh place-items-center">
            <div className="flex flex-col items-center gap-4 text-ink-3">
                <Logo className="size-10" />
                <Spinner />
            </div>
        </div>
    );
}

/** Renders the page only for users holding one of the permissions. */
function Allow({ any, children }: { any: string[]; children: ReactNode }) {
    const can = useCan();

    if (!any.some(can)) {
        return (
            <div className="py-24">
                <Empty title="You don't have access to this page" hint="Ask an owner to update your role if you need it." />
            </div>
        );
    }

    return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

/** Sends people to the first screen their role can open. */
function Home() {
    const can = useCan();

    if (can('dashboard.view')) {
        return (
            <Suspense fallback={<PageLoader />}>
                <Dashboard />
            </Suspense>
        );
    }

    if (can('pos.access')) return <Navigate to="/pos" replace />;

    const first = navigation.flatMap((group) => group.items).find((item) => item.to !== '/' && item.permissions.some(can));
    return first ? <Navigate to={first.to} replace /> : <Empty title="Your role has no permissions yet" />;
}

function Protected() {
    const profile = useSession((s) => s.profile);
    const location = useLocation();

    if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

    return <Outlet />;
}

export function App() {
    const profile = useSession((s) => s.profile);
    const setProfile = useSession((s) => s.setProfile);

    useEffect(() => {
        api.get<Profile>('me')
            .then((response) => setProfile(response.data))
            .catch(() => setProfile(null));
    }, [setProfile]);

    if (profile === undefined) return <Splash />;

    const page = (permissions: string[], element: ReactNode) => <Allow any={permissions}>{element}</Allow>;

    return (
        <Routes>
            <Route path="/login" element={profile ? <Navigate to="/" replace /> : <Login />} />

            <Route element={<Protected />}>
                <Route path="/pos" element={page(['pos.access'], <Pos />)} />

                <Route element={<AppLayout />}>
                    <Route index element={<Home />} />

                    <Route path="sales" element={page(['sales.view', 'pos.access'], <Sales />)} />
                    <Route path="sales/:id" element={page(['sales.view', 'pos.access'], <SaleDetail />)} />

                    <Route path="purchases" element={page(['purchases.view'], <Purchases />)} />
                    <Route path="purchases/new" element={page(['purchases.manage'], <PurchaseCreate />)} />
                    <Route path="purchases/:id" element={page(['purchases.view'], <PurchaseDetail />)} />

                    <Route path="products" element={page(['products.view'], <Products />)} />
                    <Route path="products/categories" element={page(['products.view'], <Taxonomy key="categories" type="categories" />)} />
                    <Route path="products/brands" element={page(['products.view'], <Taxonomy key="brands" type="brands" />)} />
                    <Route path="products/units" element={page(['products.view'], <Taxonomy key="units" type="units" />)} />

                    <Route path="inventory" element={page(['inventory.view'], <Stock />)} />
                    <Route path="inventory/movements" element={page(['inventory.view'], <Movements />)} />
                    <Route path="inventory/adjustments" element={page(['inventory.view'], <Adjustments />)} />
                    <Route path="inventory/transfers" element={page(['inventory.view'], <Transfers />)} />

                    <Route path="customers" element={page(['customers.view'], <Contacts key="customers" type="customers" />)} />
                    <Route path="suppliers" element={page(['suppliers.view'], <Contacts key="suppliers" type="suppliers" />)} />
                    <Route path="discounts" element={page(['discounts.view'], <Discounts />)} />

                    <Route path="accounts" element={page(['accounts.view'], <Accounts />)} />
                    <Route path="accounts/transactions" element={page(['accounts.view'], <Transactions />)} />
                    <Route path="loans" element={page(['accounts.view'], <Loans />)} />
                    <Route path="expenses" element={page(['finance.view'], <Finance key="expenses" type="expenses" />)} />
                    <Route path="income" element={page(['finance.view'], <Finance key="income" type="income" />)} />

                    <Route path="employees" element={page(['employees.view'], <Employees />)} />
                    <Route path="employees/payroll" element={page(['employees.view'], <Payroll />)} />

                    <Route path="reports" element={page(['reports.view'], <SalesReport />)} />
                    <Route path="reports/profit-loss" element={page(['reports.view'], <ProfitLoss />)} />
                    <Route path="reports/stock" element={page(['reports.view'], <StockReport />)} />
                    <Route path="reports/library" element={page(['reports.view'], <ReportLibrary />)} />
                    <Route path="reports/view/:key" element={page(['reports.view'], <ReportView />)} />

                    <Route path="settings" element={page(['settings.manage'], <Business />)} />
                    <Route path="settings/stores" element={page(['stores.manage'], <Stores />)} />
                    <Route path="settings/users" element={page(['users.manage'], <Users />)} />
                    <Route path="settings/roles" element={page(['users.manage'], <Roles />)} />

                    <Route path="*" element={<div className="py-24"><Empty title="Page not found" hint="The page you are looking for does not exist." /></div>} />
                </Route>
            </Route>
        </Routes>
    );
}
