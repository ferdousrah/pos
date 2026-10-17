<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Discount;
use App\Models\Employee;
use App\Models\FinanceCategory;
use App\Models\FinanceEntry;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Role;
use App\Models\SalaryPayment;
use App\Models\Sale;
use App\Models\StockLevel;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\Transaction;
use App\Models\Unit;
use App\Models\User;
use App\Services\InventoryService;
use App\Services\LedgerService;
use App\Services\PurchaseService;
use App\Services\SaleService;
use App\Services\SequenceService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Builds a believable three-store grocery business with a few weeks of trading history.
 * Everything goes through the same services the application uses, so stock, ledgers
 * and document numbers end up exactly as they would in real use.
 */
class DemoSeeder extends Seeder
{
    private const DAYS = 45;

    private Collection $products;
    private Collection $customers;
    private Collection $suppliers;
    private array $shared = [];

    public function __construct(
        private readonly SaleService $sales,
        private readonly PurchaseService $purchases,
        private readonly InventoryService $inventory,
        private readonly LedgerService $ledger,
        private readonly SequenceService $sequences,
    ) {
    }

    public function run(): void
    {
        mt_srand(20261012);

        DB::transaction(function () {
            $stores = $this->stores();
            $staff = $this->people($stores);
            $this->catalogue();
            $this->contacts();
            $this->financeCategories();
            $this->discounts($stores);

            $start = CarbonImmutable::today()->subDays(self::DAYS);

            foreach ($stores as $store) {
                $this->openStore($store, $staff[$store->id], $start);
            }

            for ($offset = 1; $offset <= self::DAYS; $offset++) {
                $day = $start->addDays($offset);

                foreach ($stores as $store) {
                    $this->trade($store, $staff[$store->id], $day);
                }
            }

            $this->afterthoughts($stores, $staff);
        });
    }

    private function stores(): Collection
    {
        return collect([
            ['name' => 'Dhanmondi Flagship', 'code' => 'DHN', 'city' => 'Dhaka', 'phone' => '+880 1711-100200', 'address' => 'House 12, Road 27, Dhanmondi'],
            ['name' => 'Gulshan Avenue', 'code' => 'GUL', 'city' => 'Dhaka', 'phone' => '+880 1711-100300', 'address' => 'Plot 48, Gulshan Avenue, Gulshan 1'],
            ['name' => 'Chattogram GEC', 'code' => 'CTG', 'city' => 'Chattogram', 'phone' => '+880 1811-100400', 'address' => '1182 CDA Avenue, GEC Circle'],
        ])->map(function (array $row) {
            $store = Store::query()->create($row + ['email' => strtolower($row['code']).'@kontor.test']);
            Account::query()->create(['store_id' => $store->id, 'name' => 'Cash drawer', 'type' => 'cash']);

            return $store;
        });
    }

