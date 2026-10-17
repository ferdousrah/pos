<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FinanceCategory;
use App\Models\FinanceEntry;
use App\Models\Transaction;
use App\Services\LedgerService;
use App\Services\SequenceService;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Expenses and other (non-sales) income. Both are a dated amount against a
 * category and an account; only the direction of the money differs.
 */
class FinanceController extends Controller
{
    public function __construct(
        private readonly StoreContext $context,
        private readonly LedgerService $ledger,
        private readonly SequenceService $sequences,
    ) {
    }

    public function index(Request $request, string $type): JsonResponse
    {
        [$from, $to] = $this->period($request);
        $search = $request->input('search');

        $query = FinanceEntry::query()
            ->where('finance_entries.type', $this->type($type))
            ->whereIn('finance_entries.store_id', $this->context->ids())
            ->whereBetween('finance_entries.entry_date', [$from->toDateString(), $to->toDateString()])
            ->when($request->filled('category_id'), fn (Builder $q) => $q->where('finance_category_id', $request->integer('category_id')))
            ->when($search, fn (Builder $q) => $q->where(
                fn (Builder $w) => $w->where('reference_no', 'like', "%{$search}%")
                    ->orWhere('payee', 'like', "%{$search}%")
                    ->orWhere('note', 'like', "%{$search}%")
            ));

        $byCategory = (clone $query)
            ->join('finance_categories', 'finance_categories.id', '=', 'finance_entries.finance_category_id')
            ->groupBy('finance_categories.id', 'finance_categories.name')
            ->orderByDesc('amount')
            ->get(['finance_categories.id', 'finance_categories.name', DB::raw('sum(finance_entries.amount) as amount')])
            ->map(fn ($row) => ['id' => $row->id, 'name' => $row->name, 'amount' => (float) $row->amount]);

        $entries = $query
            ->with('category:id,name', 'account:id,name,type', 'store:id,name,code', 'user:id,name')
            ->orderByDesc('entry_date')
            ->orderByDesc('id')
            ->paginate($this->perPage($request));

        return response()->json($entries->toArray() + [
            'summary' => [
                'total' => (float) $byCategory->sum('amount'),
                'by_category' => $byCategory,
            ],
        ]);
    }

    public function store(Request $request, string $type): JsonResponse
    {
        $type = $this->type($type);
        $data = $this->validated($request, $type);
        $store = $this->context->require();

        $entry = DB::transaction(function () use ($data, $type, $store, $request) {
            $date = Carbon::parse($data['entry_date']);

            $entry = FinanceEntry::query()->create($data + [
                'type' => $type,
                'store_id' => $store->id,
                'user_id' => $request->user()->id,
                'reference_no' => $this->sequences->next($type, $store, $date),
            ]);

            $this->post($entry);

            return $entry;
        });

        return response()->json($entry->load('category:id,name', 'account:id,name,type'), 201);
    }

    public function update(Request $request, string $type, FinanceEntry $entry): JsonResponse
    {
        $this->guard($entry, $type);
        $data = $this->validated($request, $entry->type);

        DB::transaction(function () use ($entry, $data) {
            $entry->transactions->each(fn (Transaction $t) => $this->ledger->reverse($t));
            $entry->update($data);
            $this->post($entry);
        });

        return response()->json($entry->load('category:id,name', 'account:id,name,type'));
    }

    public function destroy(string $type, FinanceEntry $entry): JsonResponse
    {
        $this->guard($entry, $type);

        DB::transaction(function () use ($entry) {
            $entry->transactions->each(fn (Transaction $t) => $this->ledger->reverse($t));
            $entry->delete();
        });

        return response()->json(status: 204);
    }

    public function categories(string $type): JsonResponse
    {
        return response()->json(
            FinanceCategory::query()->where('type', $this->type($type))->withCount('entries')->orderBy('name')->get()
        );
    }

    public function storeCategory(Request $request, string $type): JsonResponse
    {
        $type = $this->type($type);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('finance_categories')->where('type', $type)],
        ]);

        return response()->json(FinanceCategory::query()->create($data + ['type' => $type]), 201);
    }

    public function updateCategory(Request $request, string $type, FinanceCategory $category): JsonResponse
    {
        abort_unless($category->type === $this->type($type), 404);

        $category->update($request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('finance_categories')->where('type', $category->type)->ignore($category)],
            'is_active' => ['boolean'],
        ]));

        return response()->json($category);
    }

    public function destroyCategory(string $type, FinanceCategory $category): JsonResponse
    {
        abort_unless($category->type === $this->type($type), 404);
        abort_if($category->entries()->exists(), 422, 'This category already has entries. Mark it inactive instead.');

        $category->delete();

        return response()->json(status: 204);
    }

    private function post(FinanceEntry $entry): void
    {
        $entry->loadMissing('category');
        $detail = $entry->payee ?: $entry->note;

        $this->ledger->record(
            $entry->account_id,
            $entry->type === FinanceEntry::EXPENSE ? Transaction::OUT : Transaction::IN,
            $entry->amount,
            $entry->type,
            $entry,
            $entry->store_id,
            Carbon::parse($entry->entry_date)->setTimeFrom(now()),
            $entry->reference_no,
            $detail ? "{$entry->category->name} — {$detail}" : $entry->category->name,
        );
    }

    private function guard(FinanceEntry $entry, string $type): void
    {
        abort_unless($entry->type === $this->type($type), 404);
        $this->ensureStoreAccess($entry->store_id);
    }

    /**
     * Maps the URL segment (expenses|income) to the stored type.
     */
    private function type(string $segment): string
    {
        return match ($segment) {
            'expenses' => FinanceEntry::EXPENSE,
            'income' => FinanceEntry::INCOME,
            default => abort(404),
        };
    }

    private function validated(Request $request, string $type): array
    {
        return $request->validate([
            'finance_category_id' => ['required', Rule::exists('finance_categories', 'id')->where('type', $type)],
            'account_id' => ['required', $this->usableAccount()],
            'amount' => ['required', 'numeric', 'gt:0'],
            'entry_date' => ['required', 'date', 'before_or_equal:today'],
            'payee' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
    }
}
