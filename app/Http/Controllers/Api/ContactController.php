<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Supplier;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Customers and suppliers share one shape: a contact with a running trade balance.
 */
class ContactController extends Controller
{
    public function __construct(private readonly StoreContext $context)
    {
    }

    public function index(Request $request, string $type): JsonResponse
    {
        $search = $request->input('search');

        $contacts = $this->withTotals($this->query($type))
            ->when($search, fn (Builder $q) => $q->where(
                fn (Builder $w) => $w->where('name', 'like', "%{$search}%")->orWhere('phone', 'like', "%{$search}%")
            ))
            ->when($request->boolean('with_due'), fn (Builder $q) => $q->having('total_due', '>', 0))
            ->orderBy('name')
            ->paginate($this->perPage($request));

        // Headline figures for the whole list, not just the page on screen.
        $documents = $type === 'customers' ? 'sales' : 'purchases';
        $key = $type === 'customers' ? 'customer_id' : 'supplier_id';

        $trade = DB::table($documents)
            ->whereIn('store_id', $this->context->ids())
            ->whereNotNull($key)
            ->selectRaw('coalesce(sum(total), 0) as total, coalesce(sum(due_amount), 0) as due')
            ->selectRaw("count(distinct case when due_amount > 0 then {$key} end) as with_balance")
            ->first();

        return response()->json($contacts->toArray() + [
            'summary' => [
                'count' => $this->query($type)->count(),
                'with_balance' => (int) $trade->with_balance,
                'total' => (float) $trade->total,
                'due' => (float) $trade->due,
            ],
        ]);
    }

    /**
     * Short list for pickers (POS customer search, purchase supplier select).
     */
    public function options(Request $request, string $type): JsonResponse
    {
        $search = $request->input('search');

        return response()->json(
            $this->query($type)
                ->where('is_active', true)
                ->when($search, fn (Builder $q) => $q->where(
                    fn (Builder $w) => $w->where('name', 'like', "%{$search}%")->orWhere('phone', 'like', "%{$search}%")
                ))
                ->orderBy('name')
                ->limit($type === 'customers' ? 12 : 500)
                ->get(['id', 'name', 'phone'])
        );
    }

    public function show(int $id, string $type): JsonResponse
    {
        $contact = $this->withTotals($this->query($type))->findOrFail($id);
        $relation = $type === 'customers' ? 'sales' : 'purchases';
        $dateColumn = $type === 'customers' ? 'sold_at' : 'purchased_at';

        $contact->setRelation('documents', $contact->{$relation}()
            ->with('store:id,name,code')
            ->whereIn('store_id', $this->context->ids())
            ->orderByDesc($dateColumn)
            ->limit(25)
            ->get());

        return response()->json($contact);
    }

    public function store(Request $request, string $type): JsonResponse
    {
        $contact = $this->query($type)->create($this->validated($request, $type));

        return response()->json($contact, 201);
    }

    public function update(Request $request, int $id, string $type): JsonResponse
    {
        $contact = $this->query($type)->findOrFail($id);
        $contact->update($this->validated($request, $type, $contact));

        return response()->json($contact);
    }

    public function destroy(int $id, string $type): JsonResponse
    {
        $contact = $this->withTotals($this->query($type))->findOrFail($id);

        abort_if($contact->total_due > 0, 422, 'This contact still has an outstanding balance.');

        $contact->delete();

        return response()->json(status: 204);
    }

    private function query(string $type): Builder
    {
        return match ($type) {
            'customers' => Customer::query(),
            'suppliers' => Supplier::query(),
            default => abort(404),
        };
    }

    private function withTotals(Builder $query): Builder
    {
        $scope = fn (Builder $q) => $q->whereIn('store_id', $this->context->ids());

        if ($query->getModel() instanceof Customer) {
            return $query
                ->withCount(['sales' => $scope])
                ->withSum(['sales as total_spent' => $scope], 'total')
                ->withSum(['sales as total_due' => $scope], 'due_amount');
        }

        return $query
            ->withCount(['purchases' => $scope])
            ->withSum(['purchases as total_purchased' => $scope], 'total')
            ->withSum(['purchases as total_due' => $scope], 'due_amount');
    }

    private function validated(Request $request, string $type, ?Model $contact = null): array
    {
        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
        ];

        if ($type === 'customers') {
            $rules['phone'][] = Rule::unique('customers')->ignore($contact)->withoutTrashed();
        } else {
            $rules['contact_person'] = ['nullable', 'string', 'max:255'];
        }

        return $request->validate($rules);
    }
}
