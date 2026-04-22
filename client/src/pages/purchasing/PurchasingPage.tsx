import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck } from "lucide-react";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import { purchasingApi, type PurchaseOrder } from "@/api/purchasing";
import { inventoryApi } from "@/api/inventory";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import { FullPageSpinner } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import { formatDate } from "@/lib/formatters";
import type { Supplier } from "@/types";

type Tab = "suppliers" | "purchase-orders";

function fmtGhs(v: string | number) {
  return `GHS ${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Supplier form ─────────────────────────────────────────────────────────────

function SupplierForm({ supplier, onSuccess, onCancel }: { supplier?: Supplier; onSuccess: () => void; onCancel: () => void }) {
  const { register, handleSubmit } = useForm<Partial<Supplier>>({ defaultValues: supplier ?? {} });
  const { mutate, isPending } = useMutation({
    mutationFn: (d: Partial<Supplier>) => supplier ? purchasingApi.updateSupplier(supplier.id, d) : purchasingApi.createSupplier(d),
    onSuccess: () => { toast.success(supplier ? "Supplier updated" : "Supplier created"); onSuccess(); },
    onError: () => toast.error("Failed to save supplier"),
  });
  return (
    <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
      <div>
        <label className="label">Company Name *</label>
        <input {...register("name", { required: true })} className="input" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Contact Person</label>
          <input {...register("contactPerson")} className="input" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input {...register("phone")} className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input {...register("email")} type="email" className="input" />
        </div>
        <div>
          <label className="label">Currency</label>
          <select {...register("preferredCurrency")} className="input">
            {["USD", "EUR", "GBP", "GHS"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Address</label>
        <textarea {...register("address")} className="input resize-none" rows={2} />
      </div>
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isPending} className="btn-primary">{isPending ? <Spinner size="sm" /> : "Save"}</button>
      </div>
    </form>
  );
}

// ── PO form ───────────────────────────────────────────────────────────────────

function POForm({ suppliers, onSuccess, onCancel }: { suppliers: Supplier[]; onSuccess: () => void; onCancel: () => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ materialId: "", orderedQty: 1, unitCostUsd: 0 }]);

  const { data: materials } = useQuery({ queryKey: ["materials-all"], queryFn: () => inventoryApi.getMaterials({ page: 1, limit: 200 }) });

  const { mutate, isPending } = useMutation({
    mutationFn: () => purchasingApi.createPO({ supplierId, items: items.map((i) => ({ ...i, orderedQty: Number(i.orderedQty), unitCostUsd: Number(i.unitCostUsd) })), expectedDate: expectedDate || undefined, notes: notes || undefined }),
    onSuccess: () => { toast.success("Purchase order created"); onSuccess(); },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: { message?: string; errors?: { field: string; message: string }[] } } })?.response?.data;
      const detail = data?.errors?.[0] ? ` (${data.errors[0].field}: ${data.errors[0].message})` : "";
      toast.error((data?.message ?? "Failed to create PO") + detail);
    },
  });

  const updateItem = (idx: number, key: string, value: string | number) => {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [key]: value } : item));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Supplier *</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Expected Date</label>
          <input type="date" className="input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Items *</label>
          <button type="button" onClick={() => setItems((p) => [...p, { materialId: "", orderedQty: 1, unitCostUsd: 0 }])} className="btn-secondary text-xs py-1 px-2"><Plus size={12} /> Add</button>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-5 gap-2 items-end">
              <div className="col-span-2">
                <select className="input" value={item.materialId} onChange={(e) => updateItem(idx, "materialId", e.target.value)}>
                  <option value="">Select material…</option>
                  {materials?.data.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                </select>
              </div>
              <div>
                <input className="input" type="number" placeholder="Qty" value={item.orderedQty} onChange={(e) => updateItem(idx, "orderedQty", e.target.value)} />
              </div>
              <div>
                <input className="input" type="number" step="0.0001" placeholder="Cost (USD)" value={item.unitCostUsd} onChange={(e) => updateItem(idx, "unitCostUsd", e.target.value)} />
              </div>
              <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} disabled={items.length === 1} className="text-red-400 hover:text-red-600 disabled:opacity-30 text-xs">Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea className="input resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" disabled={!supplierId || items.some((i) => !i.materialId) || isPending} onClick={() => mutate()} className="btn-primary">
          {isPending ? <Spinner size="sm" /> : "Create PO"}
        </button>
      </div>
    </div>
  );
}

// ── GRN form ──────────────────────────────────────────────────────────────────

function GRNForm({ po, onSuccess, onCancel }: { po: PurchaseOrder; onSuccess: () => void; onCancel: () => void }) {
  const [items, setItems] = useState((po.items ?? []).map((i) => ({ poItemId: i.id, receivedQty: Number(i.orderedQty), unitCostUsd: Number(i.unitCost) })));
  const { mutate, isPending } = useMutation({
    mutationFn: () => purchasingApi.createGRN(po.id, { items }),
    onSuccess: () => { toast.success("GRN created. Stock updated."); onSuccess(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "GRN failed";
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-500">
            <th className="pb-2 text-left">Material</th>
            <th className="pb-2 text-right">Ordered</th>
            <th className="pb-2 text-right">Receiving</th>
            <th className="pb-2 text-right">Unit Cost (USD)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {(po.items ?? []).map((poItem, idx) => (
            <tr key={poItem.id}>
              <td className="py-2">{poItem.material?.code} — {poItem.material?.name}</td>
              <td className="py-2 text-right font-mono">{Number(poItem.orderedQty).toFixed(2)}</td>
              <td className="py-2 text-right">
                <input
                  type="number" step="0.001"
                  className="input w-24 text-right"
                  value={items[idx]?.receivedQty ?? ""}
                  onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, receivedQty: Number(e.target.value) } : it))}
                />
              </td>
              <td className="py-2 text-right">
                <input
                  type="number" step="0.0001"
                  className="input w-28 text-right"
                  value={items[idx]?.unitCostUsd ?? ""}
                  onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, unitCostUsd: Number(e.target.value) } : it))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" onClick={() => mutate()} disabled={isPending} className="btn-primary">
          {isPending ? <Spinner size="sm" /> : "Receive Goods"}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PurchasingPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("purchase-orders");
  const [page, setPage] = useState(1);
  const [search] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [grnPO, setGrnPO] = useState<PurchaseOrder | null>(null);

  const { data: suppliersData } = useQuery({ queryKey: ["suppliers", page, search], queryFn: () => purchasingApi.listSuppliers({ page, search: search || undefined }) });
  const { data: posData, isLoading: posLoading } = useQuery({ queryKey: ["purchase-orders", page], queryFn: () => purchasingApi.listPOs({ page }), enabled: tab === "purchase-orders" });

  const suppliers = suppliersData?.data ?? [];
  const pos = posData?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchasing"
        subtitle="Manage suppliers and purchase orders"
        action={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> {tab === "suppliers" ? "New Supplier" : "New PO"}
          </button>
        }
      />

      <div className="flex gap-1 border-b border-gray-200">
        {(["purchase-orders", "suppliers"] as Tab[]).map((key) => (
          <button key={key} onClick={() => { setTab(key); setPage(1); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {key === "purchase-orders" ? "Purchase Orders" : "Suppliers"}
          </button>
        ))}
      </div>

      {tab === "suppliers" && (
        <div className="card p-0 overflow-hidden">
          {suppliers.length === 0 ? (
            <EmptyState icon={Truck} title="No suppliers" action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New Supplier</button>} />
          ) : (
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Contact</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th">Currency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="table-td font-medium">{s.name}</td>
                    <td className="table-td text-gray-500">{s.contactPerson ?? "—"}</td>
                    <td className="table-td text-gray-500">{s.phone ?? "—"}</td>
                    <td className="table-td">{s.preferredCurrency ?? "USD"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "purchase-orders" && (
        <div className="card p-0 overflow-hidden">
          {posLoading ? (
            <FullPageSpinner />
          ) : pos.length === 0 ? (
            <EmptyState icon={Truck} title="No purchase orders" action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New PO</button>} />
          ) : (
            <>
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="table-th">PO #</th>
                    <th className="table-th">Supplier</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Expected</th>
                    <th className="table-th text-right">Total (GHS)</th>
                    <th className="table-th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pos.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50">
                      <td className="table-td font-mono text-xs font-semibold text-violet-700">{po.poNumber}</td>
                      <td className="table-td font-medium">{po.supplier?.name ?? "—"}</td>
                      <td className="table-td"><StatusBadge status={po.status} type="po" /></td>
                      <td className="table-td text-gray-500">{formatDate(po.expectedDate)}</td>
                      <td className="table-td text-right font-mono">{fmtGhs(po.total)}</td>
                      <td className="table-td">
                        {!["RECEIVED", "CANCELLED"].includes(po.status) && (
                          <button onClick={() => setGrnPO(po)} className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50">Receive</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {posData?.pagination && <Pagination page={page} totalPages={posData.pagination.totalPages} onPageChange={setPage} />}
            </>
          )}
        </div>
      )}

      {/* Create */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={tab === "suppliers" ? "New Supplier" : "New Purchase Order"} size="lg">
        {tab === "suppliers" ? (
          <SupplierForm onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["suppliers"] }); }} onCancel={() => setShowCreate(false)} />
        ) : (
          <POForm suppliers={suppliers} onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["purchase-orders"] }); }} onCancel={() => setShowCreate(false)} />
        )}
      </Modal>

      {/* GRN */}
      {grnPO && (
        <Modal open onClose={() => setGrnPO(null)} title={`Receive Goods — ${grnPO.poNumber}`} size="lg">
          <GRNForm po={grnPO} onSuccess={() => { setGrnPO(null); qc.invalidateQueries({ queryKey: ["purchase-orders"] }); qc.invalidateQueries({ queryKey: ["materials"] }); }} onCancel={() => setGrnPO(null)} />
        </Modal>
      )}
    </div>
  );
}