    /**
     * Logins, employees and the shared accounts.
     *
     * @return array<int, array{manager: User, cashiers: Collection<int, User>}>
     */
    private function people(Collection $stores): array
    {
        $this->shared = [
            'bank' => Account::query()->create(['name' => 'City Bank — Current A/C', 'type' => 'bank', 'account_number' => '1502 4410 9921']),
            'mobile' => Account::query()->create(['name' => 'bKash Merchant', 'type' => 'mobile', 'account_number' => '01711-100200']),
            'card' => Account::query()->create(['name' => 'Card terminal', 'type' => 'card']),
        ];
        $this->ledger->record($this->shared['bank']->id, Transaction::IN, 6000000, 'opening', description: 'Opening balance', at: now()->subDays(self::DAYS + 1));
        $this->shared['bank']->update(['opening_balance' => 6000000]);

        $roles = Role::query()->pluck('id', 'name');
        $user = fn (string $name, string $email, string $role, array $storeIds = []) => tap(
            User::query()->create(['name' => $name, 'email' => $email, 'password' => 'password', 'role_id' => $roles[$role]]),
            fn (User $u) => $u->stores()->sync($storeIds)
        );

        $user('Tanvir Ahmed', 'owner@kontor.test', 'Owner');
        $accountant = $user('Nusrat Jahan', 'accounts@kontor.test', 'Accountant');

        $roster = [
            'DHN' => ['manager' => ['Rafiq Hasan', 42000], 'cashiers' => [['Sadia Islam', 19000], ['Imran Hossain', 18500]], 'floor' => [['Jamal Uddin', 'Stock keeper', 16000], ['Rina Akter', 'Sales assistant', 14500]]],
            'GUL' => ['manager' => ['Farhana Karim', 45000], 'cashiers' => [['Mehedi Hasan', 19500], ['Tania Sultana', 19000]], 'floor' => [['Shahin Alam', 'Stock keeper', 16500]]],
            'CTG' => ['manager' => ['Kamrul Chowdhury', 40000], 'cashiers' => [['Priya Barua', 18000]], 'floor' => [['Abdul Karim', 'Stock keeper', 15500], ['Sumaiya Nahar', 'Sales assistant', 14000]]],
        ];

        $staff = [];
        $number = 0;
        $employee = function (Store $store, string $name, string $designation, float $salary, ?User $login = null) use (&$number) {
            $number++;

            return Employee::query()->create([
                'store_id' => $store->id,
                'user_id' => $login?->id,
                'code' => 'EMP-'.str_pad((string) $number, 4, '0', STR_PAD_LEFT),
                'name' => $name,
                'designation' => $designation,
                'phone' => '+880 17'.mt_rand(10, 99).'-'.mt_rand(100000, 999999),
                'joined_at' => now()->subMonths(mt_rand(5, 40))->startOfMonth(),
                'salary' => $salary,
            ]);
        };

        $employee($stores[0], 'Nusrat Jahan', 'Accountant', 38000, $accountant);

        foreach ($stores as $index => $store) {
            $plan = $roster[$store->code];
            $slug = strtolower($store->code);

            // The first manager also looks after Gulshan, to show a user spanning two stores.
            $manager = $user($plan['manager'][0], $index === 0 ? 'manager@kontor.test' : "manager.{$slug}@kontor.test", 'Store manager',
                $index === 0 ? [$store->id, $stores[1]->id] : [$store->id]);
            $employee($store, $plan['manager'][0], 'Store manager', $plan['manager'][1], $manager);

            $cashiers = collect();
            foreach ($plan['cashiers'] as $i => [$name, $salary]) {
                $login = $user($name, $index === 0 && $i === 0 ? 'cashier@kontor.test' : 'cashier'.($i + 1).".{$slug}@kontor.test", 'Cashier', [$store->id]);
                $employee($store, $name, 'Cashier', $salary, $login);
                $cashiers->push($login);
            }

            foreach ($plan['floor'] as [$name, $designation, $salary]) {
                $employee($store, $name, $designation, $salary);
            }

            $staff[$store->id] = ['manager' => $manager, 'cashiers' => $cashiers];
        }

        return $staff;
    }

