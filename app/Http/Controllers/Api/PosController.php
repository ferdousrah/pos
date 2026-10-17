<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Category;
use App\Models\Product;
use App\Services\DiscountService;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PosController extends Controller
{
    public function __construct(
        private readonly StoreContext $context,
        private readonly DiscountService $discounts,
    ) {
    }

    /**
     * Everything the register needs once per session.
     */
    public function bootstrap(): JsonResponse
    {
        $store = $this->context->require();

        return response()->json([
            'categories' => Category::query()
                ->where('is_active', true)
                ->whereHas('products', fn (Builder $q) => $q->active())
                ->orderBy('name')
                ->get(['id', 'name']),
            'accounts' => Account::query()
                ->where('is_active', true)
                ->forStores([$store->id])
                ->orderByRaw("field(type, 'cash', 'card', 'mobile', 'bank')")
                ->orderBy('name')
                ->get(['id', 'name', 'type']),
            'order_promotions' => $this->discounts->orderPromotions($store->id)
                ->map->only(['id', 'name', 'type', 'value', 'min_purchase', 'max_discount'])
                ->values(),
        ]);
    }

    public function products(Request $request): JsonResponse
    {
        $store = $this->context->require();
        $promotions = $this->discounts->linePromotions($store->id);

        $products = Product::query()
            ->active()
            ->with('unit:id,short_name,allow_decimal')
            ->withStock([$store->id])
            ->search($request->string('search'))
            ->when($request->filled('category_id'), fn (Builder $q) => $q->where('category_id', $request->integer('category_id')))
            // The register's favourites list asks for specific products.
            ->when($request->has('ids'), fn (Builder $q) => $q->whereIn('id', array_filter(array_map('intval', explode(',', (string) $request->input('ids'))))))
            ->orderBy('name')
            ->paginate($this->perPage($request, 60), ['id', 'category_id', 'unit_id', 'name', 'sku', 'barcode', 'image_path', 'sale_price', 'tax_rate']);

        $products->getCollection()->transform(function (Product $product) use ($promotions) {
            $promotion = $this->discounts->bestForProduct($product, $promotions);

            $product->setAttribute('promotion', $promotion ? [
                'name' => $promotion['discount']->name,
                'amount' => $promotion['amount'],
            ] : null);

            return $product;
        });

        return response()->json($products);
    }

    public function coupon(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:40'],
            'subtotal' => ['required', 'numeric', 'min:0'],
        ]);

        $coupon = $this->discounts->coupon($data['code'], $this->context->require()->id, (float) $data['subtotal']);

        return response()->json($coupon->only(['id', 'code', 'name', 'type', 'value', 'min_purchase', 'max_discount']));
    }
}
