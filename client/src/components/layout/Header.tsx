import { LogOut, User } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { authApi } from "@/api/auth";
import toast from "react-hot-toast";

export default function Header() {
  const { user, clearAuth } = useAuthStore();

  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      clearAuth();
      window.location.href = "/login";
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <User size={16} />
          </div>
          <div>
            <p className="font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role.toLowerCase()}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </header>
  );
}