    private function catalogue(): void
    {
        $unit = collect([
            'pc' => ['Piece', false], 'kg' => ['Kilogram', true], 'L' => ['Litre', true],
            'pk' => ['Pack', false], 'dz' => ['Dozen', false], 'btl' => ['Bottle', false],
        ])->map(fn (array $u, string $short) => Unit::query()->create(['name' => $u[0], 'short_name' => $short, 'allow_decimal' => $u[1]]));

        // [category, tax %, [[name, brand, unit, cost, price, reorder], ...]]
        $ranges = [
            ['Rice & Grains', 0, [
                ['Miniket Rice', 'Rupchanda', 'kg', 68, 78, 60], ['Nazirshail Rice', 'ACI Pure', 'kg', 74, 86, 50],
                ['Chinigura Aromatic Rice 1kg', 'Pran', 'pk', 128, 150, 25], ['Basmati Rice 1kg', 'Fortune', 'pk', 265, 310, 15],
                ['Red Lentil (Masoor Dal)', 'ACI Pure', 'kg', 112, 130, 40], ['Mung Dal', 'ACI Pure', 'kg', 138, 160, 25],
                ['Atta Flour 2kg', 'Teer', 'pk', 108, 125, 30], ['Maida Flour 2kg', 'Teer', 'pk', 116, 135, 20],
                ['Semolina (Suji) 500g', 'Fresh', 'pk', 38, 48, 15],
            ]],
            ['Cooking Essentials', 0, [
                ['Soybean Oil 1L', 'Rupchanda', 'btl', 168, 185, 40], ['Soybean Oil 5L', 'Teer', 'btl', 815, 890, 20],
                ['Mustard Oil 500ml', 'Radhuni', 'btl', 148, 170, 20], ['Refined Sugar', 'Fresh', 'kg', 122, 135, 50],
                ['Iodised Salt 1kg', 'ACI Pure', 'pk', 34, 42, 40], ['Turmeric Powder 200g', 'Radhuni', 'pk', 78, 95, 20],
                ['Chilli Powder 200g', 'Radhuni', 'pk', 96, 115, 20], ['Cumin Powder 100g', 'Radhuni', 'pk', 88, 105, 15],
                ['Biryani Masala 40g', 'Radhuni', 'pk', 42, 55, 20], ['Garlic Paste 200g', 'Pran', 'pc', 52, 65, 12],
            ]],
            ['Beverages', 5, [
                ['Mango Fruit Drink 250ml', 'Pran', 'pc', 19, 25, 60], ['Mango Juice 1L', 'Pran', 'btl', 92, 115, 24],
                ['Cola 500ml', 'Mojo', 'btl', 31, 40, 60], ['Cola 2L', 'Mojo', 'btl', 98, 120, 24],
                ['Mineral Water 500ml', 'Mum', 'btl', 11, 15, 120], ['Mineral Water 2L', 'Mum', 'btl', 24, 30, 60],
                ['Black Tea 400g', 'Ispahani', 'pk', 198, 235, 20], ['Tea Bags 50 pcs', 'Ispahani', 'pk', 108, 130, 15],
                ['Instant Coffee 100g', 'Nescafé', 'pc', 318, 370, 10], ['Energy Drink 250ml', 'Speed', 'pc', 27, 35, 48],
            ]],
            ['Snacks & Biscuits', 5, [
                ['Potato Crackers 25g', 'Pran', 'pk', 8, 10, 120], ['Chanachur 150g', 'Bombay Sweets', 'pk', 44, 55, 40],
                ['Potato Chips 45g', 'Bombay Sweets', 'pk', 22, 30, 60], ['Energy Plus Biscuit', 'Olympic', 'pk', 31, 40, 60],
                ['Tip Biscuit 75g', 'Olympic', 'pk', 12, 15, 80], ['Nutty Biscuit 120g', 'Olympic', 'pk', 36, 45, 40],
                ['Instant Noodles 62g', 'Maggi', 'pk', 16, 20, 100], ['Instant Noodles 8-pack', 'Maggi', 'pk', 138, 160, 20],
                ['Milk Chocolate 40g', 'Cadbury', 'pc', 62, 75, 30], ['Toast Biscuit 300g', 'Fresh', 'pk', 58, 70, 20],
            ]],
            ['Dairy & Eggs', 0, [
                ['Pasteurised Milk 1L', 'Aarong Dairy', 'pk', 82, 95, 40], ['UHT Milk 500ml', 'Pran', 'pk', 46, 55, 40],
                ['Full Cream Milk Powder 500g', 'Dano', 'pk', 398, 450, 15], ['Sweet Yogurt 500g', 'Aarong Dairy', 'pc', 96, 115, 20],
                ['Butter 200g', 'Aarong Dairy', 'pc', 228, 260, 12], ['Ghee 400g', 'Aarong Dairy', 'pc', 598, 680, 8],
                ['Farm Eggs', null, 'dz', 128, 145, 30], ['Cheddar Cheese Slices', 'Dano', 'pk', 248, 290, 8],
            ]],
            ['Personal Care', 5, [
                ['Beauty Soap 100g', 'Lux', 'pc', 46, 55, 60], ['Antibacterial Soap 125g', 'Lifebuoy', 'pc', 44, 52, 60],
                ['Shampoo 340ml', 'Sunsilk', 'btl', 298, 350, 15], ['Toothpaste 140g', 'Pepsodent', 'pc', 96, 115, 30],
                ['Toothbrush Soft', 'Pepsodent', 'pc', 32, 45, 30], ['Coconut Hair Oil 200ml', 'Parachute', 'btl', 148, 175, 20],
                ['Hand Wash Refill 170ml', 'Lifebuoy', 'pk', 58, 70, 25], ['Petroleum Jelly 100ml', 'Vaseline', 'pc', 112, 135, 12],
            ]],
            ['Household', 5, [
                ['Detergent Powder 1kg', 'Wheel', 'pk', 108, 125, 30], ['Detergent Powder 500g', 'Rin', 'pk', 82, 95, 30],
                ['Dishwashing Bar 300g', 'Vim', 'pc', 36, 45, 40], ['Dishwashing Liquid 500ml', 'Vim', 'btl', 112, 130, 20],
                ['Floor Cleaner 1L', 'Lizol', 'btl', 208, 245, 12], ['Toilet Cleaner 750ml', 'Harpic', 'btl', 138, 160, 15],
                ['Mosquito Coil 10 pcs', 'ACI Pure', 'pk', 62, 75, 30], ['Facial Tissue Box', 'Bashundhara', 'pc', 74, 90, 30],
                ['Kitchen Towel 2 rolls', 'Bashundhara', 'pk', 118, 140, 15],
            ]],
            ['Fresh Produce', 0, [
                ['Potato', null, 'kg', 26, 34, 80], ['Onion (Local)', null, 'kg', 62, 75, 60],
                ['Garlic', null, 'kg', 168, 195, 20], ['Ginger', null, 'kg', 198, 230, 15],
                ['Green Chilli', null, 'kg', 108, 135, 10], ['Tomato', null, 'kg', 58, 72, 25],
                ['Banana (Sagor)', null, 'dz', 82, 100, 20], ['Lemon', null, 'dz', 46, 60, 15],
            ]],
        ];

        $brands = [];
        $sku = 1000;

        foreach ($ranges as [$categoryName, $tax, $items]) {
            $category = Category::query()->create(['name' => $categoryName]);

            foreach ($items as [$name, $brand, $unitKey, $cost, $price, $reorder]) {
                if ($brand && ! isset($brands[$brand])) {
                    $brands[$brand] = Brand::query()->create(['name' => $brand]);
                }

                $sku++;

                Product::query()->create([
                    'category_id' => $category->id,
                    'brand_id' => $brand ? $brands[$brand]->id : null,
                    'unit_id' => $unit[$unitKey]->id,
                    'name' => $name,
                    'sku' => 'KR-'.$sku,
                    'barcode' => $this->ean13('890'.str_pad((string) mt_rand(0, 999999999), 9, '0', STR_PAD_LEFT)),
                    'cost_price' => $cost,
                    'sale_price' => round($price * 1.08),
                    'tax_rate' => $tax,
                    'reorder_level' => $reorder,
                ]);
            }
        }

        $this->products = Product::query()->with('unit')->get();
    }

