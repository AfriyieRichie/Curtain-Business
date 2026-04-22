import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText, Calculator, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { bomApi, type BOMItemPayload } from "@/api/bom";
import { inventoryApi } from "@/api/inventory";
import PageHeader from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import type { BOMTemplate, CurtainType } from "@/types";

type Tab = "templates" | "curtain-types" | "calculator";

// ── Curtain Type Form ─────────────────────────────────────────────────────────

function CurtainTypeForm({ type, onSuccess, onCancel }: { type?: CurtainType; onSuccess: () => void; onCancel: () => void }) {
  const [name, setName] = useState(type?.name ?? "");
  const [description, setDescription] = useState(type?.description ?? "");
  const [fullness, setFullness] = useState("2.5");

  const { mutate, isPending } = useMutation({
    mutationFn: () => type
      ? bomApi.updateCurtainType(type.id, { name, description: description || undefined })
      : bomApi.createCurtainType({ name, description: description || undefined, defaultFullnessRatio: fullness }),
    onSuccess: () => { toast.success(type ? "Updated" : "Curtain type created"); onSuccess(); },
    onError: () => toast.error("Failed to save"),
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Name *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pinch Pleat" />
      </div>
      <div>
        <label className="label">Description</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {!type && (
        <div>
          <label className="label">Default Fullness Ratio</label>
          <input className="input" type="number" step="0.1" value={fullness} onChange={(e) => setFullness(e.target.value)} />
        </div>
      )}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" onClick={() => mutate()} disabled={!name || isPending} className="btn-primary">
          {isPending ? <Spinner size="sm" /> : type ? "Save Changes" : "Create Type"}
        </button>
      </div>
    </div>
  );
}

// ── BOM Template Form ─────────────────────────────────────────────────────────

let itemKey = 0;
function newItem(): BOMItemPayload & { _key: number } {
  return { _key: ++itemKey, materialId: "", quantityFormula: "", notes: "", sortOrder: itemKey };
}

function TemplateForm({ template, curtainTypes, onSuccess, onCancel }: {
  template?: BOMTemplate; curtainTypes: CurtainType[]; onSuccess: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [curtainTypeId, setCurtainTypeId] = useState(template?.curtainTypeId ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [fullness, setFullness] = useState(template?.defaultFullnessRatio ?? "2.5");
  const [items, setItems] = useState<(BOMItemPayload & { _key: number })[]>(
    template?.items?.map((i, idx) => ({ _key: ++itemKey, materialId: i.materialId, quantityFormula: i.quantityFormula, notes: i.notes ?? "", sortOrder: idx })) ?? [newItem()]
  );

  const { data: materialsData } = useQuery({ queryKey: ["materials-all"], queryFn: () => inventoryApi.getMaterials({ page: 1, limit: 500 }), staleTime: 5 * 60_000 });
  const materials = materialsData?.data ?? [];

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const payload = { curtainTypeId, name, description: description || undefined, defaultFullnessRatio: fullness, items: items.map(({ _key, ...i }) => i) };
      return template ? bomApi.updateTemplate(template.id, payload) : bomApi.createTemplate(payload);
    },
    onSuccess: () => { toast.success(template ? "Template updated" : "Template created"); onSuccess(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to save template";
      toast.error(msg);
    },
  });

  function updateItem(key: number, field: keyof BOMItemPayload, value: string) {
    setItems((p) => p.map((i) => i._key === key ? { ...i, [field]: value } : i));
  }

  const canSubmit = name && curtainTypeId && items.every((i) => i.materialId && i.quantityFormula);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Template Name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Pinch Pleat" />
        </div>
        <div>
          <label className="label">Curtain Type *</label>
          <select className="input" value={curtainTypeId} onChange={(e) => setCurtainTypeId(e.target.value)}>
            <option value="">Select type…</option>
            {curtainTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">Default Fullness Ratio</label>
          <input className="input" type="number" step="0.1" value={fullness} onChange={(e) => setFullness(e.target.value)} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <label className="label mb-0">Material Lines *</label>
            <p className="text-xs text-gray-400 mt-0.5">Variables: <code className="bg-gray-100 px-1 rounded">width_m</code> <code className="bg-gray-100 px-1 rounded">drop_m</code> <code className="bg-gray-100 px-1 rounded">fullness_ratio</code> <code className="bg-gray-100 px-1 rounded">fabric_width_m</code></p>
          </div>
          <button type="button" onClick={() => setItems((p) => [...p, newItem()])} className="btn-secondary text-xs py-1 px-2">
            <Plus size={12} /> Add Line
          </button>
        </div>

        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item._key} className="grid grid-cols-12 gap-2 items-start rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="col-span-4">
                <label className="label text-xs">Material *</label>
                <select className="input" value={item.materialId} onChange={(e) => updateItem(item._key, "materialId", e.target.value)}>
                  <option value="">Select…</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                </select>
              </div>
              <div className="col-span-5">
                <label className="label text-xs">Formula *</label>
                <input className="input font-mono text-xs" value={item.quantityFormula} onChange={(e) => updateItem(item._key, "quantityFormula", e.target.value)} placeholder="e.g. (width_m * fullness_ratio) / fabric_width_m * drop_m" />
              </div>
              <div className="col-span-2">
                <label className="label text-xs">Notes</label>
                <input className="input text-xs" value={item.notes ?? ""} onChange={(e) => updateItem(item._key, "notes", e.target.value)} placeholder="Optional" />
              </div>
              <div className="col-span-1 flex items-end pb-1">
                <button type="button" onClick={() => setItems((p) => p.filter((i) => i._key !== item._key))} disabled={items.length === 1} className="text-red-400 hover:text-red-600 disabled:opacity-30 mt-5">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" onClick={() => mutate()} disabled={!canSubmit || isPending} className="btn-primary">
          {isPending ? <Spinner size="sm" /> : template ? "Save Changes" : "Create Template"}
        </button>
      </div>
    </div>
  );
}

