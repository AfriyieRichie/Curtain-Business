import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Users, ClipboardList, TrendingUp, AlertTriangle,
  Receipt, Wrench, ArrowRight,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { reportsApi } from "@/api/reports";
import { FullPageSpinner } from "@/components/ui/Spinner";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  link?: string;
  alert?: boolean;
}

function KPICard({ title, value, icon: Icon, color, link, alert }: KPICardProps) {
  const inner = (
    <div className={`card flex items-center gap-4 ${alert && Number(value) > 0 ? "border-amber-300 bg-amber-50" : ""}`}>
      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
      {link && <ArrowRight size={16} className="flex-shrink-0 text-gray-400" />}
    </div>
  );
  return link ? <Link to={link} className="block hover:shadow-md transition-shadow rounded-xl">{inner}</Link> : inner;
}

function fmtGhs(v: string | number) {
  return `GHS ${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PIE_COLORS = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: reportsApi.getDashboard,
    refetchInterval: 30_000,
  });
  const { data: chartsData } = useQuery({
    queryKey: ["charts"],
    queryFn: reportsApi.getCharts,
    refetchInterval: 60_000,
  });

  if (isLoading) return <FullPageSpinner />;

  const kpis = data?.data;
  const charts = chartsData?.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Overview of your business</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KPICard
          title="Total Customers"
          value={kpis?.totalCustomers ?? "—"}
          icon={Users}
          color="bg-blue-500"
          link="/customers"
        />
        <KPICard
          title="Active Orders"
          value={kpis?.activeOrders ?? "—"}
          icon={ClipboardList}
          color="bg-violet-500"
          link="/orders"
        />
        <KPICard
          title="Revenue This Month"
          value={kpis ? fmtGhs(kpis.monthlyRevenueGhs) : "—"}
          icon={TrendingUp}
          color="bg-green-500"
          link="/reports"
        />
        <KPICard
          title="Low Stock Items"
          value={kpis?.lowStockCount ?? "—"}
          icon={AlertTriangle}
          color="bg-amber-500"
          link="/inventory?lowStock=true"
          alert
        />
        <KPICard
          title="Outstanding Balance"
          value={kpis ? fmtGhs(kpis.totalOutstandingGhs) : "—"}
          icon={Receipt}
          color="bg-red-500"
          link="/invoices"
          alert
        />
        <KPICard
          title="Pending Job Cards"
          value={kpis?.pendingJobCards ?? "—"}
          icon={Wrench}
          color="bg-indigo-500"
          link="/production"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Revenue trend */}
        <div className="card lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Revenue Trend (6 months)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={charts?.revenueTrend?.map((d) => ({ ...d, revenue: Number(d.revenueGhs) })) ?? []}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [`GHS ${v.toLocaleString()}`, "Revenue"]} />
              <Area type="monotone" dataKey="revenue" stroke="#7c3aed" fill="url(#rev)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Production status */}
        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Production Status</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={charts?.jobStatus ?? []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={70} label={({ status, percent }: { status: string; percent: number }) => `${status} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {(charts?.jobStatus ?? []).map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top materials + Quick actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Top Materials by Value</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={charts?.topMaterials ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="code" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v: number) => [`GHS ${v.toLocaleString()}`, "Stock Value"]} />
              <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { label: "New Quote", to: "/quotes?new=1", color: "text-violet-600" },
              { label: "New Purchase Order", to: "/purchasing?tab=po&new=1", color: "text-blue-600" },
              { label: "Record Payment", to: "/invoices", color: "text-green-600" },
              { label: "Update Exchange Rate", to: "/settings?tab=currency", color: "text-amber-600" },
            ].map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-50 ${a.color}`}
              >
                {a.label}
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
