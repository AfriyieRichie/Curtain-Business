import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, ShieldOff, Pencil, Trash2 } from "lucide-react";
import { settingsApi, type BusinessSetting, type MaterialCategory } from "@/api/settings";
import { exchangeRateApi } from "@/api/exchange-rates";
import { authApi, type CreateUserPayload } from "@/api/auth";
import { useRateStore } from "@/store/rate";
import { useAuthStore } from "@/store/auth";
import PageHeader from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import { formatDateTime } from "@/lib/formatters";
import type { User } from "@/types";

// ── General settings ──────────────────────────────────────────────────────────

const GENERAL_KEYS = ["business.name", "business.phone", "business.email", "business.address"];
const LABEL: Record<string, string> = {
  "business.name": "Business Name",
  "business.phone": "Phone",
  "business.email": "Email",
  "business.address": "Address",
  "currency.markupRatio": "Default Markup Ratio (e.g. 0.35 = 35%)",
  "tax.vatRate": "VAT Rate (e.g. 0.20 = 20%)",
  "production.labourRateGhs": "Labour Rate (GHS per hour)",
  "production.overheadRateGhs": "Overhead Rate (GHS per labour hour)",
};

const HINTS: Record<string, string> = {
  "currency.markupRatio": "Applied on top of total cost (materials + labour + overhead) to suggest selling price.",
  "production.labourRateGhs": "How much a worker costs per hour. Multiplied by Labour Hours on each BOM template to get labour cost per panel.",
  "production.overheadRateGhs": "Apportions factory overhead (electricity, rent, consumables) per labour hour. E.g. if your total monthly overhead is GHS 2,000 and you produce 200 hours of work per month, set this to 10. Overhead per panel = Labour Hours × this rate.",
};

function GeneralSettings({ settings }: { settings: BusinessSetting[] }) {
  const qc = useQueryClient();
  const kvMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const [values, setValues] = useState<Record<string, string>>(kvMap);

  useEffect(() => { setValues(kvMap); }, [settings.length]);

  const { mutate, isPending } = useMutation({
    mutationFn: () => settingsApi.bulkUpsert(Object.entries(values).map(([key, value]) => ({ key, value }))),
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: () => toast.error("Failed to save settings"),
  });

  return (
    <div className="space-y-5 max-w-lg">
      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Business Information</h2>
        {[...GENERAL_KEYS, "currency.markupRatio", "tax.vatRate"].map((key) => (
          <div key={key}>
            <label className="label">{LABEL[key] ?? key}</label>
            <input className="input" value={values[key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))} />
            {HINTS[key] && <p className="text-xs text-gray-400 mt-0.5">{HINTS[key]}</p>}
          </div>
        ))}
      </div>

      <div className="card space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Production Costs</h2>
          <p className="text-sm text-gray-500 mt-0.5">Used in BOM pricing to suggest a selling price for each quote line.</p>
        </div>
        {["production.labourRateGhs", "production.overheadRateGhs"].map((key) => (
          <div key={key}>
            <label className="label">{LABEL[key]}</label>
            <input className="input" type="number" min="0" step="0.01" value={values[key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))} placeholder="0.00" />
            <p className="text-xs text-gray-400 mt-0.5">{HINTS[key]}</p>
          </div>
        ))}
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">How overhead apportionment works</p>
          <p>Your monthly factory costs (electricity, rent, maintenance) are spread across panels by labour hours. If your shop costs GHS 2,000/month and your team works 200 hours/month, set <strong>Overhead Rate = 10</strong>. A panel that takes 2 hours of labour gets GHS 20 in overhead added to its cost.</p>
        </div>
      </div>

      <button onClick={() => mutate()} disabled={isPending} className="btn-primary">
        {isPending ? <Spinner size="sm" /> : "Save Settings"}
      </button>
    </div>
  );
}

// ── Currency / Exchange rate ───────────────────────────────────────────────────