// ── Curtain Types Tab ─────────────────────────────────────────────────────────

function CurtainTypesTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CurtainType | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["curtain-types"], queryFn: bomApi.getCurtainTypes });
  const types = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New Curtain Type</button>
      </div>

      {isLoading ? <FullPageSpinner /> : types.length === 0 ? (
        <EmptyState icon={FileText} title="No curtain types" description="Add your first curtain type to start building BOM templates" action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New Curtain Type</button>} />
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Description</th>
                <th className="table-th">Status</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {types.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="table-td font-medium">{t.name}</td>
                  <td className="table-td text-gray-500">{t.description ?? "—"}</td>
                  <td className="table-td">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${t.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {t.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="table-td text-right">
                    <button onClick={() => setEditing(t)} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1"><Pencil size={12} /> Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Curtain Type">
        <CurtainTypeForm onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["curtain-types"] }); }} onCancel={() => setShowCreate(false)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Curtain Type">
        {editing && <CurtainTypeForm type={editing} onSuccess={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["curtain-types"] }); }} onCancel={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

// ── Templates Tab ─────────────────────────────────────────────────────────────

function TemplatesTab({ curtainTypes }: { curtainTypes: CurtainType[] }) {
  const qc = useQueryClient();
  const [filterTypeId, setFilterTypeId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<BOMTemplate | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["bom-templates"], queryFn: () => bomApi.getTemplates() });
  const templates = data?.data ?? [];
  const filtered = filterTypeId ? templates.filter((t) => t.curtainTypeId === filterTypeId) : templates;

  const { mutate: deleteTemplate } = useMutation({
    mutationFn: (id: string) => bomApi.deleteTemplate(id),
    onSuccess: () => { toast.success("Template deleted"); qc.invalidateQueries({ queryKey: ["bom-templates"] }); },
    onError: () => toast.error("Failed to delete"),
  });

  const handleEdit = async (t: BOMTemplate) => {
    const res = await bomApi.getTemplate(t.id);
    setEditing(res.data);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <select className="input max-w-52" value={filterTypeId} onChange={(e) => setFilterTypeId(e.target.value)}>
          <option value="">All curtain types</option>
          {curtainTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New Template</button>
      </div>

      {isLoading ? <FullPageSpinner /> : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No templates" description="Create a BOM template to define material requirements per curtain type" action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New Template</button>} />
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Curtain Type</th>
                <th className="table-th text-center">Lines</th>
                <th className="table-th text-center">Fullness</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="table-td font-medium">{t.name}</td>
                  <td className="table-td text-violet-700 font-medium text-sm">{t.curtainType?.name ?? "—"}</td>
                  <td className="table-td text-center text-gray-500">{t.items?.length ?? 0}</td>
                  <td className="table-td text-center font-mono text-sm">{Number(t.defaultFullnessRatio).toFixed(1)}×</td>
                  <td className="table-td">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => handleEdit(t)} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1"><Pencil size={12} /> Edit</button>
                      <button onClick={() => { if (confirm(`Delete template "${t.name}"?`)) deleteTemplate(t.id); }} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 inline-flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New BOM Template" size="xl">
        <TemplateForm curtainTypes={curtainTypes} onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["bom-templates"] }); }} onCancel={() => setShowCreate(false)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit BOM Template" size="xl">
        {editing && <TemplateForm template={editing} curtainTypes={curtainTypes} onSuccess={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["bom-templates"] }); }} onCancel={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

// ── Calculator ────────────────────────────────────────────────────────────────

function BOMCalculator({ templates }: { templates: BOMTemplate[] }) {
  const [templateId, setTemplateId] = useState("");
  const [widthCm, setWidthCm] = useState("200");
  const [dropCm, setDropCm] = useState("230");
  const [fullnessRatio, setFullnessRatio] = useState("2.5");
  const [fabricWidthCm, setFabricWidthCm] = useState("280");
  const [result, setResult] = useState<{ lines: Array<{ materialId: string; material: { code: string; name: string; unit: string }; quantity: number; lineCostGhs: string }> } | null>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    if (!templateId) { toast.error("Select a template"); return; }
    setLoading(true);
    try {
      const res = await bomApi.calculate({ bomTemplateId: templateId, widthCm: Number(widthCm), dropCm: Number(dropCm), fullnessRatio: Number(fullnessRatio), fabricWidthCm: Number(fabricWidthCm) });
      setResult(res.data);
    } catch {
      toast.error("Calculation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-gray-900">BOM Calculator</h2>
        <div>
          <label className="label">Template</label>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Select template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.curtainType?.name} — {t.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Width (cm)</label><input className="input" type="number" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} /></div>
          <div><label className="label">Drop (cm)</label><input className="input" type="number" value={dropCm} onChange={(e) => setDropCm(e.target.value)} /></div>
          <div><label className="label">Fullness Ratio</label><input className="input" type="number" step="0.1" value={fullnessRatio} onChange={(e) => setFullnessRatio(e.target.value)} /></div>
          <div><label className="label">Fabric Width (cm)</label><input className="input" type="number" value={fabricWidthCm} onChange={(e) => setFabricWidthCm(e.target.value)} /></div>
        </div>
        <button onClick={calculate} disabled={loading} className="btn-primary w-full justify-center">
          <Calculator size={16} className="mr-1" /> {loading ? "Calculating…" : "Calculate BOM"}
        </button>
      </div>

      {result && (
        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Bill of Materials</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-2 text-left text-xs font-semibold text-gray-500">Material</th>
                <th className="pb-2 text-right text-xs font-semibold text-gray-500">Qty</th>
                <th className="pb-2 text-right text-xs font-semibold text-gray-500">Line Cost (GHS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {result.lines.map((line) => (
                <tr key={line.materialId}>
                  <td className="py-2"><p className="font-medium">{line.material.name}</p><p className="text-xs text-gray-400">{line.material.code}</p></td>
                  <td className="py-2 text-right font-mono">{Number(line.quantity).toFixed(3)} {line.material.unit}</td>
                  <td className="py-2 text-right font-mono">GHS {Number(line.lineCostGhs).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td colSpan={2} className="pt-3 text-sm font-semibold">Total Material Cost</td>
                <td className="pt-3 text-right font-mono font-semibold text-violet-700">
                  GHS {result.lines.reduce((s, l) => s + Number(l.lineCostGhs), 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BOMPage() {
  const [tab, setTab] = useState<Tab>("templates");

  const { data: typesData, isLoading: l1 } = useQuery({ queryKey: ["curtain-types"], queryFn: bomApi.getCurtainTypes });
  const { data: templatesData, isLoading: l2 } = useQuery({ queryKey: ["bom-templates"], queryFn: () => bomApi.getTemplates() });

  const curtainTypes = typesData?.data ?? [];
  const templates = templatesData?.data ?? [];

  const TAB_LABELS: Record<Tab, string> = { templates: "Templates", "curtain-types": "Curtain Types", calculator: "Live Calculator" };

  return (
    <div className="space-y-6">
      <PageHeader title="BOM Templates" subtitle="Bill of Materials formulas for each curtain type" />

      <div className="flex gap-1 border-b border-gray-200">
        {(["templates", "curtain-types", "calculator"] as Tab[]).map((key) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === key ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {(l1 || l2) ? <FullPageSpinner /> : (
        <>
          {tab === "templates" && <TemplatesTab curtainTypes={curtainTypes} />}
          {tab === "curtain-types" && <CurtainTypesTab />}
          {tab === "calculator" && <BOMCalculator templates={templates} />}
        </>
      )}
    </div>
  );
}
