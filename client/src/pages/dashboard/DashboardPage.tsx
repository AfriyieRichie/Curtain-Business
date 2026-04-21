import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Users, ClipboardList, TrendingUp, AlertTriangle,
  Receipt, Wrench, ArrowRight,
} from "lucide-react";
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

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: reportsApi.getDashboard,
    refetchInterval: 30_000,
  });

  if (isLoading) return <FullPageSpinner />;

  const kpis = data?.data;

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">System Status</h2>
          <dl className="space-y-3">
            {[
              { label: "Low Stock Alerts", value: kpis?.lowStockCount ?? 0, warn: (kpis?.lowStockCount ?? 0) > 0 },
              { label: "Unpaid Invoices", value: kpis ? fmtGhs(kpis.totalOutstandingGhs) : "—", warn: Number(kpis?.totalOutstandingGhs ?? 0) > 0 },
              { label: "Active Production Jobs", value: kpis?.pendingJobCards ?? 0, warn: false },
            ].map((item) => (
              <div key={item.label} className="flex justify-between text-sm">
                <dt className="text-gray-500">{item.label}</dt>
                <dd className={`font-medium ${item.warn ? "text-amber-600" : "text-gray-900"}`}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
