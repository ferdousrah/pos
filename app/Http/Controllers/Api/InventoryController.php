<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Models\StockTransfer;
use App\Services\InventoryService;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    public function __construct(
        private readonly StoreContext $context,
        private readonly InventoryService $inventory,
    ) {
    }

    public function stock(Request $request): JsonResponse
    {
        $storeIds = $this->context->ids();
        $onHand = $this->onHandSql($storeIds);

        $products = Product::query()
            ->with('category:id,name', 'unit:id,short_name')
            ->withStock($storeIds)
            ->search($request->string('search'))
            ->when($request->filled('category_id'), fn (Builder $q) => $q->where('category_id', $request->integer('category_id')))
            ->when($request->input('status') === 'out', fn (Builder $q) => $q->whereRaw("{$onHand} <= 0"))
            ->when($request->input('status') === 'low', fn (Builder $q) => $q->whereRaw("{$onHand} > 0 and {$onHand} <= products.reorder_level"))
            ->when($request->input('status') === 'in', fn (Builder $q) => $q->whereRaw("{$onHand} > products.reorder_level"))
            ->orderBy('name')
            ->paginate($this->perPage($request, 20));

        $summary = Product::query()
            ->selectRaw("count(*) as products")
            ->selectRaw("coalesce(sum({$onHand}), 0) as units")
            ->selectRaw("coalesce(sum({$onHand} * cost_price), 0) as cost_value")
            ->selectRaw("coalesce(sum({$onHand} * sale_price), 0) as retail_value")
            ->selectRaw("sum({$onHand} <= 0) as out_of_stock")
            ->selectRaw("sum({$onHand} > 0 and {$onHand} <= reorder_level) as low_stock")
            ->first();

        return response()->json($products->toArray() + [
            'summary' => array_map('floatval', $summary->toArray()),
        ]);
    }

    public function movements(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);

        $query = StockMovement::query()
            ->whereIn('store_id', $this->context->ids())
            ->whereBetween('moved_at', [$from, $to])
            ->when($request->filled('product_id'), fn (Builder $q) => $q->where('product_id', $request->integer('product_id')))
            ->when($request->filled('type'), fn (Builder $q) => $q->where('type', $request->input('type')))
            ->when($request->filled('search'), fn (Builder $q) => $q->whereHas('product', fn (Builder $p) => $p->search($request->string('search'))));

        $summary = (clone $query)
            ->selectRaw('count(*) as count, count(distinct product_id) as products')
            ->selectRaw('coalesce(sum(case when quantity > 0 then quantity end), 0) as units_in')
            ->selectRaw('coalesce(sum(case when quantity < 0 then -quantity end), 0) as units_out')
            ->first();

        $movements = $query
            ->with('product:id,name,sku', 'store:id,name,code', 'user:id,name')
            ->orderByDesc('moved_at')
            ->orderByDesc('id')
            ->paginate($this->perPage($request, 25));

        return response()->json($movements->toArray() + [
            'summary' => array_map('floatval', $summary->only(['count', 'products', 'units_in', 'units_out'])),
        ]);
    }

    public function adjustments(Request $request): JsonResponse
    {
        $adjustments = StockAdjustment::query()
            ->with('store:id,name,code', 'user:id,name', 'items.product:id,name,sku')
            ->whereIn('store_id', $this->context->ids())
            ->when($request->filled('reason'), fn (Builder $q) => $q->where('reason', $request->input('reason')))
            ->when($request->filled('search'), fn (Builder $q) => $q->where('reference_no', 'like', '%'.$request->input('search').'%'))
            ->orderByDesc('adjusted_at')
            ->orderByDesc('id')
            ->paginate($this->perPage($request));

        return response()->json($adjustments);
    }

    public function storeAdjustment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', Rule::in(StockAdjustment::REASONS)],
            'note' => ['nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'distinct', 'exists:products,id'],
            'items.*.quantity' => ['required', 'numeric', 'not_in:0'],
        ]);

        $adjustment = DB::transaction(fn () => $this->inventory->adjust(
            $this->context->require(), $request->user(), $data['reason'], $data['items'], $data['note'] ?? null,
        ));

        return response()->json($adjustment, 201);
    }

    public function transfers(Request $request): JsonResponse
    {
        $storeIds = $this->context->ids();

        $transfers = StockTransfer::query()
            ->with('fromStore:id,name,code', 'toStore:id,name,code', 'user:id,name', 'items.product:id,name,sku')
            ->where(fn (Builder $q) => $q->whereIn('from_store_id', $storeIds)->orWhereIn('to_store_id', $storeIds))
            ->when($request->filled('search'), fn (Builder $q) => $q->where('reference_no', 'like', '%'.$request->input('search').'%'))
            ->orderByDesc('transferred_at')
            ->orderByDesc('id')
            ->paginate($this->perPage($request));

        return response()->json($transfers);
    }

    public function storeTransfer(Request $request): JsonResponse
    {
        $from = $this->context->require();

        $data = $request->validate([
            'to_store_id' => ['required', Rule::exists('stores', 'id')->where('is_active', true), Rule::notIn([$from->id])],
            'note' => ['nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'distinct', 'exists:products,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
        ], [
            'to_store_id.not_in' => 'Choose a different store to send the stock to.',
        ]);

        $transfer = DB::transaction(fn () => $this->inventory->transfer(
            $from, (int) $data['to_store_id'], $request->user(), $data['items'], $data['note'] ?? null,
        ));

        return response()->json($transfer, 201);
    }

    /**
     * SQL for a product's on-hand quantity within the given stores.
     */
    private function onHandSql(array $storeIds): string
    {
        $ids = implode(',', array_map('intval', $storeIds)) ?: '0';

        return "(select coalesce(sum(sl.quantity), 0) from stock_levels sl where sl.product_id = products.id and sl.store_id in ({$ids}))";
    }
}
