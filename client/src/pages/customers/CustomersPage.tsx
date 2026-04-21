import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import { customersApi } from "@/api/customers";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import { FullPageSpinner } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import type { Customer, CustomerWindow } from "@/types";

// ── Window sub-table ──────────────────────────────────────────────────────────

function WindowsPanel({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const { register, handleSubmit, reset } = useForm<{ roomName: string; widthCm: number; dropCm: number; quantity?: number; notes?: string }>();
  const { data } = useQuery({ queryKey: ["windows", customer.id], queryFn: () => customersApi.getWindows(customer.id) });

  const { mutate: addWindow, isPending: adding } = useMutation({
    mutationFn: (d: Partial<CustomerWindow>) => customersApi.createWindow(customer.id, d),
    onSuccess: () => { toast.success("Window added"); reset(); setShowAdd(false); qc.invalidateQueries({ queryKey: ["windows", customer.id] }); },
    onError: () => toast.error("Failed to add window"),
  });

  const { mutate: deleteWindow } = useMutation({
    mutationFn: (windowId: string) => customersApi.deleteWindow(customer.id, windowId),
    onSuccess: () => { toast.success("Window removed"); qc.invalidateQueries({ queryKey: ["windows", customer.id] }); },
    onError: () => toast.error("Failed to remove window"),
  });

  const windows = data?.data ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Windows / Openings</h3>
        <button onClick={() => setShowAdd(true)} className="btn-secondary text-xs py-1 px-2"><Plus size={12} /> Add</button>
      </div>

      {windows.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No windows recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="pb-1 text-left">Room</th>
              <th className="pb-1 text-right">W (cm)</th>
              <th className="pb-1 text-right">D (cm)</th>
              <th className="pb-1 text-right">Qty</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {windows.map((w) => (
              <tr key={w.id}>
                <td className="py-1.5 font-medium">{w.roomName}</td>
                <td className="py-1.5 text-right font-mono">{w.widthCm}</td>
                <td className="py-1.5 text-right font-mono">{w.dropCm}</td>
                <td className="py-1.5 text-right">{w.quantity}</td>
                <td className="py-1.5 text-right">
                  <button onClick={() => deleteWindow(w.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Window" size="sm">
        <form onSubmit={handleSubmit((d) => addWindow(d))} className="space-y-3">
          <div>
            <label className="label">Room / Label</label>
            <input {...register("roomName", { required: true })} className="input" placeholder="Living Room" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Width (cm)</label>
              <input {...register("widthCm", { valueAsNumber: true })} className="input" type="number" />
            </div>
            <div>
              <label className="label">Drop (cm)</label>
              <input {...register("dropCm", { valueAsNumber: true })} className="input" type="number" />
            </div>
            <div>
              <label className="label">Quantity</label>
              <input {...register("quantity", { valueAsNumber: true })} className="input" type="number" defaultValue={1} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <input {...register("notes")} className="input" placeholder="e.g. with pelmet" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={adding} className="btn-primary">{adding ? <Spinner size="sm" /> : "Add"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ── Customer form ─────────────────────────────────────────────────────────────

interface CustomerFormProps { customer?: Customer; onSuccess: () => void; onCancel: () => void; }

function CustomerForm({ customer, onSuccess, onCancel }: CustomerFormProps) {
  const { register, handleSubmit } = useForm<Partial<Customer>>({ defaultValues: customer ?? {} });
  const { mutate, isPending } = useMutation({
    mutationFn: (d: Partial<Customer>) => customer ? customersApi.update(customer.id, d) : customersApi.create(d),
    onSuccess: () => { toast.success(customer ? "Customer updated" : "Customer created"); onSuccess(); },
    onError: () => toast.error("Failed to save customer"),
  });
  return (
    <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
      <div>
        <label className="label">Full Name *</label>
        <input {...register("name", { required: true })} className="input" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Phone</label>
          <input {...register("phone")} className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input {...register("email")} type="email" className="input" />
        </div>
      </div>
      <div>
        <label className="label">Address</label>
        <textarea {...register("address")} className="input resize-none" rows={2} />
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea {...register("notes")} className="input resize-none" rows={2} />
      </div>
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? <Spinner size="sm" /> : (customer ? "Save Changes" : "Create Customer")}
        </button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", page, search],
    queryFn: () => customersApi.list({ page, limit: 20, search: search || undefined }),
    placeholderData: (p) => p,
  });

  const customers = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle="Manage customer profiles and window measurements"
        action={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Customer
          </button>
        }
      />

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Search customers…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="input pl-9"
        />
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <FullPageSpinner />
        ) : customers.length === 0 ? (
          <EmptyState icon={Users} title="No customers" action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New Customer</button>} />
        ) : (
          <>
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th">Email</th>
                  <th className="table-th text-right">Orders</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(c)}>
                    <td className="table-td font-medium">{c.name}</td>
                    <td className="table-td text-gray-500">{c.phone ?? "—"}</td>
                    <td className="table-td text-gray-500">{c.email ?? "—"}</td>
                    <td className="table-td text-right">{(c as Customer & { _count?: { orders: number } })._count?.orders ?? 0}</td>
                    <td className="table-td text-right"><ChevronRight size={16} className="text-gray-400" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagination && <Pagination page={page} totalPages={pagination.totalPages} onPageChange={setPage} />}
          </>
        )}
      </div>

      {/* Create */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Customer" size="md">
        <CustomerForm onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["customers"] }); }} onCancel={() => setShowCreate(false)} />
      </Modal>

      {/* Detail / Windows drawer */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ""} size="lg">
        {selected && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{selected.phone ?? "—"}</span></div>
              <div><span className="text-gray-500">Email:</span> <span className="font-medium">{selected.email ?? "—"}</span></div>
              <div className="col-span-2"><span className="text-gray-500">Address:</span> <span className="font-medium">{selected.address ?? "—"}</span></div>
            </div>
            <hr className="border-gray-100" />
            <WindowsPanel customer={selected} />
          </div>
        )}
      </Modal>
    </div>
  );
}
