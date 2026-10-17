<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Services\SaleService;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SaleController extends Controller
{
    public function __construct(
        private readonly StoreContext $context,
        private readonly SaleService $sales,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);
        $search = $request->input('search');

        $query = Sale::query()
            ->whereIn('store_id', $this->context->ids())
            ->whereBetween('sold_at', [$from, $to])
            ->when($search, fn (Builder $q) => $q->where(
                fn (Builder $w) => $w->where('invoice_no', 'like', "%{$search}%")
                    ->orWhereHas('customer', fn (Builder $c) => $c->where('name', 'like', "%{$search}%")->orWhere('phone', 'like', "%{$search}%"))
            ))
            ->when($request->filled('payment_status'), fn (Builder $q) => $q->where('payment_status', $request->input('payment_status')))
            ->when($request->filled('status'), fn (Builder $q) => $q->where('status', $request->input('status')))
            ->when($request->filled('customer_id'), fn (Builder $q) => $q->where('customer_id', $request->integer('customer_id')));

        $summary = (clone $query)
            ->selectRaw('count(*) as count, coalesce(sum(total), 0) as total, coalesce(sum(paid_amount), 0) as paid, coalesce(sum(due_amount), 0) as due')
            ->first();

        $sales = $query
            ->with('store:id,name,code', 'customer:id,name,phone', 'user:id,name')
            ->withCount('items')
            ->orderByDesc('sold_at')
            ->orderByDesc('id')
            ->paginate($this->perPage($request));

        return response()->json($sales->toArray() + [
            'summary' => array_map('floatval', $summary->toArray()),
        ]);
    }

    public function show(Sale $sale): JsonResponse
    {
        $this->ensureStoreAccess($sale->store_id);

        return response()->json($this->detail($sale));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'exists:customers,id'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'discount' => ['nullable', 'array'],
            'discount.type' => ['required_with:discount', Rule::in(['percent', 'fixed'])],
            'discount.value' => ['required_with:discount', 'numeric', 'min:0'],
            'coupon_code' => ['nullable', 'string', 'max:40'],
            'payments' => ['array'],
            'payments.*.account_id' => ['required', 'integer'],
            'payments.*.amount' => ['required', 'numeric', 'min:0'],
            'expected_total' => ['nullable', 'numeric'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $sale = $this->sales->create($this->context->require(), $request->user(), $data);

        return response()->json($this->detail($sale), 201);
    }

    public function collect(Request $request, Sale $sale): JsonResponse
    {
        $this->ensureStoreAccess($sale->store_id);

        $data = $request->validate([
            'account_id' => ['required', $this->usableAccount()],
            'amount' => ['required', 'numeric', 'gt:0'],
        ]);

        $this->sales->collect($sale, (int) $data['account_id'], (float) $data['amount']);

        return response()->json($this->detail($sale->refresh()));
    }

    public function refund(Request $request, Sale $sale): JsonResponse
    {
        $this->ensureStoreAccess($sale->store_id);

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.sale_item_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'numeric', 'min:0'],
            'account_id' => ['nullable', $this->usableAccount()],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $this->sales->refund($sale, $request->user(), $data['items'], $data['account_id'] ?? null, $data['note'] ?? null);

        return response()->json($this->detail($sale->refresh()));
    }

    private function detail(Sale $sale): Sale
    {
        return $sale->load(
            'store',
            'customer:id,name,phone,address',
            'user:id,name',
            'discount:id,name,code',
            'items',
            'payments.account:id,name,type',
            'returns.items.saleItem:id,product_name',
            'returns.user:id,name',
        );
    }
}
