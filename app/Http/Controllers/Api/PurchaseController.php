<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Purchase;
use App\Services\PurchaseService;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PurchaseController extends Controller
{
    public function __construct(
        private readonly StoreContext $context,
        private readonly PurchaseService $purchases,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request, 90);
        $search = $request->input('search');

        $query = Purchase::query()
            ->whereIn('store_id', $this->context->ids())
            ->whereBetween('purchased_at', [$from->toDateString(), $to->toDateString()])
            ->when($search, fn (Builder $q) => $q->where(
                fn (Builder $w) => $w->where('reference_no', 'like', "%{$search}%")
                    ->orWhere('supplier_invoice_no', 'like', "%{$search}%")
                    ->orWhereHas('supplier', fn (Builder $s) => $s->where('name', 'like', "%{$search}%"))
            ))
            ->when($request->filled('payment_status'), fn (Builder $q) => $q->where('payment_status', $request->input('payment_status')))
            ->when($request->filled('supplier_id'), fn (Builder $q) => $q->where('supplier_id', $request->integer('supplier_id')));

        $summary = (clone $query)
            ->selectRaw('count(*) as count, coalesce(sum(total), 0) as total, coalesce(sum(paid_amount), 0) as paid, coalesce(sum(due_amount), 0) as due')
            ->first();

        $purchases = $query
            ->with('store:id,name,code', 'supplier:id,name', 'user:id,name')
            ->withCount('items')
            ->orderByDesc('purchased_at')
            ->orderByDesc('id')
            ->paginate($this->perPage($request));

        return response()->json($purchases->toArray() + [
            'summary' => array_map('floatval', $summary->toArray()),
        ]);
    }

    public function show(Purchase $purchase): JsonResponse
    {
        $this->ensureStoreAccess($purchase->store_id);

        return response()->json($this->detail($purchase));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'exists:suppliers,id'],
            'purchased_at' => ['required', 'date', 'before_or_equal:today'],
            'supplier_invoice_no' => ['nullable', 'string', 'max:60'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'distinct', 'exists:products,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.unit_cost' => ['required', 'numeric', 'min:0'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'shipping_cost' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'account_id' => ['nullable', 'required_with:paid_amount', $this->usableAccount()],
            'note' => ['nullable', 'string', 'max:255'],
        ], [
            'account_id.required_with' => 'Choose the account the payment is made from.',
        ]);

        $purchase = $this->purchases->create($this->context->require(), $request->user(), $data);

        return response()->json($this->detail($purchase), 201);
    }

    public function pay(Request $request, Purchase $purchase): JsonResponse
    {
        $this->ensureStoreAccess($purchase->store_id);

        $data = $request->validate([
            'account_id' => ['required', $this->usableAccount()],
            'amount' => ['required', 'numeric', 'gt:0'],
        ]);

        $this->purchases->pay($purchase, (int) $data['account_id'], (float) $data['amount']);

        return response()->json($this->detail($purchase->refresh()));
    }

    private function detail(Purchase $purchase): Purchase
    {
        return $purchase->load(
            'store',
            'supplier',
            'user:id,name',
            'items.product:id,name,sku,unit_id',
            'items.product.unit:id,short_name',
            'payments.account:id,name,type',
        );
    }
}