function CurrencySettings() {
  const qc = useQueryClient();
  const setRate = useRateStore((s) => s.setRate);
  const [rateInput, setRateInput] = useState("");

  const { data: rateData } = useQuery({ queryKey: ["exchange-rate-current"], queryFn: exchangeRateApi.getCurrent });
  const current = rateData?.data;

  const { mutate, isPending } = useMutation({
    mutationFn: (rate: string) => exchangeRateApi.createRate(rate),
    onSuccess: (res) => {
      toast.success("Exchange rate updated. Material costs will recalculate.");
      setRate(res.data.rate, res.data.createdAt);
      setRateInput("");
      qc.invalidateQueries({ queryKey: ["exchange-rate-current"] });
    },
    onError: () => toast.error("Failed to update rate"),
  });

  return (
    <div className="card max-w-lg space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Exchange Rate</h2>
      {current && (
        <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <p className="text-gray-500">Current rate</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">1 USD = GHS {Number(current.rate).toFixed(4)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Set {formatDateTime(current.createdAt)}</p>
        </div>
      )}
      <div>
        <label className="label">New Rate (GHS per 1 USD)</label>
        <input
          className="input"
          type="number"
          step="0.0001"
          placeholder="e.g. 15.5000"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
        />
      </div>
      <button
        onClick={() => { if (rateInput) mutate(rateInput); }}
        disabled={!rateInput || isPending}
        className="btn-primary"
      >
        {isPending ? <Spinner size="sm" /> : "Update Rate"}
      </button>
    </div>
  );
}

// ── Account ───────────────────────────────────────────────────────────────────

function AccountSettings() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="card max-w-lg space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Your Account</h2>
      <dl className="text-sm space-y-2">
        <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd className="font-medium">{user?.name}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd className="font-medium">{user?.email}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Role</dt><dd className="font-medium">{user?.role}</dd></div>
      </dl>
    </div>
  );
}

// ── Users management ─────────────────────────────────────────────────────────

const ROLES = ["ADMIN", "ACCOUNTS", "SALES", "WORKSHOP"];

function CreateUserForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<CreateUserPayload>({ name: "", email: "", password: "", role: "SALES" });
  const { mutate, isPending } = useMutation({
    mutationFn: () => authApi.createUser(form),
    onSuccess: () => { toast.success("User created"); onSuccess(); },
    onError: () => toast.error("Failed to create user"),
  });

  const set = (k: keyof CreateUserPayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Full Name *</label>
        <input className="input" value={form.name} onChange={set("name")} placeholder="Jane Doe" />
      </div>
      <div>
        <label className="label">Email *</label>
        <input className="input" type="email" value={form.email} onChange={set("email")} placeholder="jane@example.com" />
      </div>
      <div>
        <label className="label">Password *</label>
        <input className="input" type="password" value={form.password} onChange={set("password")} placeholder="Min. 8 characters" />
      </div>
      <div>
        <label className="label">Role *</label>
        <select className="input" value={form.role} onChange={set("role")}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button
          type="button"
          disabled={isPending || !form.name || !form.email || !form.password}
          onClick={() => mutate()}
          className="btn-primary"
        >
          {isPending ? <Spinner size="sm" /> : "Create User"}
        </button>
      </div>
    </div>
  );
}

function UsersSettings() {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: authApi.listUsers });
  const users: User[] = data?.data ?? [];

  const { mutate: deactivate } = useMutation({
    mutationFn: (id: string) => authApi.deactivateUser(id),
    onSuccess: () => { toast.success("User deactivated"); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: () => toast.error("Failed"),
  });

  if (isLoading) return <FullPageSpinner />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">System Users</h2>
        <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New User</button>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="table-th">Name</th>
              <th className="table-th">Email</th>
              <th className="table-th">Role</th>
              <th className="table-th">Status</th>
              <th className="table-th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="table-td font-medium">{u.name}</td>
                <td className="table-td text-gray-500">{u.email}</td>
                <td className="table-td"><span className="badge-gray">{u.role}</span></td>
                <td className="table-td">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${u.isActive !== false ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {u.isActive !== false ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="table-td text-right">
                  {u.id !== currentUser?.id && u.isActive !== false && (
                    <button
                      onClick={() => { if (confirm(`Deactivate ${u.name}?`)) deactivate(u.id); }}
                      className="text-red-400 hover:text-red-600 p-1 rounded"
                      title="Deactivate user"
                    >
                      <ShieldOff size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create User">
        <CreateUserForm
          onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["users"] }); }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>
    </>
  );
}