    /**
     * Appends the EAN-13 check digit to twelve digits, so the demo barcodes scan like real ones.
     */
    private function ean13(string $twelve): string
    {
        $sum = 0;
        foreach (str_split($twelve) as $i => $digit) {
            $sum += (int) $digit * ($i % 2 === 0 ? 1 : 3);
        }

        return $twelve.((10 - $sum % 10) % 10);
    }

    private function contacts(): void
    {
        $this->suppliers = collect([
            ['Meghna Distribution Ltd.', 'Arif Mahmud', 'Tejgaon I/A, Dhaka'],
            ['Pran-RFL Dealer Point', 'Sohel Rana', 'Badda, Dhaka'],
            ['Unilever Trade Partner', 'Mahfuz Alam', 'Mohakhali, Dhaka'],
            ['City Group Sales Depot', 'Zahid Hasan', 'Demra, Dhaka'],
            ['Karwan Bazar Wholesale', 'Nurul Islam', 'Karwan Bazar, Dhaka'],
            ['Square Consumer Depot', 'Rezaul Karim', 'Agrabad, Chattogram'],
        ])->map(fn (array $row) => Supplier::query()->create([
            'name' => $row[0],
            'contact_person' => $row[1],
            'address' => $row[2],
            'phone' => '+880 19'.mt_rand(10, 99).'-'.mt_rand(100000, 999999),
        ]));

        $names = [
            'Ayesha Siddiqua', 'Mahmudul Haque', 'Shirin Akhter', 'Tawhid Rahman', 'Lamia Chowdhury', 'Rakib Hasan',
            'Sharmin Sultana', 'Anisur Rahman', 'Fatema Begum', 'Zubair Ahmed', 'Nasrin Akter', 'Habibur Rahman',
            'Mitu Rani Das', 'Saiful Islam', 'Rumana Parvin', 'Arafat Hossain', 'Jannatul Ferdous', 'Shafiqul Alam',
            'Dilruba Yasmin', 'Masud Rana', 'Bithi Saha', 'Enamul Kabir', 'Hotel Sea View (Corporate)', 'Green Leaf Restaurant',
        ];

        $this->customers = collect($names)->map(fn (string $name, int $i) => Customer::query()->create([
            'name' => $name,
            'phone' => '017'.str_pad((string) (11000000 + $i * 37913), 8, '0', STR_PAD_LEFT),
            'address' => collect(['Dhanmondi, Dhaka', 'Gulshan, Dhaka', 'Mirpur, Dhaka', 'Uttara, Dhaka', 'Nasirabad, Chattogram', 'Khulshi, Chattogram'])->get($i % 6),
        ]));
    }

