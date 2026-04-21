type Variant = "green" | "amber" | "red" | "blue" | "gray" | "violet";

const variants: Record<Variant, string> = {
  green: "badge-green",
  amber: "badge-amber",
  red: "badge-red",
  blue: "badge-blue",
  gray: "badge-gray",
  violet: "inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20",
};

const quoteStatusMap: Record<string, Variant> = {
  DRAFT: "gray", SENT: "blue", ACCEPTED: "green", REJECTED: "red", EXPIRED: "amber",
};
const orderStatusMap: Record<string, Variant> = {
  PENDING: "amber", CONFIRMED: "blue", IN_PRODUCTION: "violet", COMPLETED: "green", DELIVERED: "green", CANCELLED: "red",
};
const invoiceStatusMap: Record<string, Variant> = {
  DRAFT: "gray", SENT: "blue", PARTIAL: "amber", PAID: "green", OVERDUE: "red", CANCELLED: "gray",
};
const poStatusMap: Record<string, Variant> = {
  DRAFT: "gray", SENT: "blue", PARTIALLY_RECEIVED: "amber", RECEIVED: "green", CANCELLED: "red",
};
const jobStatusMap: Record<string, Variant> = {
  PENDING: "amber", IN_PROGRESS: "blue", COMPLETED: "green", ON_HOLD: "red",
};

const statusMaps: Record<string, Record<string, Variant>> = {
  quote: quoteStatusMap,
  order: orderStatusMap,
  invoice: invoiceStatusMap,
  po: poStatusMap,
  job: jobStatusMap,
};

interface StatusBadgeProps {
  status: string;
  type?: keyof typeof statusMaps;
  variant?: Variant;
}

export default function StatusBadge({ status, type, variant }: StatusBadgeProps) {
  const resolved: Variant = variant ?? (type ? (statusMaps[type]?.[status] ?? "gray") : "gray");
  return <span className={variants[resolved]}>{status.replace(/_/g, " ")}</span>;
}
