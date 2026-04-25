import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Tag, BarChart2, Receipt, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { expensesApi } from "@/api/expenses";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { Expense, ExpenseCategory, ExpenseType, OverheadSummary } from "@/types";
import { formatDate } from "@/lib/formatters";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ExpenseType, string> = { ADMIN: "Admin", FACTORY: "Factory", SHARED: "Shared" };
const TYPE_COLORS: Record<ExpenseType, string> = {
  ADMIN: "bg-blue-100 text-blue-700",
  FACTORY: "bg-orange-100 text-orange-700",
  SHARED: "bg-purple-100 text-purple-700",
};

function fmt(v: string | number) {
  return Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

// ── Expense Form ──────────────────────────────────────────────────────────────

interface ExpenseFormProps {
  expense?: Expense;
  categories: ExpenseCategory[];
  onSuccess: () => void;
  onCancel: () => void;
}

function ExpenseForm({ expense, categories, onSuccess, onCancel }: ExpenseFormProps) {
  const [form, setForm] = useState({
    date: expense ? expense.date.slice(0, 10) : todayISO(),
    description: expense?.description ?? "",
    amountGhs: expense ? String(Number(expense.amountGhs)) : "",
    type: (expense?.type ?? "SHARED") as ExpenseType,
    categoryId: expense?.categoryId ?? "",
    notes: expense?.notes ?? "",
  });

  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      expense
        ? expensesApi.updateExpense(expense.id, { ...form, categoryId: form.categoryId || null, notes: form.notes || undefined })
        : expensesApi.createExpense({ ...form, categoryId: form.categoryId || null, notes: form.notes || undefined }),
    onSuccess: () => {
      toast.success(expense ? "Expense updated" : "Expense logged");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      onSuccess();
    },
    onError: () => toast.error("Failed to save expense"),
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mutate(); }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={form.date} onChange={(e) => set("date", e.target.value)} required />
        </div>
        <div>
          <label className="label">Amount (GHS)</label>
          <input type="number" step="0.01" min="0" className="input" placeholder="0.00" value={form.amountGhs} onChange={(e) => set("amountGhs", e.target.value)} required />
        </div>
      </div>

      <div>
        <label className="label">Description</label>
        <input type="text" className="input" placeholder="e.g. Electricity bill — April" value={form.description} onChange={(e) => set("description", e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Type</label>
          <div className="flex gap-2 mt-1">
            {(["ADMIN", "FACTORY", "SHARED"] as ExpenseType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("type", t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  form.type === t ? TYPE_COLORS[t] + " border-transparent" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          {form.type === "SHARED" && (
            <p className="mt-1 text-xs text-purple-600">65% → Factory overhead · 35% → Admin overhead</p>
          )}
        </div>
        <div>
          <label className="label">Category (optional)</label>
          <select className="input" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({TYPE_LABELS[c.type]})</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Notes (optional)</label>
        <textarea className="input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "Saving…" : expense ? "Update" : "Log Expense"}
        </button>
      </div>
    </form>
  );
}

// ── Category Form ─────────────────────────────────────────────────────────────

interface CategoryFormProps {
  category?: ExpenseCategory;
  onSuccess: () => void;
  onCancel: () => void;
}

function CategoryForm({ category, onSuccess, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? "");
  const [type, setType] = useState<ExpenseType>(category?.type ?? "SHARED");
  const qc = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      category
        ? expensesApi.updateCategory(category.id, { name, type })
        : expensesApi.createCategory({ name, type }),
    onSuccess: () => {
      toast.success(category ? "Category updated" : "Category created");
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
      onSuccess();
    },
    onError: () => toast.error("Failed to save category"),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutate(); }} className="space-y-4">
      <div>
        <label className="label">Name</label>
        <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Electricity" />
      </div>
      <div>
        <label className="label">Default Type</label>
        <div className="flex gap-2 mt-1">
          {(["ADMIN", "FACTORY", "SHARED"] as ExpenseType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                type === t ? TYPE_COLORS[t] + " border-transparent" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "Saving…" : category ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}

// ── Expense Log Tab ───────────────────────────────────────────────────────────

function ExpenseLogTab({ categories }: { categories: ExpenseCategory[] }) {
  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [typeFilter, setTypeFilter] = useState<ExpenseType | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Expense | null>(null);
  const [deleteItem, setDeleteItem] = useState<Expense | null>(null);

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["expenses", from, to, typeFilter],
    queryFn: () => expensesApi.getExpenses({ from, to, type: typeFilter || undefined }),
  });

  const { mutate: doDelete, isPending: deleting } = useMutation({
    mutationFn: (id: string) => expensesApi.deleteExpense(id),
    onSuccess: () => {
      toast.success("Expense deleted");
      setDeleteItem(null);
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const expenses = data?.data ?? [];
  const total = expenses.reduce((s, e) => s + Number(e.amountGhs), 0);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        <select className="input w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ExpenseType | "")}>
          <option value="">All types</option>
          <option value="ADMIN">Admin</option>
          <option value="FACTORY">Factory</option>
          <option value="SHARED">Shared</option>
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {expenses.length} entries · <span className="font-semibold text-gray-900">GHS {fmt(total)}</span>
          </span>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Log Expense
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? <FullPageSpinner /> : expenses.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No expenses in this period</div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">Description</th>
                <th className="table-th">Category</th>
                <th className="table-th">Type</th>
                <th className="table-th text-right">Amount (GHS)</th>
                <th className="table-th text-center">Approval</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="table-td text-sm text-gray-500">{formatDate(e.date)}</td>
                  <td className="table-td">
                    <div className="font-medium text-sm">{e.description}</div>
                    {e.notes && <div className="text-xs text-gray-400">{e.notes}</div>}
                  </td>
                  <td className="table-td text-sm text-gray-500">{e.category?.name ?? "—"}</td>
                  <td className="table-td">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[e.type]}`}>
                      {TYPE_LABELS[e.type]}
                    </span>
                  </td>
                  <td className="table-td text-right font-mono font-semibold">{fmt(e.amountGhs)}</td>
                  <td className="table-td text-center">
                    {e.approvalStatus === "PENDING" && (
                      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pending</span>
                    )}
                    {e.approvalStatus === "APPROVED" && (
                      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Approved</span>
                    )}
                    {e.approvalStatus === "REJECTED" && (
                      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Rejected</span>
                    )}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setEditItem(e)} className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteItem(e)} className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Log Expense" size="md">
        <ExpenseForm categories={categories} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Expense" size="md">
        {editItem && (
          <ExpenseForm expense={editItem} categories={categories} onSuccess={() => setEditItem(null)} onCancel={() => setEditItem(null)} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={() => deleteItem && doDelete(deleteItem.id)}
        title="Delete Expense"
        message={`Delete "${deleteItem?.description}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}

// ── Categories Tab ────────────────────────────────────────────────────────────

function CategoriesTab({ categories }: { categories: ExpenseCategory[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<ExpenseCategory | null>(null);
  const [deleteItem, setDeleteItem] = useState<ExpenseCategory | null>(null);
  const qc = useQueryClient();

  const { mutate: doDelete, isPending: deleting } = useMutation({
    mutationFn: (id: string) => expensesApi.deleteCategory(id),
    onSuccess: () => {
      toast.success("Category deleted");
      setDeleteItem(null);
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to delete"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Add Category
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {categories.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No categories yet</div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Default Type</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="table-td font-medium">{c.name}</td>
                  <td className="table-td">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[c.type]}`}>
                      {TYPE_LABELS[c.type]}
                    </span>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setEditItem(c)} className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteItem(c)} className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Category" size="sm">
        <CategoryForm onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Category" size="sm">
        {editItem && (
          <CategoryForm category={editItem} onSuccess={() => setEditItem(null)} onCancel={() => setEditItem(null)} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={() => deleteItem && doDelete(deleteItem.id)}
        title="Delete Category"
        message={`Delete category "${deleteItem?.name}"?`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}

// ── Overhead Analysis Tab ─────────────────────────────────────────────────────

function OverheadAnalysisTab() {
  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [capacityHours, setCapacityHours] = useState("");
  const [applied, setApplied] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["overhead-summary", from, to],
    queryFn: () => expensesApi.getOverheadSummary({ from, to }),
    enabled: !!from && !!to,
  });

  const summary: OverheadSummary | undefined = data?.data;

  const effectiveCapacity = capacityHours || summary?.capacityHours || "0";
  const suggestedRate = useMemo(() => {
    if (!summary) return null;
    const cap = Number(effectiveCapacity);
    if (cap <= 0) return null;
    return (Number(summary.totalFactoryOverhead) / cap).toFixed(4);
  }, [summary, effectiveCapacity]);

  const { mutate: applyRate, isPending: applying } = useMutation({
    mutationFn: () =>
      expensesApi.applyOverheadRate({
        overheadRate: suggestedRate!,
        capacityHours: effectiveCapacity || undefined,
      }),
    onSuccess: () => {
      toast.success(`Overhead rate updated to GHS ${suggestedRate}/hr`);
      setApplied(true);
    },
    onError: () => toast.error("Failed to apply rate"),
  });

  return (
    <div className="space-y-6">
      {/* Date filter */}
      <div className="card p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">From</label>
          <input type="date" className="input w-auto" value={from} onChange={(e) => { setFrom(e.target.value); setApplied(false); }} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">To</label>
          <input type="date" className="input w-auto" value={to} onChange={(e) => { setTo(e.target.value); setApplied(false); }} />
        </div>
        <button className="btn-secondary" onClick={() => { refetch(); setApplied(false); }}>Refresh</button>
      </div>

      {isLoading ? <FullPageSpinner /> : summary ? (
        <>
          {/* Breakdown cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4 border-l-4 border-blue-400">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Admin-only Expenses</p>
              <p className="text-xl font-bold text-gray-900 mt-1">GHS {fmt(summary.adminTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">{summary.expenseCount > 0 ? "Pure administrative" : "No entries"}</p>
            </div>
            <div className="card p-4 border-l-4 border-orange-400">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Factory-only Expenses</p>
              <p className="text-xl font-bold text-gray-900 mt-1">GHS {fmt(summary.factoryTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">Direct factory costs</p>
            </div>
            <div className="card p-4 border-l-4 border-purple-400">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Shared Expenses</p>
              <p className="text-xl font-bold text-gray-900 mt-1">GHS {fmt(summary.sharedTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">
                Factory 65%: GHS {fmt(summary.sharedFactoryPortion)} · Admin 35%: GHS {fmt(summary.sharedAdminPortion)}
              </p>
            </div>
          </div>

          {/* Overhead totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5 bg-orange-50 border border-orange-200">
              <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Total Factory Overhead</p>
              <p className="text-3xl font-bold text-orange-700 mt-1">GHS {fmt(summary.totalFactoryOverhead)}</p>
              <p className="text-xs text-orange-500 mt-1">Factory expenses + 65% of shared</p>
            </div>
            <div className="card p-5 bg-blue-50 border border-blue-200">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total Admin Overhead</p>
              <p className="text-3xl font-bold text-blue-700 mt-1">GHS {fmt(summary.totalAdminOverhead)}</p>
              <p className="text-xs text-blue-500 mt-1">Admin expenses + 35% of shared</p>
            </div>
          </div>

          {/* Rate computation */}
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">Compute Overhead Rate</h3>
            <p className="text-sm text-gray-500">
              Enter your total production (labour) hours for this period. The suggested rate divides
              your total factory overhead by those hours.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="label">Production Hours for Period</label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  className="input w-40"
                  placeholder={summary.capacityHours !== "0" ? summary.capacityHours : "e.g. 160"}
                  value={capacityHours}
                  onChange={(e) => { setCapacityHours(e.target.value); setApplied(false); }}
                />
                {summary.capacityHours !== "0" && !capacityHours && (
                  <p className="text-xs text-gray-400 mt-1">Using saved: {summary.capacityHours} hrs</p>
                )}
              </div>

              {suggestedRate && (
                <div className="flex-1 min-w-48 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                  <p className="text-xs text-emerald-600 font-medium">Suggested Overhead Rate</p>
                  <p className="text-2xl font-bold text-emerald-700">GHS {fmt(suggestedRate)} / hr</p>
                </div>
              )}
            </div>

            {suggestedRate && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  className="btn-primary"
                  onClick={() => applyRate()}
                  disabled={applying || applied}
                >
                  {applying ? "Applying…" : applied ? "Applied ✓" : "Apply to Production Rate"}
                </button>
                {applied && (
                  <span className="flex items-center gap-1 text-sm text-emerald-600">
                    <CheckCircle size={16} /> Production overhead rate is now GHS {fmt(suggestedRate)}/hr
                  </span>
                )}
              </div>
            )}

            {!suggestedRate && (
              <p className="text-sm text-amber-600">Enter production hours above to see the suggested rate.</p>
            )}
          </div>
        </>
      ) : (
        <div className="py-12 text-center text-gray-400 text-sm">Select a date range to analyse expenses</div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "log" | "categories" | "overhead";

export default function ExpensesPage() {
  const [tab, setTab] = useState<Tab>("log");

  const { data: catData } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => expensesApi.getCategories(),
  });
  const categories = catData?.data ?? [];

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "log", label: "Expense Log", icon: Receipt },
    { key: "categories", label: "Categories", icon: Tag },
    { key: "overhead", label: "Overhead Analysis", icon: BarChart2 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        subtitle="Log daily business expenses and analyse factory overhead"
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === "log" && <ExpenseLogTab categories={categories} />}
      {tab === "categories" && <CategoriesTab categories={categories} />}
      {tab === "overhead" && <OverheadAnalysisTab />}
    </div>
  );
}