    private function financeCategories(): void
    {
        foreach (['Rent', 'Utilities', 'Transport & delivery', 'Marketing', 'Repairs & maintenance', 'Office supplies', 'Internet & phone', 'Miscellaneous'] as $name) {
            FinanceCategory::query()->create(['type' => 'expense', 'name' => $name]);
        }

        foreach (['Delivery charges', 'Supplier commission', 'Shelf rental', 'Scrap & carton sales'] as $name) {
            FinanceCategory::query()->create(['type' => 'income', 'name' => $name]);
        }
    }

    private function discounts(Collection $stores): void
    {
        $target = fn (Discount $discount, array $ids) => $discount->targets()->createMany(array_map(fn ($id) => ['target_id' => $id], $ids));
        $start = now()->subDays(self::DAYS + 5)->startOfDay();

        $target(Discount::query()->create([
            'name' => 'Snack time — 10% off', 'type' => 'percent', 'value' => 10, 'applies_to' => 'category',
            'starts_at' => $start, 'ends_at' => now()->addDays(20)->endOfDay(),
        ]), [Category::query()->where('name', 'Snacks & Biscuits')->value('id')]);

        $target(Discount::query()->create([
            'name' => 'Cooking oil saver', 'type' => 'fixed', 'value' => 15, 'applies_to' => 'product',
            'starts_at' => $start, 'ends_at' => now()->addDays(10)->endOfDay(),
        ]), $this->products->filter(fn (Product $p) => str_contains($p->name, 'Soybean Oil'))->pluck('id')->all());

        Discount::query()->create([
            'name' => 'Big basket reward', 'type' => 'percent', 'value' => 3, 'applies_to' => 'order',
            'min_purchase' => 3000, 'max_discount' => 250, 'starts_at' => $start,
        ]);

        Discount::query()->create([
            'name' => 'Welcome coupon', 'code' => 'WELCOME50', 'type' => 'fixed', 'value' => 50, 'applies_to' => 'order',
            'min_purchase' => 500, 'usage_limit' => 500, 'starts_at' => $start,
        ]);

        Discount::query()->create([
            'name' => 'Gulshan opening week', 'code' => 'GULSHAN10', 'type' => 'percent', 'value' => 10, 'applies_to' => 'order',
            'max_discount' => 400, 'store_id' => $stores[1]->id, 'starts_at' => $start, 'ends_at' => now()->addDays(30)->endOfDay(),
        ]);

        Discount::query()->create([
            'name' => 'Eid festival offer', 'code' => 'EID2026', 'type' => 'percent', 'value' => 8, 'applies_to' => 'order',
            'max_discount' => 500, 'starts_at' => now()->subMonths(5), 'ends_at' => now()->subMonths(4),
        ]);
    }

