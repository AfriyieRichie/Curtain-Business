import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, Download, Send, Pencil, X, AlertTriangle, PackageCheck, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import { purchasingApi, type PurchaseOrder, type POItem, type LandedCostEntry } from "@/api/purchasing";
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

type Tab = "suppliers" | "purchase-orders" | "landed-costs";

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
  const [items, setItems] = useState(
    (po.items ?? []).map((i) => ({
      poItemId: i.id,
      receivedQty: Number(i.orderedQty) - Number(i.receivedQty),
      unitCostUsd: Number(i.unitCost),
    }))
  );
  const [landed, setLanded] = useState({ freight: "", clearing: "", other: "" });

  const { mutate, isPending } = useMutation({
    mutationFn: () => purchasingApi.createGRN(po.id, {
      items,
      freightCostUsd: landed.freight || undefined,
      clearingCostGhs: landed.clearing || undefined,
      otherLandedGhs: landed.other || undefined,
    }),
    onSuccess: () => { toast.success("Goods receipt recorded. Stock updated."); onSuccess(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to record receipt";
      toast.error(msg);
    },
  });

  const poItems = po.items ?? [];
  const hasLanded = Number(landed.freight) > 0 || Number(landed.clearing) > 0 || Number(landed.other) > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
        Enter the quantities <strong>actually received</strong> today. You can receive partially — the PO will stay open for the remainder.
        Confirm or adjust the unit cost if the supplier charged differently.
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
            <th className="pb-2 text-left">Material</th>
            <th className="pb-2 text-right">On PO</th>
            <th className="pb-2 text-right">Previously Received</th>
            <th className="pb-2 text-right">Receiving Now *</th>
            <th className="pb-2 text-right">Unit Cost USD *</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {poItems.map((poItem, idx) => {
            const outstanding = Number(poItem.orderedQty) - Number(poItem.receivedQty);
            return (
              <tr key={poItem.id} className="hover:bg-gray-50">
                <td className="py-3">
                  <div className="font-medium text-gray-900">{poItem.material?.name}</div>
                  <div className="text-xs text-gray-400 font-mono">{poItem.material?.code}</div>
                </td>
                <td className="py-3 text-right font-mono text-gray-600">
                  {Number(poItem.orderedQty).toFixed(2)}
                  <div className="text-xs text-gray-400">{poItem.material?.unit}</div>
                </td>
                <td className="py-3 text-right font-mono text-gray-500">
                  {Number(poItem.receivedQty).toFixed(2)}
                </td>
                <td className="py-3 text-right">
                  <input
                    type="number" min="0" step="0.001"
                    className="input w-28 text-right"
                    value={items[idx]?.receivedQty ?? ""}
                    onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, receivedQty: Number(e.target.value) } : it))}
                  />
                  {outstanding > 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">Outstanding: {outstanding.toFixed(2)}</div>
                  )}
                </td>
                <td className="py-3 text-right">
                  <input
                    type="number" min="0" step="0.0001"
                    className="input w-28 text-right"
                    value={items[idx]?.unitCostUsd ?? ""}
                    onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, unitCostUsd: Number(e.target.value) } : it))}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-2">
        <p className="text-xs font-semibold text-blue-700">
          Landed Costs <span className="font-normal text-blue-500">(optional — enter actual freight &amp; clearing costs from your invoices)</span>
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label text-xs">Freight Invoice (USD)</label>
            <input type="number" min="0" step="0.01" className="input py-1.5 text-sm" value={landed.freight}
              onChange={(e) => setLanded((p) => ({ ...p, freight: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <label className="label text-xs">Port Clearing (GHS)</label>
            <input type="number" min="0" step="0.01" className="input py-1.5 text-sm" value={landed.clearing}
              onChange={(e) => setLanded((p) => ({ ...p, clearing: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <label className="label text-xs">Other (GHS)</label>
            <input type="number" min="0" step="0.01" className="input py-1.5 text-sm" value={landed.other}
              onChange={(e) => setLanded((p) => ({ ...p, other: e.target.value }))} placeholder="0.00" />
          </div>
        </div>
        {hasLanded && (
          <p className="text-xs text-blue-600">These costs will be distributed proportionally to each item's unit cost.</p>
        )}
      </div>

      <div className="flex justify-between items-center pt-1">
        <span className="text-xs text-gray-400">* Stock levels will be updated immediately on confirmation</span>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary">Back</button>
          <button
            type="button"
            onClick={() => mutate()}
            disabled={isPending || items.every((i) => i.receivedQty <= 0)}
            className="btn-primary flex items-center gap-2"
          >
            {isPending ? <Spinner size="sm" /> : <Truck size={14} />}
            Confirm Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PO Detail modal ───────────────────────────────────────────────────────────

function PODetailModal({ po: listPO, onClose, onRefresh }: { po: PurchaseOrder; onClose: () => void; onRefresh: () => void }) {
  const qc = useQueryClient();
  const [view, setView] = useState<"detail" | "edit" | "grn" | "cancel">("detail");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["po-detail", listPO.id],
    queryFn: () => purchasingApi.getPO(listPO.id),
  });
  // Always use fully-loaded PO so items/grns are available
  const po = data?.data ?? listPO;
  const fullLoaded = !!data?.data;
  const overdue = isOverdue(po);
  const hasSupplierEmail = !!(po.supplier as { email?: string } | undefined)?.email;
  const isTerminal = po.status === "RECEIVED" || po.status === "CANCELLED";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    qc.invalidateQueries({ queryKey: ["po-detail", po.id] });
    onRefresh();
    refetch();
  };

  // Send to supplier = email PDF + auto-sets status SENT on server
  const sendMutation = useMutation({
    mutationFn: () => purchasingApi.emailPO(po.id),
    onSuccess: (res) => { toast.success(res.message ?? "PO sent to supplier"); invalidate(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to send";
      toast.error(msg);
    },
  });

  // Manual "mark sent" fallback — only shown when supplier has no email
  const markSentMutation = useMutation({
    mutationFn: () => purchasingApi.updatePO(po.id, { status: "SENT" }),
    onSuccess: () => { toast.success("PO marked as sent"); invalidate(); },
    onError: () => toast.error("Failed to update status"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => purchasingApi.updatePO(po.id, { status: "CANCELLED" }),
    onSuccess: () => { toast.success("Purchase order cancelled"); invalidate(); setView("detail"); },
    onError: () => toast.error("Failed to cancel PO"),
  });

  const downloadMutation = useMutation({
    mutationFn: () => purchasingApi.downloadPOPDF(po.id, po.poNumber),
    onError: () => toast.error("PDF download failed"),
  });

  // ── Edit sub-view ──────────────────────────────────────────────────────────
  if (view === "edit") {
    return (
      <EditPOForm
        po={po}
        onSuccess={() => { setView("detail"); invalidate(); }}
        onCancel={() => setView("detail")}
      />
    );
  }

  // ── GRN sub-view ───────────────────────────────────────────────────────────
  if (view === "grn") {
    if (!fullLoaded) {
      return <div className="py-8 text-center text-sm text-gray-400"><Spinner size="sm" /> Loading order details…</div>;
    }
    return (
      <GRNForm
        po={po}
        onSuccess={() => {
          setView("detail");
          invalidate();
          qc.invalidateQueries({ queryKey: ["materials"] });
        }}
        onCancel={() => setView("detail")}
      />
    );
  }

  // ── Cancel confirm sub-view ────────────────────────────────────────────────
  if (view === "cancel") {
    return (
      <div className="space-y-4 py-2">
        <p className="text-sm text-gray-700">
          Are you sure you want to cancel <span className="font-semibold">{po.poNumber}</span>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setView("detail")} className="btn-secondary">Keep PO</button>
          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {cancelMutation.isPending ? <Spinner size="sm" /> : null} Yes, Cancel PO
          </button>
        </div>
      </div>
    );
  }

  // ── Main detail view ───────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Meta + actions row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-sm text-gray-600">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={po.status} type="po" />
            {overdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                <AlertTriangle size={10} /> OVERDUE
              </span>
            )}
          </div>
          <div>Supplier: <span className="font-medium text-gray-900">{po.supplier?.name ?? "—"}</span>
            {(po.supplier as { contactPerson?: string } | undefined)?.contactPerson && (
              <span className="ml-2 text-xs text-gray-400">{(po.supplier as { contactPerson?: string }).contactPerson}</span>
            )}
          </div>
          <div className="text-xs text-gray-500">Order Date: {formatDate(po.orderDate)}</div>
          {po.expectedDate && (
            <div className={`text-xs ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
              Expected: {formatDate(po.expectedDate)}
            </div>
          )}
          {po.notes && <div className="text-xs text-gray-400 italic">Note: {po.notes}</div>}
        </div>

        <div className="flex flex-wrap gap-2 items-start">
          <button
            onClick={() => downloadMutation.mutate()}
            disabled={downloadMutation.isPending}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            {downloadMutation.isPending ? <Spinner size="sm" /> : <Download size={14} />} Download PDF
          </button>

          {po.status === "DRAFT" && (
            <>
              <button onClick={() => setView("edit")} className="btn-secondary text-sm flex items-center gap-1.5">
                <Pencil size={14} /> Edit
              </button>
              {hasSupplierEmail ? (
                <button
                  onClick={() => sendMutation.mutate()}
                  disabled={sendMutation.isPending}
                  className="btn-primary text-sm flex items-center gap-1.5"
                >
                  {sendMutation.isPending ? <Spinner size="sm" /> : <Send size={14} />} Send to Supplier
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    No supplier email — download PDF and send manually
                  </span>
                  <button
                    onClick={() => markSentMutation.mutate()}
                    disabled={markSentMutation.isPending}
                    className="btn-secondary text-sm flex items-center gap-1.5"
                  >
                    {markSentMutation.isPending ? <Spinner size="sm" /> : null} Mark as Sent
                  </button>
                </div>
              )}
            </>
          )}

          {(po.status === "SENT" || po.status === "PARTIALLY_RECEIVED") && (
            <button
              onClick={() => { if (!fullLoaded) { toast.error("Loading PO details, please wait…"); return; } setView("grn"); }}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 flex items-center gap-1.5"
            >
              <Truck size={14} /> Record Goods Receipt
            </button>
          )}

          {!isTerminal && (
            <button onClick={() => setView("cancel")} className="text-sm flex items-center gap-1.5 text-red-500 hover:text-red-700 px-2 py-2">
              <X size={14} /> Cancel PO
            </button>
          )}
        </div>
      </div>

      {/* Line items */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-700">Line Items</h4>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
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
                const fullyReceived = received >= ordered;
                const partiallyReceived = received > 0 && !fullyReceived;
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="py-2.5 font-mono text-xs text-gray-400">{item.material?.code}</td>
                    <td className="py-2.5 font-medium">{item.material?.name}</td>
                    <td className="py-2.5 text-right font-mono text-gray-600">{ordered.toFixed(2)} <span className="text-xs text-gray-400">{item.material?.unit}</span></td>
                    <td className={`py-2.5 text-right font-mono font-medium ${fullyReceived ? "text-green-600" : partiallyReceived ? "text-amber-600" : "text-gray-300"}`}>
                      {received.toFixed(2)}
                      {fullyReceived && <span className="ml-1 text-xs">✓</span>}
                    </td>
                    <td className="py-2.5 text-right font-mono text-gray-500 text-xs">{fmtUsd(item.unitCost)}</td>
                    <td className="py-2.5 text-right font-mono">{fmtUsd(Number(item.unitCost) * ordered)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td colSpan={5} className="pt-2 text-right text-sm font-semibold text-gray-700">Total:</td>
                <td className="pt-2 text-right font-mono font-bold">{fmtUsd(po.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* GRN history */}
      {(po.grns ?? []).length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700">Goods Received Notes</h4>
          <div className="space-y-2">
            {(po.grns ?? []).map((grn) => (
              <div key={grn.id} className="rounded-lg border border-green-100 bg-green-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-semibold text-green-800">{grn.grnNumber}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      Received {formatDate(grn.receivedDate)} · Rate: GHS {Number(grn.exchangeRateAtReceipt).toFixed(2)}/USD
                    </span>
                    <button
                      onClick={() => purchasingApi.downloadGRNPDF(po.id, grn.id, grn.grnNumber)}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-green-700 hover:bg-green-100"
                    >
                      <Download size={11} /> PDF
                    </button>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-green-100">
                      <th className="pb-1 text-left font-normal">Material</th>
                      <th className="pb-1 text-right font-normal">Qty Received</th>
                      <th className="pb-1 text-right font-normal">Unit Cost (USD)</th>
                      <th className="pb-1 text-right font-normal">Unit Cost (GHS)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(grn.items ?? []).map((gi) => (
                      <tr key={gi.id} className="text-gray-700">
                        <td className="py-0.5">{gi.material?.code} — {gi.material?.name}</td>
                        <td className="py-0.5 text-right font-mono">{Number(gi.receivedQty).toFixed(2)}</td>
                        <td className="py-0.5 text-right font-mono">{fmtUsd(gi.unitCostUsd)}</td>
                        <td className="py-0.5 text-right font-mono">{fmtGhs(gi.unitCostGhs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(Number(grn.freightCostUsd) > 0 || Number(grn.clearingCostGhs) > 0 || Number(grn.otherLandedGhs) > 0) && (
                  <div className="mt-2 rounded bg-green-100 px-3 py-1.5 text-xs text-green-700 flex gap-4 flex-wrap">
                    <span className="font-semibold">Landed costs included:</span>
                    {Number(grn.freightCostUsd) > 0 && <span>Freight {fmtUsd(grn.freightCostUsd)}</span>}
                    {Number(grn.clearingCostGhs) > 0 && <span>Clearing {fmtGhs(grn.clearingCostGhs)}</span>}
                    {Number(grn.otherLandedGhs) > 0 && <span>Other {fmtGhs(grn.otherLandedGhs)}</span>}
                  </div>
                )}
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

// ── GRN Modal Wrapper (fetches full PO then renders GRNForm) ──────────────────

function GRNModalWrapper({ po, onSuccess, onCancel }: { po: PurchaseOrder; onSuccess: () => void; onCancel: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["purchase-order", po.id],
    queryFn: () => purchasingApi.getPO(po.id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
        Loading order details…
      </div>
    );
  }

  const fullPO = data?.data;
  if (!fullPO) return null;

  return <GRNForm po={fullPO} onSuccess={onSuccess} onCancel={onCancel} />;
}

// ── Landed Cost Entry form ────────────────────────────────────────────────────

function LCEForm({ lce, onSuccess, onCancel }: { lce?: LandedCostEntry; onSuccess: () => void; onCancel: () => void }) {
  const isEdit = !!lce;
  const [freight, setFreight] = useState(lce ? String(Number(lce.freightCostUsd) || "") : "");
  const [clearing, setClearing] = useState(lce ? String(Number(lce.clearingCostGhs) || "") : "");
  const [other, setOther] = useState(lce ? String(Number(lce.otherLandedGhs) || "") : "");
  const [rate, setRate] = useState(lce ? String(Number(lce.exchangeRate) || "") : "");
  const [notes, setNotes] = useState(lce?.notes ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(lce?.grns.map((lg) => lg.grnId) ?? []));

  const { data: grnsData } = useQuery({
    queryKey: ["available-grns"],
    queryFn: () => purchasingApi.listAvailableGRNs(),
  });
  const availableGRNs = grnsData?.data ?? [];

  const toggle = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const selected = availableGRNs.filter((g) => selectedIds.has(g.id));

  const distribution = useMemo(() => {
    const totalUsd = selected.reduce((s, g) => s + Number(g.totalUsd), 0);
    const freightGhs = Number(freight || 0) * Number(rate || 15.5);
    const totalLandedGhs = freightGhs + Number(clearing || 0) + Number(other || 0);
    return selected.map((g) => {
      const share = totalUsd > 0 ? Number(g.totalUsd) / totalUsd : 1 / selected.length;
      return { ...g, share: (share * 100).toFixed(1), allocatedGhs: (totalLandedGhs * share).toFixed(2) };
    });
  }, [selected, freight, clearing, other, rate]);

  const totalLandedGhs = Number(freight || 0) * Number(rate || 15.5) + Number(clearing || 0) + Number(other || 0);

  const { mutate, isPending } = useMutation({
    mutationFn: () => isEdit
      ? purchasingApi.updateLCE(lce.id, {
          freightCostUsd: freight ? Number(freight) : undefined,
          clearingCostGhs: clearing ? Number(clearing) : undefined,
          otherLandedGhs: other ? Number(other) : undefined,
          exchangeRate: rate || undefined,
          notes: notes || undefined,
          grnIds: [...selectedIds],
        })
      : purchasingApi.createLCE({
          freightCostUsd: freight ? Number(freight) : undefined,
          clearingCostGhs: clearing ? Number(clearing) : undefined,
          otherLandedGhs: other ? Number(other) : undefined,
          exchangeRate: rate || undefined,
          notes: notes || undefined,
          grnIds: [...selectedIds],
        }),
    onSuccess: () => { toast.success(isEdit ? "Landed cost entry updated" : "Landed cost entry created"); onSuccess(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to save LCE";
      toast.error(msg);
    },
  });

  const canSubmit = selectedIds.size > 0 && (Number(freight) > 0 || Number(clearing) > 0 || Number(other) > 0);

  return (
    <div className="space-y-5">
      {/* Cost inputs */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">Invoice Amounts</p>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="label text-xs">Freight Invoice (USD)</label>
            <input type="number" min="0" step="0.01" className="input py-1.5 text-sm" value={freight}
              onChange={(e) => setFreight(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="label text-xs">Exchange Rate (GHS/USD)</label>
            <input type="number" min="0" step="0.01" className="input py-1.5 text-sm" value={rate}
              onChange={(e) => setRate(e.target.value)} placeholder="e.g. 15.80" />
          </div>
          <div>
            <label className="label text-xs">Port Clearing (GHS)</label>
            <input type="number" min="0" step="0.01" className="input py-1.5 text-sm" value={clearing}
              onChange={(e) => setClearing(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="label text-xs">Other Charges (GHS)</label>
            <input type="number" min="0" step="0.01" className="input py-1.5 text-sm" value={other}
              onChange={(e) => setOther(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        {totalLandedGhs > 0 && (
          <p className="mt-1.5 text-xs text-blue-600 font-medium">
            Total landed cost: GHS {totalLandedGhs.toLocaleString("en-GH", { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>

      {/* GRN selector */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">
          Select GRNs in this shipment <span className="font-normal text-gray-400">({selectedIds.size} selected)</span>
        </p>
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left w-8"></th>
                <th className="px-3 py-2 text-left">GRN</th>
                <th className="px-3 py-2 text-left">PO / Supplier</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Value (USD)</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {availableGRNs.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-sm text-gray-400">No GRNs found</td></tr>
              )}
              {availableGRNs.map((grn) => (
                <tr key={grn.id}
                  onClick={() => !grn.hasPostedLCE && toggle(grn.id)}
                  className={`transition-colors ${grn.hasPostedLCE ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"} ${selectedIds.has(grn.id) ? "bg-blue-50" : ""}`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" readOnly checked={selectedIds.has(grn.id)} disabled={grn.hasPostedLCE}
                      className="rounded accent-violet-600" />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-800">{grn.grnNumber}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900 text-xs">{grn.poNumber}</div>
                    <div className="text-gray-400 text-xs">{grn.supplierName}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-500">{formatDate(grn.receivedDate)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">USD {Number(grn.totalUsd).toFixed(2)}</td>
                  <td className="px-3 py-2.5">
                    {grn.hasPostedLCE
                      ? <span className="text-xs text-amber-600">Allocated ({grn.existingLCE})</span>
                      : <span className="text-xs text-green-600">Available</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Distribution preview */}
      {distribution.length > 0 && totalLandedGhs > 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-700 mb-2">Distribution Preview</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-blue-500 border-b border-blue-100">
                <th className="pb-1 text-left font-normal">GRN</th>
                <th className="pb-1 text-right font-normal">Value (USD)</th>
                <th className="pb-1 text-right font-normal">Share</th>
                <th className="pb-1 text-right font-normal">Allocated (GHS)</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map((g) => (
                <tr key={g.id} className="text-blue-800">
                  <td className="py-0.5 font-mono font-semibold">{g.grnNumber}</td>
                  <td className="py-0.5 text-right font-mono">USD {Number(g.totalUsd).toFixed(2)}</td>
                  <td className="py-0.5 text-right">{g.share}%</td>
                  <td className="py-0.5 text-right font-mono">GHS {Number(g.allocatedGhs).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <label className="label text-xs">Notes</label>
        <textarea className="input resize-none text-sm" rows={2} value={notes}
          onChange={(e) => setNotes(e.target.value)} placeholder="e.g. April container from Shantex — Bill of Lading #BL-12345" />
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" disabled={!canSubmit || isPending} onClick={() => mutate()} className="btn-primary">
          {isPending ? <Spinner size="sm" /> : isEdit ? "Save Changes" : "Save as Draft"}
        </button>
      </div>
    </div>
  );
}

// ── Landed Costs tab ──────────────────────────────────────────────────────────

function LandedCostsTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editLce, setEditLce] = useState<LandedCostEntry | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["landed-costs"],
    queryFn: () => purchasingApi.listLCEs(),
  });
  const lces = data?.data ?? [];

  const { mutate: doPost, isPending: posting } = useMutation({
    mutationFn: (id: string) => purchasingApi.postLCE(id),
    onSuccess: () => {
      toast.success("Landed costs posted. Material costs updated.");
      qc.invalidateQueries({ queryKey: ["landed-costs"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      refetch();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to post";
      toast.error(msg);
    },
  });

  const totalGhs = (lce: LandedCostEntry) => {
    const rate = Number(lce.exchangeRate);
    return Number(lce.freightCostUsd) * rate + Number(lce.clearingCostGhs) + Number(lce.otherLandedGhs);
  };

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Landed Cost Entry
        </button>
      </div>

      {lces.length === 0 ? (
        <EmptyState icon={PackageCheck} title="No landed cost entries"
          description="After receiving goods, create a landed cost entry to allocate freight and clearing charges across GRNs."
          action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New Entry</button>} />
      ) : (
        <div className="space-y-3">
          {lces.map((lce) => {
            const isExpanded = expandedId === lce.id;
            const total = totalGhs(lce);
            return (
              <div key={lce.id} className="card p-0 overflow-hidden">
                {/* Header row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : lce.id)}
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm font-semibold text-gray-800">{lce.lceNumber}</span>
                    <span className="text-xs text-gray-400">{formatDate(lce.createdAt)}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${lce.status === "POSTED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {lce.status === "POSTED" ? <CheckCircle2 size={11} /> : null}
                      {lce.status}
                    </span>
                    <span className="text-xs text-gray-500">{lce.grns.length} GRN{lce.grns.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Total Landed Cost</div>
                      <div className="font-mono text-sm font-semibold text-gray-800">{fmtGhs(total.toFixed(2))}</div>
                    </div>
                    {lce.status === "DRAFT" && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditLce(lce); }}
                          className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); doPost(lce.id); }}
                          disabled={posting}
                          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                          {posting ? <Spinner size="sm" /> : <CheckCircle2 size={13} />}
                          Post
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                    <div className="grid grid-cols-4 gap-4 text-xs">
                      <div><span className="text-gray-400">Freight (USD)</span><div className="font-mono font-medium">{fmtUsd(lce.freightCostUsd)}</div></div>
                      <div><span className="text-gray-400">Exchange Rate</span><div className="font-mono font-medium">GHS {Number(lce.exchangeRate).toFixed(2)}/USD</div></div>
                      <div><span className="text-gray-400">Port Clearing (GHS)</span><div className="font-mono font-medium">{fmtGhs(lce.clearingCostGhs)}</div></div>
                      <div><span className="text-gray-400">Other (GHS)</span><div className="font-mono font-medium">{fmtGhs(lce.otherLandedGhs)}</div></div>
                    </div>
                    {lce.notes && <p className="text-xs text-gray-500 italic">{lce.notes}</p>}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-100">
                          <th className="pb-1 text-left font-normal">GRN</th>
                          <th className="pb-1 text-left font-normal">PO / Supplier</th>
                          <th className="pb-1 text-right font-normal">Received</th>
                          <th className="pb-1 text-right font-normal">GRN Value (USD)</th>
                          <th className="pb-1 text-right font-normal">Allocated (GHS)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lce.grns.map((lg) => {
                          const grnUsd = lg.grn.items.reduce(
                            (s, i) => s + Number(i.receivedQty) * Number(i.unitCostUsd), 0
                          );
                          return (
                            <tr key={lg.id} className="text-gray-700 border-b border-gray-50">
                              <td className="py-1 font-mono font-semibold">{lg.grn.grnNumber}</td>
                              <td className="py-1">
                                <div>{lg.grn.po.poNumber}</div>
                                <div className="text-gray-400">{lg.grn.po.supplier.name}</div>
                              </td>
                              <td className="py-1 text-right">{formatDate(lg.grn.receivedDate)}</td>
                              <td className="py-1 text-right font-mono">USD {grnUsd.toFixed(2)}</td>
                              <td className="py-1 text-right font-mono">
                                {lce.status === "POSTED"
                                  ? fmtGhs(lg.allocatedGhs)
                                  : <span className="text-gray-400 italic">pending post</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal open onClose={() => setShowCreate(false)} title="New Landed Cost Entry" size="xl">
          <LCEForm
            onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["landed-costs"] }); refetch(); }}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {editLce && (
        <Modal open onClose={() => setEditLce(null)} title={`Edit — ${editLce.lceNumber}`} size="xl">
          <LCEForm
            lce={editLce}
            onSuccess={() => { setEditLce(null); qc.invalidateQueries({ queryKey: ["landed-costs"] }); refetch(); }}
            onCancel={() => setEditLce(null)}
          />
        </Modal>
      )}
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
  const [grnPO, setGrnPO] = useState<PurchaseOrder | null>(null);
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
        action={tab !== "landed-costs" ? (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> {tab === "suppliers" ? "New Supplier" : "New PO"}
          </button>
        ) : undefined}
      />

      <div className="flex gap-1 border-b border-gray-200">
        {(["purchase-orders", "suppliers", "landed-costs"] as Tab[]).map((key) => (
          <button key={key} onClick={() => { setTab(key); setPage(1); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {key === "purchase-orders" ? "Purchase Orders" : key === "suppliers" ? "Suppliers" : "Landed Costs"}
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
                          {["SENT", "PARTIALLY_RECEIVED"].includes(po.status) && (
                            <button onClick={() => setGrnPO(po)} className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 flex items-center gap-1">
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

      {tab === "landed-costs" && <LandedCostsTab />}

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

      {/* Receive Goods (GRN) — opened directly from table row */}
      {grnPO && (
        <Modal open onClose={() => setGrnPO(null)} title={`Receive Goods — ${grnPO.poNumber}`} size="xl">
          <GRNModalWrapper
            po={grnPO}
            onSuccess={() => { setGrnPO(null); qc.invalidateQueries({ queryKey: ["purchase-orders"] }); }}
            onCancel={() => setGrnPO(null)}
          />
        </Modal>
      )}
    </div>
  );
}
