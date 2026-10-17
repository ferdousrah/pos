# Kontor

Multi-store retail management: point of sale, inventory, purchases, accounts, discounts, employees and reports.

Laravel 12 API · React 19 + TypeScript single-page app · MySQL / MariaDB.

## Requirements

- PHP 8.2+ with `pdo_mysql`, `mbstring`, `bcmath`, `intl`
- Composer 2
- Node 20+
- MySQL 8 or MariaDB 10.4+

## Setup

```bash
composer install
npm install

cp .env.example .env
php artisan key:generate
```

Create a database and point `.env` at it (`DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`), then:

```bash
php artisan migrate --seed   # roles, settings and a demo business with ~6 weeks of trading
npm run build
php artisan serve --port=8010
```

Open <http://localhost:8010>. Seeding takes a few minutes because every demo sale and purchase goes
through the same services the application uses.

While working on the frontend, run `npm run dev` next to `php artisan serve` for hot reloading.

The app also runs from a sub-folder without extra configuration, e.g. under XAMPP at
`http://localhost/pos/public` (build the assets first).

### Demo accounts

All use the password `password`.

| Role          | Email                  | Sees                         |
| ------------- | ---------------------- | ---------------------------- |
| Owner         | owner@kontor.test      | Everything, all stores       |
| Store manager | manager@kontor.test    | Dhanmondi and Gulshan stores |
| Cashier       | cashier@kontor.test    | Register at Dhanmondi        |
| Accountant    | accounts@kontor.test   | Money and reports            |

## Deploying with Coolify

The repository ships a `Dockerfile` (Nginx + PHP 8.3-FPM on port 8080, built on
[serversideup/php](https://serversideup.net/open-source/docker-php/)). Every time the container starts it
runs the migrations, caches config/routes/views and — on an empty database only — creates the roles and the
first owner account. Redeploys never touch existing data.

1. **Push this project to a Git repository** (GitHub, GitLab, Gitea…). Coolify deploys from there.
2. **Database.** In Coolify: *+ New → Database → MySQL 8* (MariaDB 10.11+ also works). Note the internal
   host, database, user and password. Turn on *Scheduled Backups* — this is your business data.
3. **Application.** *+ New → Application → your repository*, then:
   - Build pack: **Dockerfile**
   - Ports exposes: **8080**
   - Domain: e.g. `https://pos.example.com` (Coolify issues the certificate)
   - Health check: path **`/up`**, port **8080**
4. **Persistent storage.** Add a volume with destination **`/var/www/html/public/uploads`** — product
   photos live here and must survive redeploys.
5. **Environment variables** (generate the key locally with `php artisan key:generate --show`):

   ```env
   APP_NAME=Kontor
   APP_ENV=production
   APP_DEBUG=false
   APP_KEY=base64:...
   APP_URL=https://pos.example.com
   APP_TIMEZONE=Asia/Dhaka

   DB_CONNECTION=mysql
   DB_HOST=<internal host from step 2>
   DB_PORT=3306
   DB_DATABASE=<database>
   DB_USERNAME=<user>
   DB_PASSWORD=<password>

   SESSION_DRIVER=database
   SESSION_LIFETIME=720
   SESSION_SECURE_COOKIE=true
   CACHE_STORE=database
   QUEUE_CONNECTION=sync
   LOG_CHANNEL=stderr
   LOG_LEVEL=warning

   # First start only: the owner account and first store
   KONTOR_ADMIN_NAME="Your Name"
   KONTOR_ADMIN_EMAIL=you@example.com
   KONTOR_ADMIN_PASSWORD=<at least 8 characters>
   KONTOR_STORE_NAME="Main store"
   KONTOR_STORE_CODE=MAIN
   KONTOR_BUSINESS_NAME="Your Business Ltd."
   ```

6. **Deploy**, then sign in with the owner account. Add more stores, users and products from the app.
   After the first sign-in the `KONTOR_ADMIN_*` values are no longer used and can be removed.

To update, push to the repository and redeploy (or turn on Coolify's automatic deployments).

For a **demo server** instead of a real one, add `KONTOR_SEED_DEMO=true` before the first deploy. Loading the
demo business takes several minutes on the first start, so raise the health check's start period or deploy
once without the health check.

## How it is put together

```
app/
  Http/Controllers/Api   thin controllers: validate, call a service, return JSON
  Http/Middleware        SetStoreContext (X-Store-Id header), CheckPermission
  Services               the business rules
    SaleService            pricing, promotions, payments, returns
    PurchaseService        receiving stock, supplier payments
    InventoryService       the only place stock changes; adjustments, transfers
    LedgerService          the only place account balances change
    DiscountService        promotions and coupons
    ReportService          trading figures for the dashboard and reports
    SequenceService        gap-free document numbers per store and month
  Support                StoreContext, Permissions catalogue
resources/js
  components/ui          the design system (buttons, fields, tables, dialogs)
  pages                  one folder per area of the app
  lib                    API client, session store, formatting, hooks
```

A few rules the code relies on:

- **Stock** — `stock_levels.quantity` always equals the sum of `stock_movements` for that store and
  product. Nothing writes to either table except `InventoryService::move()`.
- **Money** — `accounts.balance` always equals the sum of its `transactions`. Sales, supplier
  payments, expenses, income, salaries, refunds and transfers all post through `LedgerService`.
- **Prices** — the register shows totals calculated in the browser, but the server recalculates every
  sale from the database and rejects it if the two disagree.
- **Stores** — the selected store travels in the `X-Store-Id` header. Without it a request runs in
  "all stores" mode: lists and reports span every store the user can access, and anything that
  creates a document asks for a specific store.
- **Cost** — products carry a weighted average cost that is refreshed each time a purchase is
  received. Each sale line stores the cost at the time of sale, so past profit never shifts.
- **Permissions** — roles hold a list of permission keys from `App\Support\Permissions`. The API
  enforces them per route; the UI only hides what the API would refuse anyway.

## Register shortcuts

| Key   | Action                                   |
| ----- | ---------------------------------------- |
| F2    | Focus the search box                     |
| Enter | Add the scanned barcode / exact SKU      |
| F9    | Take payment                             |
