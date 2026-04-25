import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Package, FileText, Users, ShoppingCart,
  ClipboardList, Wrench, Receipt, Truck, BarChart3, Settings,
  Pencil, Wallet,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { exchangeRateApi } from "@/api/exchange-rates";
import { formatDate } from "@/lib/formatters";
import { useRateStore } from "@/store/rate";
import { useAuthStore, type UserRole } from "@/store/auth";
import { useEffect } from "react";

type NavItem = { to: string; icon: React.ElementType; label: string; roles: UserRole[] };

const ALL: UserRole[] = ["ADMIN", "ACCOUNTS", "SALES", "WORKSHOP"];
const ADMIN_ACCOUNTS: UserRole[] = ["ADMIN", "ACCOUNTS"];
const ADMIN_SALES: UserRole[] = ["ADMIN", "ACCOUNTS", "SALES"];

const navItems: NavItem[] = [
  { to: "/dashboard",   icon: LayoutDashboard, label: "Dashboard",     roles: ALL },
  { to: "/inventory",   icon: Package,         label: "Inventory",     roles: ["ADMIN", "ACCOUNTS", "WORKSHOP"] },
  { to: "/bom",         icon: FileText,        label: "BOM Templates", roles: ["ADMIN"] },
  { to: "/customers",   icon: Users,           label: "Customers",     roles: ADMIN_SALES },
  { to: "/quotes",      icon: ShoppingCart,    label: "Quotes",        roles: ADMIN_SALES },
  { to: "/orders",      icon: ClipboardList,   label: "Orders",        roles: ALL },
  { to: "/production",  icon: Wrench,          label: "Production",    roles: ["ADMIN", "WORKSHOP"] },
  { to: "/invoices",    icon: Receipt,         label: "Invoices",      roles: ADMIN_ACCOUNTS },
  { to: "/purchasing",  icon: Truck,           label: "Purchasing",    roles: ADMIN_ACCOUNTS },
  { to: "/reports",     icon: BarChart3,       label: "Reports",       roles: ADMIN_ACCOUNTS },
  { to: "/expenses",    icon: Wallet,          label: "Expenses",      roles: ADMIN_ACCOUNTS },
  { to: "/settings",    icon: Settings,        label: "Settings",      roles: ["ADMIN"] },
];

export default function Sidebar() {
  const role = useAuthStore((s) => s.user?.role);
  const setRate = useRateStore((s) => s.setRate);

  const { data } = useQuery({
    queryKey: ["exchange-rate-current"],
    queryFn: () => exchangeRateApi.getCurrent(),
    refetchInterval: 1000 * 60 * 10, // re-check every 10 min
  });

  useEffect(() => {
    if (data?.data) {
      setRate(data.data.rate, data.data.createdAt);
    }
  }, [data, setRate]);

  const rate = useRateStore((s) => s.rate);
  const updatedAt = useRateStore((s) => s.updatedAt);

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white font-bold text-sm">C</div>
        <span className="font-semibold text-gray-900">Curtains ERP</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {navItems.filter((item) => !role || item.roles.includes(role)).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-violet-50 text-violet-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* FX Rate Widget */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
          <div>
            <p className="text-xs font-medium text-gray-500">Exchange Rate</p>
            <p className="text-sm font-semibold text-gray-900">
              1 USD = GHS {rate ? Number(rate).toFixed(2) : "—"}
            </p>
            {updatedAt && (
              <p className="text-xs text-gray-400">Updated {formatDate(updatedAt)}</p>
            )}
          </div>
          {role === "ADMIN" && (
            <NavLink
              to="/settings/currency"
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
              title="Update exchange rate"
            >
              <Pencil size={14} />
            </NavLink>
          )}
        </div>
      </div>
    </aside>
  );
}
