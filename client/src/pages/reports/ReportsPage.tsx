import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/api/reports";
import PageHeader from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/formatters";

type Tab = "sales" | "profitability" | "inventory" | "stock-movements" | "aged-debtors";

function fmtGhs(v: string | number) {
  return `GHS ${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Sales ─────────────────────────────────────────────────────────────────────

function SalesReport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["report-sales", from, to],
    queryFn: () => reportsApi.getSales({ from: from || undefined, to: to || undefined }),
  });
  const report = data?.data as { totals: { totalGhs: string; totalPaid: string; totalOutstanding: string }; invoices: Array<{ id: string; invoiceNumber: string; customer?: { name: string }; totalGhs: string; amountPaidGhs: string; balanceGhs: string; createdAt: string }> } | undefined;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div><label className="label">From</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button onClick={() => refetch()} className="btn-secondary">Apply</button>
      </div>
      {isLoading ? <FullPageSpinner /> : report && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[["Total Revenue", report.totals.totalGhs], ["Total Collected", report.totals.totalPaid], ["Outstanding", report.totals.totalOutstanding]].map(([label, val]) => (
              <div key={label} className="card text-center">
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{fmtGhs(val)}</p>
              </div>
            ))}
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Invoice #</th>
                  <th className="table-th">Customer</th>
                  <th className="table-th text-right">Total</th>
                  <th className="table-th text-right">Paid</th>
                  <th className="table-th text-right">Balance</th>
                  <th className="table-th">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="table-td font-mono text-xs font-semibold text-violet-700">{inv.invoiceNumber}</td>
                    <td className="table-td">{inv.customer?.name ?? "—"}</td>
                    <td className="table-td text-right font-mono">{fmtGhs(inv.totalGhs)}</td>
                    <td className="table-td text-right font-mono text-green-600">{fmtGhs(inv.amountPaidGhs)}</td>
                    <td className="table-td text-right font-mono text-red-600">{fmtGhs(inv.balanceGhs)}</td>
                    <td className="table-td text-gray-500">{formatDate(inv.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Profitability ─────────────────────────────────────────────────────────────

function ProfitabilityReport() {
  const { data, isLoading } = useQuery({ queryKey: ["report-profitability"], queryFn: () => reportsApi.getProfitability() });
  const rows = data?.data as Array<{ jobCardId: string; orderNumber: string; revenueGhs: string; materialCostGhs: string; grossProfitGhs: string; marginPct: string }> | undefined;

  return isLoading ? <FullPageSpinner /> : (
    <div className="card p-0 overflow-hidden">
      <table className="w-full">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="table-th">Order</th>
            <th className="table-th text-right">Revenue</th>
            <th className="table-th text-right">Material Cost</th>
            <th className="table-th text-right">Gross Profit</th>
            <th className="table-th text-right">Margin %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {(rows ?? []).map((r) => (
            <tr key={r.jobCardId}>
              <td className="table-td font-mono text-xs font-semibold text-violet-700">{r.orderNumber}</td>
              <td className="table-td text-right font-mono">{fmtGhs(r.revenueGhs)}</td>
              <td className="table-td text-right font-mono">{fmtGhs(r.materialCostGhs)}</td>
              <td className={`table-td text-right font-mono font-medium ${Number(r.grossProfitGhs) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtGhs(r.grossProfitGhs)}</td>
              <td className="table-td text-right">{Number(r.marginPct).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Inventory ─────────────────────────────────────────────────────────────────

function InventoryReport() {
  const { data, isLoading } = useQuery({ queryKey: ["report-inventory"], queryFn: reportsApi.getInventory });
  const report = data?.data as { totalGhs: string; totalUsd: string; items: Array<{ id: string; code: string; name: string; currentStock: string; unit: string; unitCostGhs: string; lineValueGhs: string; category?: { name: string } }> } | undefined;

  return isLoading ? <FullPageSpinner /> : report ? (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center">
          <p className="text-sm text-gray-500">Total Value (GHS)</p>
          <p className="text-2xl font-bold mt-1">{fmtGhs(report.totalGhs)}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">Total Value (USD)</p>
          <p className="text-2xl font-bold mt-1">$ {Number(report.totalUsd).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="table-th">Code</th>
              <th className="table-th">Name</th>
              <th className="table-th">Category</th>
              <th className="table-th text-right">Stock</th>
              <th className="table-th text-right">Unit Cost</th>
              <th className="table-th text-right">Line Value (GHS)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.items.map((m) => (
              <tr key={m.id}>
                <td className="table-td font-mono text-xs font-semibold text-violet-700">{m.code}</td>
                <td className="table-td">{m.name}</td>
                <td className="table-td text-gray-500">{m.category?.name ?? "—"}</td>
                <td className="table-td text-right font-mono">{Number(m.currentStock).toFixed(2)} {m.unit}</td>
                <td className="table-td text-right font-mono">{fmtGhs(m.unitCostGhs)}</td>
                <td className="table-td text-right font-mono font-medium">{fmtGhs(m.lineValueGhs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : null;
}

// ── Aged Debtors ──────────────────────────────────────────────────────────────

function AgedDebtorsReport() {
  const { data, isLoading } = useQuery({ queryKey: ["report-aged"], queryFn: reportsApi.getAgedDebtors });
  const report = data?.data as { summary: Record<string, string>; rows: Array<{ invoiceId: string; invoiceNumber: string; customer?: { name: string }; dueDate?: string; balanceGhs: string; daysOverdue: number }> } | undefined;

  return isLoading ? <FullPageSpinner /> : report ? (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(report.summary).map(([bucket, val]) => (
          <div key={bucket} className="card text-center">
            <p className="text-xs text-gray-500">{bucket === "current" ? "Current" : `${bucket} days`}</p>
            <p className="text-lg font-bold mt-1">{fmtGhs(val)}</p>
          </div>
        ))}
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="table-th">Invoice #</th>
              <th className="table-th">Customer</th>
              <th className="table-th">Due Date</th>
              <th className="table-th text-right">Days Overdue</th>
              <th className="table-th text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.rows.map((r) => (
              <tr key={r.invoiceId}>
                <td className="table-td font-mono text-xs font-semibold text-violet-700">{r.invoiceNumber}</td>
                <td className="table-td">{r.customer?.name ?? "—"}</td>
                <td className="table-td text-gray-500">{formatDate(r.dueDate)}</td>
                <td className={`table-td text-right font-medium ${r.daysOverdue > 30 ? "text-red-600" : r.daysOverdue > 0 ? "text-amber-600" : "text-gray-600"}`}>{r.daysOverdue}</td>
                <td className="table-td text-right font-mono text-red-600">{fmtGhs(r.balanceGhs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

const tabs: { key: Tab; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "profitability", label: "Profitability" },
  { key: "inventory", label: "Inventory Valuation" },
  { key: "aged-debtors", label: "Aged Debtors" },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("sales");

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Financial and operational reports" />

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === key ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "sales" && <SalesReport />}
      {tab === "profitability" && <ProfitabilityReport />}
      {tab === "inventory" && <InventoryReport />}
      {tab === "aged-debtors" && <AgedDebtorsReport />}
    </div>
  );
}
