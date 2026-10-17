<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Unit;
use App\Services\InventoryService;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function __construct(private readonly StoreContext $context)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $products = Product::query()
            ->with('category:id,name', 'brand:id,name', 'unit:id,name,short_name,allow_decimal')
            ->withStock($this->context->ids())
            ->search($request->string('search'))
            ->when($request->filled('category_id'), fn (Builder $q) => $q->where('category_id', $request->integer('category_id')))
            ->when($request->filled('brand_id'), fn (Builder $q) => $q->where('brand_id', $request->integer('brand_id')))
            ->when($request->filled('status'), fn (Builder $q) => $q->where('is_active', $request->input('status') === 'active'))
            ->orderBy('name')
            ->paginate($this->perPage($request));

        $summary = Product::query()
            ->selectRaw('count(*) as total, coalesce(sum(is_active), 0) as active')
            ->selectRaw('count(distinct category_id) as categories, count(distinct brand_id) as brands')
            ->first();

        return response()->json($products->toArray() + [
            'summary' => array_map('floatval', $summary->only(['total', 'active', 'categories', 'brands'])),
        ]);
    }

    /**
     * Lightweight search used by the purchase, adjustment, transfer and discount pickers.
     */
    public function lookup(Request $request): JsonResponse
    {
        $products = Product::query()
            ->active()
            ->with('unit:id,short_name,allow_decimal')
            ->withStock($this->context->ids())
            ->search($request->string('search'))
            ->orderBy('name')
            ->limit(20)
            ->get(['id', 'unit_id', 'name', 'size', 'sku', 'barcode', 'image_path', 'cost_price', 'sale_price']);

        return response()->json($products);
    }

    public function options(): JsonResponse
    {
        return response()->json([
            'categories' => Category::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'brands' => Brand::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'units' => Unit::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'short_name']),
        ]);
    }

    public function store(Request $request, InventoryService $inventory): JsonResponse
    {
        $data = $this->validated($request);
        $opening = (float) ($request->validate(['opening_stock' => ['nullable', 'numeric', 'min:0']])['opening_stock'] ?? 0);

        $product = DB::transaction(function () use ($data, $opening, $inventory, $request) {
            $product = Product::query()->create($data + ['sku' => $data['sku'] ?? 'TMP-'.uniqid()]);

            if (empty($data['sku'])) {
                $product->update(['sku' => 'P'.str_pad((string) $product->id, 5, '0', STR_PAD_LEFT)]);
            }

            if ($opening > 0) {
                $inventory->adjust($this->context->require(), $request->user(), 'opening', [
                    ['product_id' => $product->id, 'quantity' => $opening],
                ], 'Opening stock');
            }

            return $product;
        });

        return response()->json($product, 201);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $data = $this->validated($request, $product);

        if (empty($data['sku'])) {
            unset($data['sku']);
        }

        $product->update($data);

        return response()->json($product);
    }

    public function destroy(Product $product): JsonResponse
    {
        $product->delete();

        return response()->json(status: 204);
    }

    /**
     * Stores a product photo. Whatever is uploaded is scaled down and saved as a
     * JPEG, so a 12-megapixel phone picture does not slow the register down.
     */
    public function storeImage(Request $request, Product $product): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
        ], [
            'image.max' => 'The photo is too large. Choose one under 8 MB.',
        ]);

        $file = $request->file('image');
        $source = @imagecreatefromstring((string) file_get_contents($file->getRealPath()));
        abort_unless($source, 422, 'This photo could not be read. Try a JPG or PNG.');

        $source = $this->upright($source, $file->getRealPath());

        $width = imagesx($source);
        $height = imagesy($source);
        $scale = min(1, 720 / max($width, $height));
        $newWidth = max(1, (int) round($width * $scale));
        $newHeight = max(1, (int) round($height * $scale));

        // JPEG has no transparency, so transparent PNGs are laid over white.
        $canvas = imagecreatetruecolor($newWidth, $newHeight);
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
        imagecopyresampled($canvas, $source, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);

        // A fresh name on every upload doubles as cache-busting.
        $path = 'products/'.$product->id.'-'.Str::random(8).'.jpg';
        File::ensureDirectoryExists(public_path('uploads/products'));
        imagejpeg($canvas, public_path('uploads/'.$path), 86);

        $this->deleteImageFile($product);
        $product->update(['image_path' => $path]);

        return response()->json($product);
    }

    public function destroyImage(Product $product): JsonResponse
    {
        $this->deleteImageFile($product);
        $product->update(['image_path' => null]);

        return response()->json($product);
    }

    private function deleteImageFile(Product $product): void
    {
        if ($product->image_path) {
            File::delete(public_path('uploads/'.$product->image_path));
        }
    }

    /**
     * Phones record rotation in EXIF instead of rotating the pixels; apply it so photos are not sideways.
     */
    private function upright(\GdImage $image, string $path): \GdImage
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }

        $angle = match ((int) (@exif_read_data($path)['Orientation'] ?? 1)) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };

        return $angle ? (imagerotate($image, $angle, 0) ?: $image) : $image;
    }

    private function validated(Request $request, ?Product $product = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'size' => ['nullable', 'string', 'max:40'],
            'sku' => ['nullable', 'string', 'max:60', Rule::unique('products')->ignore($product)],
            'barcode' => ['nullable', 'string', 'max:60', Rule::unique('products')->ignore($product)],
            'category_id' => ['nullable', 'exists:categories,id'],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'unit_id' => ['required', 'exists:units,id'],
            'cost_price' => ['required', 'numeric', 'min:0'],
            'sale_price' => ['required', 'numeric', 'min:0'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'reorder_level' => ['nullable', 'numeric', 'min:0'],
            'description' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
        ]);
    }
}
