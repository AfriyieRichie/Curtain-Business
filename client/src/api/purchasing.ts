import { apiClient } from "./client";
import { downloadPDF } from "./pdf";
import type { ApiResponse, PaginatedResponse, Supplier } from "@/types";

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier?: Pick<Supplier, "id" | "name" | "email" | "contactPerson">;
  status: string;
  subtotal: string;
  total: string;
  orderDate: string;
  expectedDate?: string;
  notes?: string;
  createdAt: string;
  items?: POItem[];
  grns?: GRN[];
}

export interface POItem {
  id: string;
  materialId: string;
  material?: { id: string; code: string; name: string; unit: string };
  orderedQty: string;
  receivedQty: string;
  unitCost: string;
}

export interface GRN {
  id: string;
  grnNumber: string;
  poId: string;
  receivedDate: string;
  exchangeRateAtReceipt: string;
  freightCostUsd: string;
  clearingCostGhs: string;
  otherLandedGhs: string;
  items: GRNItem[];
  createdAt: string;
}

export interface GRNItem {
  id: string;
  materialId: string;
  material?: { id: string; code: string; name: string };
  receivedQty: string;
  unitCostUsd: string;
  unitCostGhs: string;
}

export interface GRNSummary {
  id: string;
  grnNumber: string;
  receivedDate: string;
  poNumber: string;
  supplierName: string;
  totalUsd: string;
  hasPostedLCE: boolean;
  existingLCE: string | null;
}

export interface LandedCostGRNAllocation {
  id: string;
  lceId: string;
  grnId: string;
  allocatedGhs: string;
  grn: {
    grnNumber: string;
    receivedDate: string;
    po: { poNumber: string; supplier: { name: string } };
    items: Array<{ receivedQty: string; unitCostUsd: string }>;
  };
}

export interface LandedCostEntry {
  id: string;
  lceNumber: string;
  freightCostUsd: string;
  clearingCostGhs: string;
  otherLandedGhs: string;
  exchangeRate: string;
  notes?: string;
  status: "DRAFT" | "POSTED";
  postedAt?: string;
  createdAt: string;
  grns: LandedCostGRNAllocation[];
}

export const purchasingApi = {
  // Suppliers
  listSuppliers: (params?: { page?: number; limit?: number; search?: string }) =>
    apiClient.get<PaginatedResponse<Supplier>>("/purchasing/suppliers", { params }).then((r) => r.data),

  getSupplier: (id: string) =>
    apiClient.get<ApiResponse<Supplier>>(`/purchasing/suppliers/${id}`).then((r) => r.data),

  createSupplier: (data: Partial<Supplier>) =>
    apiClient.post<ApiResponse<Supplier>>("/purchasing/suppliers", data).then((r) => r.data),

  updateSupplier: (id: string, data: Partial<Supplier>) =>
    apiClient.patch<ApiResponse<Supplier>>(`/purchasing/suppliers/${id}`, data).then((r) => r.data),

  // Purchase Orders
  listPOs: (params?: { page?: number; supplierId?: string; status?: string }) =>
    apiClient.get<PaginatedResponse<PurchaseOrder>>("/purchasing/purchase-orders", { params }).then((r) => r.data),

  getPO: (id: string) =>
    apiClient.get<ApiResponse<PurchaseOrder>>(`/purchasing/purchase-orders/${id}`).then((r) => r.data),

  createPO: (data: { supplierId: string; items: Array<{ materialId: string; orderedQty: number; unitCostUsd: number }>; expectedDate?: string; notes?: string }) =>
    apiClient.post<ApiResponse<PurchaseOrder>>("/purchasing/purchase-orders", data).then((r) => r.data),

  updatePO: (id: string, data: { status?: string; expectedDate?: string; notes?: string }) =>
    apiClient.patch<ApiResponse<PurchaseOrder>>(`/purchasing/purchase-orders/${id}`, data).then((r) => r.data),

  editPO: (id: string, data: { expectedDate?: string; notes?: string; items?: Array<{ materialId: string; orderedQty: number; unitCostUsd: number }> }) =>
    apiClient.patch<ApiResponse<PurchaseOrder>>(`/purchasing/purchase-orders/${id}/edit`, data).then((r) => r.data),

  downloadPOPDF: (id: string, poNumber: string) =>
    downloadPDF(`/purchasing/purchase-orders/${id}/pdf`, `${poNumber}.pdf`),

  emailPO: (id: string) =>
    apiClient.post<ApiResponse<null>>(`/purchasing/purchase-orders/${id}/email`).then((r) => r.data),

  // GRNs
  listGRNs: (poId: string) =>
    apiClient.get<ApiResponse<GRN[]>>(`/purchasing/purchase-orders/${poId}/grns`).then((r) => r.data),

  createGRN: (poId: string, data: { items: Array<{ poItemId: string; receivedQty: number; unitCostUsd: number }>; exchangeRateAtReceipt?: string; freightCostUsd?: string; clearingCostGhs?: string; otherLandedGhs?: string }) =>
    apiClient.post<ApiResponse<{ grn: GRN }>>(`/purchasing/purchase-orders/${poId}/grns`, data).then((r) => r.data),

  downloadGRNPDF: (poId: string, grnId: string, grnNumber: string) =>
    downloadPDF(`/purchasing/purchase-orders/${poId}/grns/${grnId}/pdf`, `${grnNumber}.pdf`),

  // Landed Cost Entries
  listLCEs: (params?: { page?: number }) =>
    apiClient.get<PaginatedResponse<LandedCostEntry>>("/purchasing/landed-costs", { params }).then((r) => r.data),

  listAvailableGRNs: () =>
    apiClient.get<ApiResponse<GRNSummary[]>>("/purchasing/landed-costs/available-grns").then((r) => r.data),

  createLCE: (data: { freightCostUsd?: number; clearingCostGhs?: number; otherLandedGhs?: number; exchangeRate?: string; notes?: string; grnIds: string[] }) =>
    apiClient.post<ApiResponse<LandedCostEntry>>("/purchasing/landed-costs", data).then((r) => r.data),

  getLCE: (id: string) =>
    apiClient.get<ApiResponse<LandedCostEntry>>(`/purchasing/landed-costs/${id}`).then((r) => r.data),

  updateLCE: (id: string, data: { freightCostUsd?: number; clearingCostGhs?: number; otherLandedGhs?: number; exchangeRate?: string; notes?: string; grnIds?: string[] }) =>
    apiClient.patch<ApiResponse<LandedCostEntry>>(`/purchasing/landed-costs/${id}`, data).then((r) => r.data),

  postLCE: (id: string) =>
    apiClient.post<ApiResponse<LandedCostEntry>>(`/purchasing/landed-costs/${id}/post`).then((r) => r.data),
};