// ── Material Categories ───────────────────────────────────────────────────────

function CategoryForm({ category, onSuccess, onCancel }: { category?: MaterialCategory; onSuccess: () => void; onCancel: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");

  const { mutate, isPending } = useMutation({
    mutationFn: () => category
      ? settingsApi.updateCategory(category.id, { name, description: description || undefined })
      : settingsApi.createCategory({ name, description: description || undefined }),
    onSuccess: () => { toast.success(category ? "Category updated." : "Category created."); onSuccess(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to save";
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Name *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fabric" />
      </div>
      <div>
        <label className="label">Description</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary" disabled={!name.trim() || isPending} onClick={() => mutate()}>
          {isPending ? "Saving…" : category ? "Save Changes" : "Create Category"}
        </button>
      </div>
    </div>
  );
}

function CategoriesSettings() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<MaterialCategory | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["material-categories"], queryFn: settingsApi.listCategories });
  const categories = data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => settingsApi.deleteCategory(id),
    onSuccess: () => { toast.success("Category deleted."); qc.invalidateQueries({ queryKey: ["material-categories"] }); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to delete";
      toast.error(msg);
    },
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["material-categories"] }); setShowCreate(false); setEditing(null); };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Material Categories</h3>
          <p className="text-sm text-gray-500 mt-0.5">Organise materials by category</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New Category</button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No categories yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
              <th className="pb-2 text-left">Name</th>
              <th className="pb-2 text-left">Description</th>
              <th className="pb-2 text-right">Materials</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((cat) => (
              <tr key={cat.id} className="hover:bg-gray-50">
                <td className="py-2.5 font-medium text-gray-900">{cat.name}</td>
                <td className="py-2.5 text-gray-500">{cat.description ?? "—"}</td>
                <td className="py-2.5 text-right text-gray-500">{cat._count?.materials ?? 0}</td>
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setEditing(cat)} className="rounded p-1 text-gray-400 hover:text-violet-600 hover:bg-violet-50"><Pencil size={14} /></button>
                    <button
                      onClick={() => { if (confirm(`Delete "${cat.name}"?`)) deleteMutation.mutate(cat.id); }}
                      disabled={(cat._count?.materials ?? 0) > 0}
                      className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={(cat._count?.materials ?? 0) > 0 ? "Cannot delete — materials linked" : "Delete"}
                    ><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Category" size="sm">
        <CategoryForm onSuccess={refresh} onCancel={() => setShowCreate(false)} />
      </Modal>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Edit Category" size="sm">
          <CategoryForm category={editing} onSuccess={refresh} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "general" | "currency" | "account" | "users" | "categories";
const TAB_LABELS: Record<Tab, string> = { general: "General", currency: "Currency", account: "Account", users: "Users", categories: "Categories" };

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const currentUser = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: settingsApi.list });
  const settings = data?.data ?? [];

  const tabs: Tab[] = currentUser?.role === "ADMIN"
    ? ["general", "currency", "account", "categories", "users"]
    : ["general", "currency", "account"];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Configure your business profile and system settings" />

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((key) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {isLoading ? <FullPageSpinner /> : (
        <>
          {tab === "general" && <GeneralSettings settings={settings} />}
          {tab === "currency" && <CurrencySettings />}
          {tab === "account" && <AccountSettings />}
          {tab === "categories" && currentUser?.role === "ADMIN" && <CategoriesSettings />}
          {tab === "users" && currentUser?.role === "ADMIN" && <UsersSettings />}
        </>
      )}
    </div>
  );
}
