import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { settingsApi, type BusinessSetting } from "@/api/settings";
import { exchangeRateApi } from "@/api/exchange-rates";
import { useRateStore } from "@/store/rate";
import { useAuthStore } from "@/store/auth";
import PageHeader from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import { formatDateTime } from "@/lib/formatters";

type Tab = "general" | "currency" | "account";

// ── General settings ──────────────────────────────────────────────────────────

const GENERAL_KEYS = ["business.name", "business.phone", "business.email", "business.address"];
const LABEL: Record<string, string> = {
  "business.name": "Business Name",
  "business.phone": "Phone",
  "business.email": "Email",
  "business.address": "Address",
  "currency.markupRatio": "Default Markup Ratio",
};

function GeneralSettings({ settings }: { settings: BusinessSetting[] }) {
  const qc = useQueryClient();
  const kvMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const [values, setValues] = useState<Record<string, string>>(kvMap);

  useEffect(() => { setValues(kvMap); }, [settings.length]);

  const { mutate, isPending } = useMutation({
    mutationFn: () => settingsApi.bulkUpsert(Object.entries(values).map(([key, value]) => ({ key, value }))),
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: () => toast.error("Failed to save settings"),
  });

  const displayedKeys = [...GENERAL_KEYS, "currency.markupRatio"];

  return (
    <div className="card max-w-lg space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Business Information</h2>
      {displayedKeys.map((key) => (
        <div key={key}>
          <label className="label">{LABEL[key] ?? key}</label>
          <input
            className="input"
            value={values[key] ?? ""}
            onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))}
          />
        </div>
      ))}
      <button onClick={() => mutate()} disabled={isPending} className="btn-primary">
        {isPending ? <Spinner size="sm" /> : "Save Settings"}
      </button>
    </div>
  );
}

// ── Currency / Exchange rate ───────────────────────────────────────────────────

function CurrencySettings() {
  const qc = useQueryClient();
  const setRate = useRateStore((s) => s.setRate);
  const [rateInput, setRateInput] = useState("");

  const { data: rateData } = useQuery({ queryKey: ["exchange-rate-current"], queryFn: exchangeRateApi.getCurrent });
  const current = rateData?.data;

  const { mutate, isPending } = useMutation({
    mutationFn: (rate: string) => exchangeRateApi.createRate(rate),
    onSuccess: (res) => {
      toast.success("Exchange rate updated. Material costs will recalculate.");
      setRate(res.data.rate, res.data.createdAt);
      setRateInput("");
      qc.invalidateQueries({ queryKey: ["exchange-rate-current"] });
    },
    onError: () => toast.error("Failed to update rate"),
  });

  return (
    <div className="card max-w-lg space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Exchange Rate</h2>
      {current && (
        <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <p className="text-gray-500">Current rate</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">1 USD = GHS {Number(current.rate).toFixed(4)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Set {formatDateTime(current.createdAt)}</p>
        </div>
      )}
      <div>
        <label className="label">New Rate (GHS per 1 USD)</label>
        <input
          className="input"
          type="number"
          step="0.0001"
          placeholder="e.g. 15.5000"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
        />
      </div>
      <button
        onClick={() => { if (rateInput) mutate(rateInput); }}
        disabled={!rateInput || isPending}
        className="btn-primary"
      >
        {isPending ? <Spinner size="sm" /> : "Update Rate"}
      </button>
    </div>
  );
}

// ── Account ───────────────────────────────────────────────────────────────────

function AccountSettings() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="card max-w-lg space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Your Account</h2>
      <dl className="text-sm space-y-2">
        <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd className="font-medium">{user?.name}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd className="font-medium">{user?.email}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Role</dt><dd className="font-medium">{user?.role}</dd></div>
      </dl>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: settingsApi.list });
  const settings = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Configure your business profile and system settings" />

      <div className="flex gap-1 border-b border-gray-200">
        {(["general", "currency", "account"] as Tab[]).map((key) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 capitalize transition-colors ${tab === key ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {key}
          </button>
        ))}
      </div>

      {isLoading ? <FullPageSpinner /> : (
        <>
          {tab === "general" && <GeneralSettings settings={settings} />}
          {tab === "currency" && <CurrencySettings />}
          {tab === "account" && <AccountSettings />}
        </>
      )}
    </div>
  );
}
