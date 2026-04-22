import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, Download, Send, Pencil, X, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import { purchasingApi, type PurchaseOrder, type POItem } from "@/api/purchasing";
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

function fmtUsd(v: string | number) {
  return `USD ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isOverdue(po: PurchaseOrder) {
  return po.expectedDate
    && ["SENT", "PARTIALLY_RECEIVED"].includes(po.status)
    && new Date(po.expectedDate) < new Date();
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

// ── PO items editor (shared by Create and Edit) ───────────────────────────────

type ItemRow = { materialId: string; orderedQty: number | string; unitCostUsd: number | string };

function POItemsEditor({ items, onChange }: { items: ItemRow[]; onChange: (items: ItemRow[]) => void }) {
  const { data: materials } = useQuery({ queryKey: ["materials-all"], queryFn: () => inventoryApi.getMaterials({ page: 1, limit: 200 }) });

  const update = (idx: number, key: keyof ItemRow, value: string) =>
    onChange(items.map((item, i) => i === idx ? { ...item, [key]: value } : item));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="label mb-0">Items *</label>
        <button type="button" onClick={() => onChange([...items, { materialId: "", orderedQty: 1, unitCostUsd: 0 }])} className="btn-secondary text-xs py-1 px-2">
          <Plus size={12} /> Add
        </button>
      </div>
      {/* Column headers */}
      <div className="grid grid-cols-5 gap-2 px-0.5">
        <div className="col-span-2 text-xs font-medium text-gray-500">Material</div>
        <div className="text-xs font-medium text-gray-500">Qty Ordered</div>
        <div className="text-xs font-medium text-gray-500">Unit Cost (USD)</div>
        <div />
      </div>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-5 gap-2 items-center">
            <div className="col-span-2">
              <select className="input" value={item.materialId} onChange={(e) => update(idx, "materialId", e.target.value)}>
                <option value="">Select material…</option>
                {materials?.data.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
              </select>
            </div>
            <input className="input" type="number" min="0.001" step="0.001" placeholder="e.g. 10" value={item.orderedQty} onChange={(e) => update(idx, "orderedQty", e.target.value)} />
            <input className="input" type="number" min="0" step="0.0001" placeholder="e.g. 5.50" value={item.unitCostUsd} onChange={(e) => update(idx, "unitCostUsd", e.target.value)} />
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== idx))} disabled={items.length === 1} className="text-red-400 hover:text-red-600 disabled:opacity-30 text-xs">Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PO Create form ────────────────────────────────────────────────────────────

function POForm({ suppliers, onSuccess, onCancel }: { suppliers: Supplier[]; onSuccess: () => void; onCancel: () => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ materialId: "", orderedQty: 1, unitCostUsd: 0 }]);

  const { mutate, isPending } = useMutation({
    mutationFn: () => purchasingApi.createPO({
      supplierId,
      items: items.map((i) => ({ materialId: i.materialId, orderedQty: Number(i.orderedQty), unitCostUsd: Number(i.unitCostUsd) })),
      expectedDate: expectedDate || undefined,
      notes: notes || undefined,
    }),
    onSuccess: () => { toast.success("Purchase order created"); onSuccess(); },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: { message?: string; errors?: { field: string; message: string }[] } } })?.response?.data;
      const detail = data?.errors?.[0] ? ` (${data.errors[0].field}: ${data.errors[0].message})` : "";
      toast.error((data?.message ?? "Failed to create PO") + detail);
    },
  });

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
      <POItemsEditor items={items} onChange={setItems} />
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

// ── PO Edit form ──────────────────────────────────────────────────────────────

function EditPOForm({ po, onSuccess, onCancel }: { po: PurchaseOrder; onSuccess: () => void; onCancel: () => void }) {
  const [expectedDate, setExpectedDate] = useState(po.expectedDate ? po.expectedDate.split("T")[0] : "");
  const [notes, setNotes] = useState(po.notes ?? "");
  const [items, setItems] = useState<ItemRow[]>(
    (po.items ?? []).map((i) => ({ materialId: i.materialId, orderedQty: Number(i.orderedQty), unitCostUsd: Number(i.unitCost) }))
  );

  const { mutate, isPending } = useMutation({
    mutationFn: () => purchasingApi.editPO(po.id, {
      expectedDate: expectedDate || undefined,
      notes: notes || undefined,
      items: items.map((i) => ({ materialId: i.materialId, orderedQty: Number(i.orderedQty), unitCostUsd: Number(i.unitCostUsd) })),
    }),
    onSuccess: () => { toast.success("Purchase order updated"); onSuccess(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to update PO";
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
        Supplier: <span className="font-medium">{po.supplier?.name}</span> — supplier cannot be changed after creation.
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Expected Date</label>
          <input type="date" className="input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
      </div>
      <POItemsEditor items={items} onChange={setItems} />
      <div>
        <label className="label">Notes</label>
        <textarea className="input resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" disabled={items.some((i) => !i.materialId) || isPending} onClick={() => mutate()} className="btn-primary">
          {isPending ? <Spinner size="sm" /> : "Save Changes"}
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
                <input type="number" step="0.001" className="input w-24 text-right"
                  value={items[idx]?.receivedQty ?? ""}
                  onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, receivedQty: Number(e.target.value) } : it))}
                />
              </td>
              <td className="py-2 text-right">
                <input type="number" step="0.0001" className="input w-28 text-right"
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

// ── PO Detail modal ───────────────────────────────────────────────────────────

function PODetailModal({ po: listPO, onClose, onRefresh }: { po: PurchaseOrder; onClose: () => void; onRefresh: () => void }) {
  const qc = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [showGRN, setShowGRN] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["po-detail", listPO.id],
    queryFn: () => purchasingApi.getPO(listPO.id),
  });
  const po = data?.data ?? listPO;
  const overdue = isOverdue(po);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    qc.invalidateQueries({ queryKey: ["po-detail", po.id] });
    onRefresh();
    refetch();
  };

  const markSentMutation = useMutation({
    mutationFn: () => purchasingApi.updatePO(po.id, { status: "SENT" }),
    onSuccess: () => { toast.success("PO marked as sent"); invalidate(); },
    onError: () => toast.error("Failed to update status"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => purchasingApi.updatePO(po.id, { status: "CANCELLED" }),
    onSuccess: () => { toast.success("Purchase order cancelled"); invalidate(); setConfirmCancel(false); },
    onError: () => toast.error("Failed to cancel PO"),
  });

  const downloadMutation = useMutation({
    mutationFn: () => purchasingApi.downloadPOPDF(po.id, po.poNumber),
    onError: () => toast.error("PDF download failed"),
  });

  const emailMutation = useMutation({
    mutationFn: () => purchasingApi.emailPO(po.id),
    onSuccess: (res) => toast.success(res.message ?? "Email sent to supplier"),
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to send email";
      toast.error(msg);
    },
  });

  const hasSupplierEmail = !!(po.supplier as { email?: string } | undefined)?.email;
  const isTerminal = po.status === "RECEIVED" || po.status === "CANCELLED";

  if (showEdit) {
    return (
      <EditPOForm
        po={po}
        onSuccess={() => { setShowEdit(false); invalidate(); }}
        onCancel={() => setShowEdit(false)}
      />
    );
  }

  if (showGRN) {
    return (
      <GRNForm
        po={po}
        onSuccess={() => { setShowGRN(false); invalidate(); qc.invalidateQueries({ queryKey: ["materials"] }); }}
        onCancel={() => setShowGRN(false)}
      />
    );
  }

  if (confirmCancel) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-700">Cancel <span className="font-semibold">{po.poNumber}</span>? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setConfirmCancel(false)} className="btn-secondary">Keep PO</button>
          <button type="button" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {cancelMutation.isPending ? <Spinner size="sm" /> : "Yes, Cancel PO"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header meta */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <StatusBadge status={po.status} type="po" />
            {overdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                <AlertTriangle size={10} /> OVERDUE
              </span>
            )}
          </div>
          <div>Supplier: <span className="font-medium text-gray-900">{po.supplier?.name ?? "—"}</span></div>
          {(po.supplier as { contactPerson?: string } | undefined)?.contactPerson && (
            <div className="text-xs text-gray-500">{(po.supplier as { contactPerson?: string }).contactPerson}</div>
          )}
          <div>Order Date: {formatDate(po.orderDate)}</div>
          {po.expectedDate && (
            <div className={overdue ? "text-red-600 font-medium" : ""}>
              Expected: {formatDate(po.expectedDate)}
            </div>
          )}
          {po.notes && <div className="text-gray-500 italic text-xs">Note: {po.notes}</div>}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadMutation.mutate()}
            disabled={downloadMutation.isPending}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            {downloadMutation.isPending ? <Spinner size="sm" /> : <Download size={14} />} Download PDF
          </button>

          {po.status === "DRAFT" && (
            <>
              <button type="button" onClick={() => setShowEdit(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                <Pencil size={14} /> Edit
              </button>
              <button
                type="button"
                onClick={() => markSentMutation.mutate()}
                disabled={markSentMutation.isPending}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                {markSentMutation.isPending ? <Spinner size="sm" /> : <Send size={14} />} Mark as Sent
              </button>
            </>
          )}

          {(po.status === "SENT" || po.status === "PARTIALLY_RECEIVED") && (
            <>
              <button
                type="button"
                onClick={() => hasSupplierEmail ? emailMutation.mutate() : toast.error("Supplier has no email address on file.")}
                disabled={emailMutation.isPending}
                title={hasSupplierEmail ? "Email PO to supplier" : "Supplier has no email on file"}
                className={`text-sm flex items-center gap-1.5 rounded-lg border px-3 py-2 font-medium transition-colors ${hasSupplierEmail ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100" : "border-gray-200 text-gray-400 cursor-not-allowed"}`}
              >
                {emailMutation.isPending ? <Spinner size="sm" /> : <Send size={14} />} Send to Supplier
              </button>
              <button type="button" onClick={() => setShowGRN(true)} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 flex items-center gap-1.5">
                <Truck size={14} /> Receive Goods
              </button>
            </>
          )}

          {!isTerminal && (
            <button type="button" onClick={() => setConfirmCancel(true)} className="text-sm flex items-center gap-1.5 text-red-500 hover:text-red-700 px-2">
              <X size={14} /> Cancel PO
            </button>
          )}
        </div>
      </div>

      {/* Line items */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Line Items</h4>
        {isLoading ? (
          <div className="py-4 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="pb-2 text-left">Code</th>
                <th className="pb-2 text-left">Material</th>
                <th className="pb-2 text-right">Ordered</th>
                <th className="pb-2 text-right">Received</th>
                <th className="pb-2 text-right">Unit Cost</th>
                <th className="pb-2 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(po.items ?? []).map((item: POItem) => {
                const received = Number(item.receivedQty);
                const ordered = Number(item.orderedQty);
                return (
                  <tr key={item.id}>
                    <td className="py-2 font-mono text-xs text-gray-500">{item.material?.code}</td>
                    <td className="py-2">{item.material?.name}</td>
                    <td className="py-2 text-right font-mono">{ordered.toFixed(2)} {item.material?.unit}</td>
                    <td className={`py-2 text-right font-mono ${received >= ordered ? "text-green-600" : received > 0 ? "text-amber-600" : "text-gray-400"}`}>
                      {received.toFixed(2)}
                    </td>
                    <td className="py-2 text-right font-mono text-gray-600">{fmtUsd(item.unitCost)}</td>
                    <td className="py-2 text-right font-mono">{fmtUsd(Number(item.unitCost) * ordered)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td colSpan={5} className="pt-2 text-right text-sm font-semibold text-gray-700">Total:</td>
                <td className="pt-2 text-right font-mono font-semibold">{fmtUsd(po.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* GRN history */}
      {(po.grns ?? []).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Goods Received Notes</h4>
          <div className="space-y-2">
            {(po.grns ?? []).map((grn) => (
              <div key={grn.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-semibold text-violet-700">{grn.grnNumber}</span>
                  <span className="text-xs text-gray-500">{formatDate(grn.receivedDate)} · Rate: {Number(grn.exchangeRateAtReceipt).toFixed(2)}</span>
                </div>
                <div className="space-y-0.5">
                  {(grn.items ?? []).map((gi) => (
                    <div key={gi.id} className="flex justify-between text-xs text-gray-600">
                      <span>{gi.material?.code} — {gi.material?.name}</span>
                      <span className="font-mono">{Number(gi.receivedQty).toFixed(2)} · {fmtUsd(gi.unitCostUsd)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <button type="button" onClick={onClose} className="btn-secondary">Close</button>
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
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

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
                  <th className="table-th">Email</th>
                  <th className="table-th">Currency</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="table-td font-medium">{s.name}</td>
                    <td className="table-td text-gray-500">{s.contactPerson ?? "—"}</td>
                    <td className="table-td text-gray-500">{s.phone ?? "—"}</td>
                    <td className="table-td text-gray-500">{s.email ?? "—"}</td>
                    <td className="table-td">{s.preferredCurrency ?? "USD"}</td>
                    <td className="table-td">
                      <button onClick={() => setEditSupplier(s)} className="text-xs text-violet-600 hover:underline flex items-center gap-1">
                        <Pencil size={12} /> Edit
                      </button>
                    </td>
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
                    <th className="table-th text-right">Total (USD)</th>
                    <th className="table-th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pos.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50">
                      <td className="table-td font-mono text-xs font-semibold">
                        <button onClick={() => setDetailPO(po)} className="text-violet-700 hover:underline">
                          {po.poNumber}
                        </button>
                      </td>
                      <td className="table-td font-medium">{po.supplier?.name ?? "—"}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={po.status} type="po" />
                          {isOverdue(po) && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                              <AlertTriangle size={9} /> Overdue
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="table-td text-gray-500">{formatDate(po.expectedDate)}</td>
                      <td className="table-td text-right font-mono">{fmtUsd(po.total)}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          {!["RECEIVED", "CANCELLED"].includes(po.status) && (
                            <button onClick={() => setDetailPO(po)} className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 flex items-center gap-1">
                              <Truck size={12} /> Receive
                            </button>
                          )}
                        </div>
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

      {/* Edit supplier */}
      {editSupplier && (
        <Modal open onClose={() => setEditSupplier(null)} title="Edit Supplier" size="md">
          <SupplierForm
            supplier={editSupplier}
            onSuccess={() => { setEditSupplier(null); qc.invalidateQueries({ queryKey: ["suppliers"] }); }}
            onCancel={() => setEditSupplier(null)}
          />
        </Modal>
      )}

      {/* PO Detail */}
      {detailPO && (
        <Modal open onClose={() => setDetailPO(null)} title={`Purchase Order — ${detailPO.poNumber}`} size="xl">
          <PODetailModal
            po={detailPO}
            onClose={() => setDetailPO(null)}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["purchase-orders"] })}
          />
        </Modal>
      )}
    </div>
  );
}
