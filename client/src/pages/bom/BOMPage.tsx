import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Calculator } from "lucide-react";
import toast from "react-hot-toast";
import { bomApi } from "@/api/bom";
import PageHeader from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import type { BOMTemplate, CurtainType } from "@/types";

type Tab = "templates" | "calculator";

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
          <div>
            <label className="label">Width (cm)</label>
            <input className="input" type="number" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
          </div>
          <div>
            <label className="label">Drop (cm)</label>
            <input className="input" type="number" value={dropCm} onChange={(e) => setDropCm(e.target.value)} />
          </div>
          <div>
            <label className="label">Fullness Ratio</label>
            <input className="input" type="number" step="0.1" value={fullnessRatio} onChange={(e) => setFullnessRatio(e.target.value)} />
          </div>
          <div>
            <label className="label">Fabric Width (cm)</label>
            <input className="input" type="number" value={fabricWidthCm} onChange={(e) => setFabricWidthCm(e.target.value)} />
          </div>
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
                  <td className="py-2">
                    <p className="font-medium">{line.material.name}</p>
                    <p className="text-xs text-gray-400">{line.material.code}</p>
                  </td>
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

function TemplateList({ templates, curtainTypes }: { templates: BOMTemplate[]; curtainTypes: CurtainType[] }) {
  const [filterTypeId, setFilterTypeId] = useState("");
  const filtered = filterTypeId ? templates.filter((t) => t.curtainTypeId === filterTypeId) : templates;

  return (
    <div className="space-y-4">
      <select className="input max-w-52" value={filterTypeId} onChange={(e) => setFilterTypeId(e.target.value)}>
        <option value="">All curtain types</option>
        {curtainTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No templates" description="BOM templates will appear here" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <div key={t.id} className="card hover:shadow-md transition-shadow">
              <p className="font-semibold text-gray-900">{t.name}</p>
              <p className="text-xs text-violet-600 mt-0.5">{t.curtainType?.name}</p>
              <p className="mt-2 text-xs text-gray-500">{t.items?.length ?? 0} material line(s)</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BOMPage() {
  const [tab, setTab] = useState<Tab>("templates");

  const { data: typesData, isLoading: l1 } = useQuery({ queryKey: ["curtain-types"], queryFn: bomApi.getCurtainTypes });
  const { data: templatesData, isLoading: l2 } = useQuery({ queryKey: ["bom-templates"], queryFn: () => bomApi.getTemplates() });

  const curtainTypes = typesData?.data ?? [];
  const templates = templatesData?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="BOM Templates" subtitle="Bill of Materials formulas for each curtain type" />

      <div className="flex gap-1 border-b border-gray-200">
        {(["templates", "calculator"] as Tab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === key ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {key === "calculator" ? "Live Calculator" : "Templates"}
          </button>
        ))}
      </div>

      {(l1 || l2) ? (
        <FullPageSpinner />
      ) : tab === "templates" ? (
        <TemplateList templates={templates} curtainTypes={curtainTypes} />
      ) : (
        <BOMCalculator templates={templates} />
      )}
    </div>
  );
}
