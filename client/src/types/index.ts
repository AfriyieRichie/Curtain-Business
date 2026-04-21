// ── Shared domain types ───────────────────────────────────────────────────────
// These mirror the Prisma schema and are used across all pages/hooks/api layers.

export type Currency = "USD" | "GHS";
export type UserRole = "ADMIN" | "ACCOUNTS" | "SALES" | "WORKSHOP";
export type UnitOfMeasure = "METER" | "PIECE" | "ROLL" | "PACK" | "SET";
export type MovementType = "PURCHASE" | "PRODUCTION_ISSUE" | "MANUAL_ADJUSTMENT" | "DAMAGE" | "RETURN";
export type POStatus = "DRAFT" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
export type OrderStatus = "PENDING" | "CONFIRMED" | "IN_PRODUCTION" | "COMPLETED" | "DELIVERED" | "CANCELLED";
export type ProductionStatus = "PENDING" | "CUTTING" | "SEWING" | "COMPLETED";
export type JobStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "PARTIAL" | "OVERDUE" | "CANCELLED";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CHEQUE" | "OTHER";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface ExchangeRate {
  id: string;
  rate: string;
  effectiveDate: string;
  source: "MANUAL" | "AUTO";
  createdBy: Pick<User, "id" | "name">;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  currency: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  description?: string;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  description?: string;
  categoryId: string;
  category?: MaterialCategory;
  unit: UnitOfMeasure;
  unitCostUsd: string;
  unitCostGhs: string;
  exchangeRateUsed: string;
  sellingPriceGhs: string;
  purchaseCurrency: Currency;
  currentStock: string;
  minimumStock: string;
  reorderQuantity: string;
  supplierId?: string;
  supplier?: Pick<Supplier, "id" | "name">;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  materialId: string;
  material?: Pick<Material, "id" | "code" | "name">;
  movementType: MovementType;
  quantity: string;
  unitCostUsd: string;
  unitCostGhs: string;
  exchangeRateAtMovement: string;
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  createdBy: Pick<User, "id" | "name">;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  totalSpentGhs: string;
  createdAt: string;
  windows?: CustomerWindow[];
}

export interface CustomerWindow {
  id: string;
  customerId: string;
  roomName: string;
  widthCm: number;
  dropCm: number;
  quantity: number;
  notes?: string;
}

export interface CurtainType {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface BOMTemplateItem {
  id: string;
  bomTemplateId: string;
  materialId: string;
  material?: Pick<Material, "id" | "code" | "name" | "unit" | "unitCostUsd" | "unitCostGhs">;
  quantityFormula: string;
  notes?: string;
  sortOrder: number;
}

export interface BOMTemplate {
  id: string;
  curtainTypeId: string;
  curtainType?: Pick<CurtainType, "id" | "name">;
  name: string;
  description?: string;
  defaultFullnessRatio: string;
  isActive: boolean;
  createdAt: string;
  items?: BOMTemplateItem[];
}

export interface BOMLineSnapshot {
  materialId: string;
  materialCode: string;
  description: string;
  formula: string;
  quantity: string;
  unit: string;
  unitCostUsd: string;
  unitCostGhs: string;
  lineTotalUsd: string;
  lineTotalGhs: string;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  customerId: string;
  customer?: Pick<Customer, "id" | "name" | "phone" | "email">;
  status: QuoteStatus;
  validUntil?: string;
  notes?: string;
  exchangeRateSnapshot: string;
  materialCostUsd: string;
  materialCostGhs: string;
  subtotalGhs: string;
  discountAmountGhs: string;
  taxRate: string;
  taxAmountGhs: string;
  totalGhs: string;
  createdBy?: Pick<User, "id" | "name">;
  createdAt: string;
  updatedAt: string;
  items?: QuoteItem[];
}

export interface QuoteItem {
  id: string;
  quoteId: string;
  curtainTypeId: string;
  curtainType?: Pick<CurtainType, "id" | "name">;
  bomTemplateId: string;
  windowLabel: string;
  widthCm: string;
  dropCm: string;
  fullnessRatio: string;
  fabricMaterialId: string;
  fabricMaterial?: Pick<Material, "id" | "code" | "name">;
  liningMaterialId?: string;
  liningMaterial?: Pick<Material, "id" | "code" | "name">;
  description?: string;
  quantity: string;
  unitPriceGhs: string;
  lineTotalGhs: string;
  lineCostUsd: string;
  lineCostGhs: string;
  bomSnapshot: BOMLineSnapshot[];
  exchangeRateAtQuote: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  quoteId?: string;
  customerId: string;
  customer?: Pick<Customer, "id" | "name" | "phone">;
  status: OrderStatus;
  exchangeRateSnapshot: string;
  materialCostUsd: string;
  materialCostGhs: string;
  subtotalGhs: string;
  discountAmountGhs: string;
  taxAmountGhs: string;
  totalGhs: string;
  depositAmountGhs: string;
  balanceDueGhs: string;
  deliveryDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  curtainTypeId: string;
  curtainType?: Pick<CurtainType, "id" | "name">;
  bomTemplateId: string;
  windowLabel: string;
  widthCm: string;
  dropCm: string;
  fullnessRatio: string;
  fabricMaterialId: string;
  liningMaterialId?: string;
  description?: string;
  quantity: string;
  unitPriceGhs: string;
  lineTotalGhs: string;
  lineCostUsd: string;
  lineCostGhs: string;
  bomSnapshot: BOMLineSnapshot[];
  productionStatus: ProductionStatus;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  customerId: string;
  customer?: Pick<Customer, "id" | "name" | "phone" | "email" | "address">;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  exchangeRateSnapshot: string;
  materialCostUsd: string;
  subtotalGhs: string;
  discountAmountGhs: string;
  taxRate: string;
  taxAmountGhs: string;
  totalGhs: string;
  amountPaid: string;
  balanceDue: string;
  notes?: string;
  createdAt: string;
  items?: InvoiceItem[];
  payments?: Payment[];
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  materialId?: string;
  materialCode?: string;
  quantity: string;
  unit: string;
  unitPriceGhs: string;
  lineTotalGhs: string;
  unitCostUsd: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amountGhs: string;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference?: string;
  notes?: string;
  recordedBy?: Pick<User, "id" | "name">;
  createdAt: string;
}

// ── API response wrappers ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  message: string;
  errors?: { field: string; message: string }[];
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