    /**
     * The first delivery that fills the shelves, paid from the bank.
     */
    private function openStore(Store $store, array $staff, CarbonImmutable $day): void
    {
        auth()->setUser($staff['manager']);
        $scale = ['DHN' => 1.0, 'GUL' => 0.85, 'CTG' => 0.7][$store->code];

        foreach ($this->products->chunk(18) as $i => $chunk) {
            $this->purchases->create($store, $staff['manager'], [
                'supplier_id' => $this->suppliers[$i % $this->suppliers->count()]->id,
                'purchased_at' => $day->toDateString(),
                'supplier_invoice_no' => 'SI-'.mt_rand(10000, 99999),
                'items' => $chunk->map(fn (Product $p) => [
                    'product_id' => $p->id,
                    'quantity' => ceil($p->reorder_level * $scale * (mt_rand(60, 80) / 10)),
                    'unit_cost' => $p->cost_price,
                ])->values()->all(),
                'shipping_cost' => mt_rand(4, 12) * 100,
                'paid_amount' => null,
                'account_id' => $this->shared['bank']->id,
            ]);
        }

        // Settle the opening stock in full.
        foreach (Purchase::query()->where('store_id', $store->id)->get() as $purchase) {
            $this->purchases->pay($purchase, $this->shared['bank']->id, $purchase->due_amount, $day->setTime(16, 0));
        }

        // A float so the drawer can give change on day one.
        $drawer = Account::query()->where('store_id', $store->id)->where('type', 'cash')->first();
        $this->ledger->record($drawer->id, Transaction::IN, 20000, 'opening', null, $store->id, $day->setTime(9, 0), null, 'Opening float');
        $drawer->update(['opening_balance' => 20000]);
    }

    private function trade(Store $store, array $staff, CarbonImmutable $day): void
    {
        $drawer = Account::query()->where('store_id', $store->id)->where('type', 'cash')->first();
        $busy = ['DHN' => 1.0, 'GUL' => 0.8, 'CTG' => 0.6][$store->code];
        $weekend = in_array($day->dayOfWeek, [5, 6], true) ? 1.35 : 1.0;
        $count = (int) round(mt_rand(18, 28) * $busy * $weekend);
        $isToday = $day->isToday();

        for ($i = 0; $i < $count; $i++) {
            $at = $day->setTime(9, 0)->addMinutes(mt_rand(0, 12 * 60));

            // Do not invent sales that have not happened yet.
            if ($isToday && $at->greaterThan(now())) {
                continue;
            }

            $cashier = $staff['cashiers']->random();
            auth()->setUser($cashier);

            $lines = $this->products->random(mt_rand(2, 8))->map(fn (Product $p) => [
                'product_id' => $p->id,
                'quantity' => $p->unit->allow_decimal ? mt_rand(1, 8) / 2 : mt_rand(1, mt_rand(2, 6)),
            ])->values()->all();

            $roll = mt_rand(1, 100);
            $customer = $roll <= 30 ? $this->customers->random() : null;
            $onCredit = $customer && mt_rand(1, 100) <= 18;
            $method = match (true) {
                $roll <= 58 => $drawer->id,
                $roll <= 82 => $this->shared['mobile']->id,
                default => $this->shared['card']->id,
            };

            try {
                $this->sales->create($store, $cashier, [
                    'customer_id' => $customer?->id,
                    'items' => $lines,
                    'coupon_code' => $customer && mt_rand(1, 100) <= 6 ? 'WELCOME50' : null,
                    'payments' => $onCredit
                        ? (mt_rand(0, 1) ? [['account_id' => $method, 'amount' => 500]] : [])
                        : [['account_id' => $method, 'amount' => 1000000]],
                ], $at);
            } catch (ValidationException) {
                // Out of stock or coupon below its minimum — a real cashier would just move on.
            }
        }

        auth()->setUser($staff['manager']);
        $this->backOffice($store, $staff, $day, $drawer);
    }

