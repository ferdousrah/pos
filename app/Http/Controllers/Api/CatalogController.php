<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Unit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Categories, brands and units are the same kind of thing — a named list
 * products point at — so one controller serves all three.
 */
class CatalogController extends Controller
{
    private const MODELS = [
        'categories' => Category::class,
        'brands' => Brand::class,
        'units' => Unit::class,
    ];

    public function index(string $type): JsonResponse
    {
        return response()->json(
            $this->model($type)::query()->withCount('products')->orderBy('name')->get()
        );
    }

    public function store(Request $request, string $type): JsonResponse
    {
        $record = $this->model($type)::query()->create($this->validated($request, $type));

        return response()->json($record, 201);
    }

    public function update(Request $request, string $type, int $id): JsonResponse
    {
        $record = $this->model($type)::query()->findOrFail($id);
        $record->update($this->validated($request, $type, $record));

        return response()->json($record);
    }

    public function destroy(string $type, int $id): JsonResponse
    {
        $record = $this->model($type)::query()->withCount('products')->findOrFail($id);

        abort_if($record->products_count > 0, 422, 'This is still used by products. Move them first or mark it inactive.');

        $record->delete();

        return response()->json(status: 204);
    }

    /**
     * @return class-string<Model>
     */
    private function model(string $type): string
    {
        return self::MODELS[$type] ?? abort(404);
    }

    private function validated(Request $request, string $type, ?Model $record = null): array
    {
        $rules = [
            'name' => ['required', 'string', 'max:120', Rule::unique($type)->ignore($record)],
            'is_active' => ['boolean'],
        ];

        if ($type === 'units') {
            $rules['short_name'] = ['required', 'string', 'max:12'];
            $rules['allow_decimal'] = ['boolean'];
        }

        return $request->validate($rules);
    }
}
