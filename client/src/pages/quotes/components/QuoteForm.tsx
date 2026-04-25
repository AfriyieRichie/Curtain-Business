import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Calculator } from "lucide-react";
import toast from "react-hot-toast";
import { quotesApi, type CreateQuoteItem } from "@/api/quotes";
import { customersApi } from "@/api/customers";
import { bomApi } from "@/api/bom";
import { inventoryApi } from "@/api/inventory";
import Spinner from "@/components/ui/Spinner";

interface Props { onSuccess: () => void; onCancel: () => void; }

interface LineItem extends CreateQuoteItem {
  _key: number;
  _calcedPrice?: string;
  _breakdown?: { mat: number; labour: number; overhead: number };
  _hasLining?: boolean;
}

let keyCounter = 0;
function newLine(): LineItem {
  return { _key: ++keyCounter, curtainTypeId: "", bomTemplateId: "", windowLabel: "", fabricMaterialId: "", liningMaterialId: undefined, widthCm: 200, dropCm: 230, quantity: 1, fullnessRatio: 2.5, fabricWidthCm: 280 };
}

export default function QuoteForm({ onSuccess, onCancel }: Props) {
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [calculating, setCalculating] = useState<number | null>(null);

  const { data: customers } = useQuery({ queryKey: ["customers-mini"], queryFn: () => customersApi.list({ limit: 200 }), staleTime: 5 * 60_000 });
  const { data: typesData } = useQuery({ queryKey: ["curtain-types"], queryFn: bomApi.getCurtainTypes, staleTime: 5 * 60_000 });
  const { data: templatesData } = useQuery({ queryKey: ["bom-templates"], queryFn: () => bomApi.getTemplates(), staleTime: 5 * 60_000 });
  const { data: materialsData, isLoading: materialsLoading } = useQuery({ queryKey: ["materials-all"], queryFn: () => inventoryApi.getMaterials({ page: 1, limit: 500 }), staleTime: 5 * 60_000 });

  const curtainTypes = typesData?.data ?? [];
  const templates = templatesData?.data ?? [];
  const materials = materialsData?.data ?? [];

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => quotesApi.create({
      customerId,
      validUntil: validUntil || undefined,
      notes: notes || undefined,
      items: lines.map(({ _key, _calcedPrice, _breakdown, _hasLining, ...item }) => ({ ...item, unitPriceGhs: _calcedPrice || undefined })),
    }),
    onSuccess: () => { toast.success("Quote created"); onSuccess(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to create quote";
      toast.error(msg);
    },
  });

  function updateLine(key: number, updates: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...updates } : l)));
  }

  async function calcPrice(line: LineItem) {
    if (!line.bomTemplateId) { toast.error("Select a template first"); return; }
    setCalculating(line._key);
    try {
      const res = await bomApi.calculate({
        bomTemplateId: line.bomTemplateId,
        widthCm: line.widthCm,
        dropCm: line.dropCm,
        fullnessRatio: line.fullnessRatio ?? 2.5,
        fabricWidthCm: line.fabricWidthCm ?? 280,
        fabricMaterialId: line.fabricMaterialId || undefined,
        liningMaterialId: line.liningMaterialId || undefined,
      });
      const { totalMatCostGhs, labourCostGhs, overheadCostGhs } = res.data;
      const totalCost = Number(totalMatCostGhs) + Number(labourCostGhs) + Number(overheadCostGhs);
      const suggested = (totalCost * 1.35).toFixed(2);
      updateLine(line._key, { _calcedPrice: suggested, _breakdown: { mat: Number(totalMatCostGhs), labour: Number(labourCostGhs), overhead: Number(overheadCostGhs) } });
    } catch {
      toast.error("Calculation failed");
    } finally {
      setCalculating(null);
    }
  }

  const templatesForType = (typeId: string) => templates.filter((t) => t.curtainTypeId === typeId);
  const canSubmit = customerId && lines.every((l) => l.curtainTypeId && l.bomTemplateId && l.windowLabel && l.fabricMaterialId);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Customer *</label>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select customer…</option>
            {customers?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Valid Until</label>
          <input type="date" className="input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Line Items *</label>
          <button type="button" onClick={() => setLines((p) => [...p, newLine()])} className="btn-secondary text-xs py-1 px-2">
            <Plus size={12} /> Add Line
          </button>
        </div>

        <div className="space-y-3">
          {lines.map((line, idx) => (
            <div key={line._key} className="rounded-lg border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">LINE {idx + 1}</span>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((p) => p.filter((l) => l._key !== line._key))} className="text-red-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Window Label *</label>
                  <input className="input" placeholder="e.g. Living Room Left" value={line.windowLabel} onChange={(e) => updateLine(line._key, { windowLabel: e.target.value })} />
                </div>
                <div>
                  <label className="label">Curtain Type *</label>
                  <select className="input" value={line.curtainTypeId} onChange={(e) => updateLine(line._key, { curtainTypeId: e.target.value, bomTemplateId: "" })}>
                    <option value="">Select type…</option>
                    {curtainTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">BOM Template *</label>
                  <select className="input" value={line.bomTemplateId} onChange={(e) => updateLine(line._key, { bomTemplateId: e.target.value })} disabled={!line.curtainTypeId}>
                    <option value="">Select template…</option>
                    {templatesForType(line.curtainTypeId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Fabric Material *</label>
                  <select className="input" value={line.fabricMaterialId} onChange={(e) => updateLine(line._key, { fabricMaterialId: e.target.value })} disabled={materialsLoading}>
                    <option value="">{materialsLoading ? "Loading…" : materials.length === 0 ? "No materials — add in Inventory first" : "Select fabric…"}</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <input type="checkbox" className="accent-blue-600" checked={!!line._hasLining}
                    onChange={(e) => updateLine(line._key, { _hasLining: e.target.checked, liningMaterialId: e.target.checked ? line.liningMaterialId : undefined })} />
                  <span className="text-xs text-gray-600">This panel has a lining material (set LINING role on BOM template)</span>
                </label>
                {line._hasLining && (
                  <select className="input" value={line.liningMaterialId ?? ""} onChange={(e) => updateLine(line._key, { liningMaterialId: e.target.value || undefined })} disabled={materialsLoading}>
                    <option value="">Select lining…</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="label">Width (cm)</label>
                  <input className="input" type="number" value={line.widthCm} onChange={(e) => updateLine(line._key, { widthCm: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Drop (cm)</label>
                  <input className="input" type="number" value={line.dropCm} onChange={(e) => updateLine(line._key, { dropCm: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Qty</label>
                  <input className="input" type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line._key, { quantity: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Fullness</label>
                  <input className="input" type="number" step="0.1" value={line.fullnessRatio} onChange={(e) => updateLine(line._key, { fullnessRatio: Number(e.target.value) })} />
                </div>
              </div>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="label">Unit Price (GHS) <span className="font-normal text-gray-400">— or auto-calc</span></label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    placeholder="Auto from BOM"
                    value={line._calcedPrice ?? ""}
                    onChange={(e) => updateLine(line._key, { _calcedPrice: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => calcPrice(line)}
                  disabled={calculating === line._key}
                  className="btn-secondary mb-0 flex-shrink-0"
                >
                  {calculating === line._key ? <Spinner size="sm" /> : <Calculator size={14} />}
                  Suggest Price
                </button>
              </div>

              {line._breakdown && (
                <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-xs text-violet-700 flex flex-wrap gap-4">
                  <span>Materials: <strong>GHS {line._breakdown.mat.toFixed(2)}</strong></span>
                  <span>Labour: <strong>GHS {line._breakdown.labour.toFixed(2)}</strong></span>
                  <span>Overhead: <strong>GHS {line._breakdown.overhead.toFixed(2)}</strong></span>
                  <span className="font-semibold">Total cost: GHS {(line._breakdown.mat + line._breakdown.labour + line._breakdown.overhead).toFixed(2)} → +35% = GHS {line._calcedPrice}</span>
                </div>
              )}
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
        <button type="button" disabled={!canSubmit || isPending} onClick={() => submit()} className="btn-primary">
          {isPending ? <Spinner size="sm" /> : "Create Quote"}
        </button>
      </div>
    </div>
  );
}