    /**
     * The manager's side of the day: restocking, banking the cash, paying the bills.
     */
    private function backOffice(Store $store, array $staff, CarbonImmutable $day, Account $drawer): void
    {
        $evening = $day->setTime(20, 30);

        if ($day->isToday()) {
            return;
        }

        // Restock three times a week whatever is getting close to its reorder level.
        if (in_array($day->dayOfWeek, [0, 2, 4], true)) {
            $levels = StockLevel::query()->where('store_id', $store->id)->pluck('quantity', 'product_id');
            $low = $this->products->filter(fn (Product $p) => ($levels[$p->id] ?? 0) <= $p->reorder_level * 1.5);

            foreach ($low->chunk(12) as $i => $chunk) {
                $supplier = $this->suppliers[($day->dayOfYear + $i) % $this->suppliers->count()];
                $total = 0;

                $items = $chunk->map(function (Product $p) use (&$total) {
                    $quantity = ceil($p->reorder_level * (mt_rand(45, 70) / 10));
                    $cost = round($p->fresh()->cost_price * (mt_rand(97, 104) / 100), 2);
                    $total += $quantity * $cost;

                    return ['product_id' => $p->id, 'quantity' => $quantity, 'unit_cost' => $cost];
                })->values()->all();

                // Recent deliveries are still partly on credit; older ones have been settled.
                $recent = $day->diffInDays(now()) < 12;
                $paid = $recent ? (mt_rand(0, 2) === 0 ? 0 : round($total * mt_rand(3, 6) / 10, -2)) : $total;

                $this->purchases->create($store, $staff['manager'], [
                    'supplier_id' => $supplier->id,
                    'purchased_at' => $day->toDateString(),
                    'supplier_invoice_no' => 'SI-'.mt_rand(10000, 99999),
                    'items' => $items,
                    'paid_amount' => $paid ?: null,
                    'account_id' => $this->shared['bank']->id,
                ]);
            }
        }

        // Bank the day's cash, leaving a float in the drawer.
        $surplus = floor(($drawer->fresh()->balance - 15000) / 1000) * 1000;
        if ($surplus >= 5000) {
            $reference = 'TRX-'.$day->format('ymd').$store->id;
            $this->ledger->record($drawer->id, Transaction::OUT, $surplus, 'transfer', null, $store->id, $evening, $reference, 'Cash deposit to City Bank');
            $this->ledger->record($this->shared['bank']->id, Transaction::IN, $surplus, 'transfer', null, null, $evening, $reference, "Cash deposit from {$store->name}");
        }

        $expense = function (string $category, float $amount, string $payee, Account $account) use ($store, $day, $staff) {
            $entry = FinanceEntry::query()->create([
                'store_id' => $store->id,
                'finance_category_id' => FinanceCategory::query()->where('type', 'expense')->where('name', $category)->value('id'),
                'account_id' => $account->id,
                'user_id' => $staff['manager']->id,
                'type' => 'expense',
                'reference_no' => $this->sequences->next('expense', $store, $day),
                'amount' => $amount,
                'entry_date' => $day->toDateString(),
                'payee' => $payee,
            ]);

            $this->ledger->record($account->id, Transaction::OUT, $amount, 'expense', $entry, $store->id, $day->setTime(15, 0), $entry->reference_no, "{$category} — {$payee}");
        };

        $rent = ['DHN' => 60000, 'GUL' => 85000, 'CTG' => 40000][$store->code];
        $bank = $this->shared['bank'];

        match (true) {
            $day->day === 1 => $expense('Rent', $rent, 'Building owner', $bank),
            $day->day === 5 => $expense('Utilities', mt_rand(180, 260) * 100, 'DESCO electricity bill', $bank),
            $day->day === 7 => $expense('Internet & phone', 3500, 'Link3 Technologies', $bank),
            $day->day === 12 => $expense('Marketing', mt_rand(40, 90) * 100, 'Facebook page boost', $bank),
            $day->day === 20 => $expense('Repairs & maintenance', mt_rand(15, 60) * 100, 'Freezer servicing', $drawer),
            $day->dayOfWeek === 4 => $expense('Transport & delivery', mt_rand(8, 20) * 100, 'Pickup van hire', $drawer),
            $day->dayOfWeek === 1 && mt_rand(0, 1) === 1 => $expense('Office supplies', mt_rand(3, 12) * 100, 'Receipt rolls & stationery', $drawer),
            default => null,
        };

        if ($day->day === 15) {
            $entry = FinanceEntry::query()->create([
                'store_id' => $store->id,
                'finance_category_id' => FinanceCategory::query()->where('type', 'income')->where('name', 'Shelf rental')->value('id'),
                'account_id' => $bank->id,
                'user_id' => $staff['manager']->id,
                'type' => 'income',
                'reference_no' => $this->sequences->next('income', $store, $day),
                'amount' => 12000,
                'entry_date' => $day->toDateString(),
                'payee' => 'Pran-RFL Dealer Point',
                'note' => 'Monthly gondola display fee',
            ]);

            $this->ledger->record($bank->id, Transaction::IN, 12000, 'income', $entry, $store->id, $day->setTime(12, 0), $entry->reference_no, 'Shelf rental — Pran-RFL Dealer Point');
        }

        // Salaries for the month just ended go out on the 3rd.
        if ($day->day === 3) {
            $period = $day->subMonth()->format('Y-m');

            foreach (Employee::query()->where('store_id', $store->id)->get() as $employee) {
                $payment = SalaryPayment::query()->create([
                    'employee_id' => $employee->id,
                    'store_id' => $store->id,
                    'account_id' => $bank->id,
                    'user_id' => $staff['manager']->id,
                    'reference_no' => $this->sequences->next('salary', $store, $day),
                    'period' => $period,
                    'basic_amount' => $employee->salary,
                    'net_amount' => $employee->salary,
                    'paid_at' => $day->toDateString(),
                ]);

                $this->ledger->record($bank->id, Transaction::OUT, $employee->salary, 'salary', $payment, $store->id, $day->setTime(11, 0), $payment->reference_no, "Salary {$period} — {$employee->name}");
            }
        }
    }

