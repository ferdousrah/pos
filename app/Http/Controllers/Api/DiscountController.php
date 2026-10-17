<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Discount;
use App\Models\Product;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DiscountController extends Controller
{
    public function __construct(private readonly StoreContext $context)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $search = $request->input('search');
        $now = now();

        $discounts = Discount::query()
            ->with('store:id,name,code')
            ->withCount('targets')
            ->where(fn (Builder $q) => $q->whereNull('store_id')->orWhereIn('store_id', $this->context->ids()))
            ->when($search, fn (Builder $q) => $q->where(
                fn (Builder $w) => $w->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%")
            ))
            ->when($request->input('kind') === 'coupon', fn (Builder $q) => $q->whereNotNull('code'))
            ->when($request->input('kind') === 'automatic', fn (Builder $q) => $q->whereNull('code'))
            ->when($request->input('state') === 'running', fn (Builder $q) => $q->where('is_active', true)
                ->where(fn (Builder $w) => $w->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
                ->where(fn (Builder $w) => $w->whereNull('ends_at')->orWhere('ends_at', '>=', $now)))
            ->when($request->input('state') === 'ended', fn (Builder $q) => $q->where('ends_at', '<', $now))
            ->orderByDesc('is_active')
            ->orderByDesc('id')
            ->paginate($this->perPage($request));

        $summary = Discount::query()
            ->where(fn (Builder $q) => $q->whereNull('store_id')->orWhereIn('store_id', $this->context->ids()))
            ->selectRaw('count(*) as total, coalesce(sum(code is not null), 0) as coupons, coalesce(sum(used_count), 0) as used')
            ->selectRaw(
                'coalesce(sum(is_active = 1 and (starts_at is null or starts_at <= ?) and (ends_at is null or ends_at >= ?)), 0) as running',
                [$now, $now]
            )
            ->first();

        return response()->json($discounts->toArray() + [
            'summary' => array_map('floatval', $summary->only(['total', 'coupons', 'used', 'running'])),
        ]);
    }

    public function show(Discount $discount): JsonResponse
    {
        $ids = $discount->targets()->pluck('target_id');

        $discount->setAttribute('targets', match ($discount->applies_to) {
            'product' => Product::query()->withTrashed()->findMany($ids, ['id', 'name', 'sku']),
            'category' => Category::query()->findMany($ids, ['id', 'name']),
            default => [],
        });

        return response()->json($discount);
    }

    public function store(Request $request): JsonResponse
    {
        $discount = $this->save(new Discount, $request);

        return response()->json($discount, 201);
    }

    public function update(Request $request, Discount $discount): JsonResponse
    {
        return response()->json($this->save($discount, $request));
    }

    public function destroy(Discount $discount): JsonResponse
    {
        $discount->delete();

        return response()->json(status: 204);
    }

    private function save(Discount $discount, Request $request): Discount
    {
        $request->merge(['code' => $request->filled('code') ? strtoupper(trim($request->input('code'))) : null]);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['nullable', 'alpha_dash', 'max:40', Rule::unique('discounts')->ignore($discount->id)],
            'type' => ['required', Rule::in(['percent', 'fixed'])],
            'value' => ['required', 'numeric', 'gt:0', $request->input('type') === 'percent' ? 'max:100' : 'max:99999999'],
            // A coupon is entered once per sale, so it can only ever apply to the whole order.
            'applies_to' => ['required', Rule::in($request->filled('code') ? ['order'] : ['order', 'category', 'product'])],
            'target_ids' => ['exclude_if:applies_to,order', 'required', 'array', 'min:1'],
            'target_ids.*' => ['integer'],
            'min_purchase' => ['nullable', 'numeric', 'min:0'],
            'max_discount' => ['nullable', 'numeric', 'gt:0'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'store_id' => ['nullable', Rule::in($this->context->accessibleIds())],
            'is_active' => ['boolean'],
        ], [
            'applies_to.in' => 'Coupons apply to the whole order.',
            'target_ids.required' => 'Pick at least one item this discount applies to.',
        ]);

        $targets = $data['target_ids'] ?? [];
        unset($data['target_ids']);
        $data['min_purchase'] ??= 0;

        return DB::transaction(function () use ($discount, $data, $targets) {
            $discount->fill($data)->save();

            $discount->targets()->delete();
            $discount->targets()->createMany(
                array_map(fn (int $id) => ['target_id' => $id], array_unique($targets))
            );

            return $discount;
        });
    }
}