    /**
     * The odds and ends that make the data feel lived-in: returns, dues collected, transfers, write-offs.
     */
    private function afterthoughts(Collection $stores, array $staff): void
    {
        foreach ($stores as $store) {
            auth()->setUser($staff[$store->id]['manager']);
            $drawer = Account::query()->where('store_id', $store->id)->where('type', 'cash')->first();

            // Most credit customers have paid up; the latest invoices are still open.
            Sale::query()->where('store_id', $store->id)->where('due_amount', '>', 0)
                ->where('sold_at', '<', now()->subDays(9))->get()
                ->each(fn (Sale $sale) => $this->sales->collect($sale, $drawer->id, $sale->due_amount, CarbonImmutable::parse($sale->sold_at)->addDays(mt_rand(2, 7))));

            Sale::query()->where('store_id', $store->id)->where('payment_status', 'paid')
                ->whereBetween('sold_at', [now()->subDays(20), now()->subDays(2)])->inRandomOrder()->limit(4)->with('items')->get()
                ->each(function (Sale $sale) use ($staff, $drawer) {
                    $item = $sale->items->first();
                    $quantity = $item->quantity >= 2 ? floor($item->quantity / 2) : $item->quantity;

                    $this->sales->refund(
                        $sale, $staff[$sale->store_id]['manager'],
                        [['sale_item_id' => $item->id, 'quantity' => $quantity]],
                        $drawer->id, 'Customer changed mind',
                        CarbonImmutable::parse($sale->sold_at)->addDay(),
                    );
                });

            $pick = fn (int $n) => $this->products->filter(fn (Product $p) => ! $p->unit->allow_decimal)->random($n);

            // Skipped quietly when the randomly picked items happen to be out of stock.
            try {
                DB::transaction(fn () => $this->inventory->adjust($store, $staff[$store->id]['manager'], 'damage',
                    $pick(2)->map(fn (Product $p) => ['product_id' => $p->id, 'quantity' => -mt_rand(1, 3)])->values()->all(),
                    'Damaged in storage', now()->subDays(mt_rand(3, 15))));

                DB::transaction(fn () => $this->inventory->adjust($store, $staff[$store->id]['manager'], 'correction',
                    $pick(3)->map(fn (Product $p) => ['product_id' => $p->id, 'quantity' => mt_rand(0, 1) ? 2 : -1])->values()->all(),
                    'Monthly stock count', now()->subDays(mt_rand(1, 6))));
            } catch (ValidationException) {
            }
        }

        // Head office tops up the smaller branches from the flagship.
        auth()->setUser($staff[$stores[0]->id]['manager']);
        $surplus = StockLevel::query()->where('store_id', $stores[0]->id)->where('quantity', '>', 30)->inRandomOrder()->limit(8)->get();

        foreach ($surplus->chunk(4) as $i => $chunk) {
            $this->inventory->transfer(
                $stores[0], $stores[$i + 1]->id, $staff[$stores[0]->id]['manager'],
                $chunk->map(fn (StockLevel $l) => ['product_id' => $l->product_id, 'quantity' => 10])->values()->all(),
                'Branch replenishment', now()->subDays(4 - $i),
            );
        }
    }
}
