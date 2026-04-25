import { apiClient } from "./client";
import type { ApiResponse, BOMTemplate, CurtainType, BOMLineRole } from "@/types";

export interface BOMCalculateRequest {
  bomTemplateId: string;
  widthCm: number;
  dropCm: number;
  fullnessRatio: number;
  fabricWidthCm: number;
  fabricMaterialId?: string;
  liningMaterialId?: string;
}

export interface BOMItemPayload { materialId: string; quantityFormula: string; role?: BOMLineRole; notes?: string; sortOrder?: number; }
export interface BOMTemplatePayload { curtainTypeId: string; name: string; description?: string; defaultFullnessRatio?: string; labourHoursFormula?: string; overheadGhs?: number; items: BOMItemPayload[]; }

export interface BOMCalculateResult {
  lines: Array<{ materialId: string; material: { code: string; name: string; unit: string }; quantity: number; lineCostGhs: string }>;
  totalMatCostGhs: string;
  labourCostGhs: string;
  overheadCostGhs: string;
}

export const bomApi = {
  getCurtainTypes: () =>
    apiClient.get<ApiResponse<CurtainType[]>>("/bom/curtain-types").then((r) => r.data),

  createCurtainType: (data: { name: string; description?: string; defaultFullnessRatio?: string }) =>
    apiClient.post<ApiResponse<CurtainType>>("/bom/curtain-types", data).then((r) => r.data),

  updateCurtainType: (id: string, data: { name?: string; description?: string; defaultFullnessRatio?: string; isActive?: boolean }) =>
    apiClient.patch<ApiResponse<CurtainType>>(`/bom/curtain-types/${id}`, data).then((r) => r.data),

  getTemplates: (curtainTypeId?: string) =>
    apiClient.get<ApiResponse<BOMTemplate[]>>("/bom/templates", {
      params: curtainTypeId ? { curtainTypeId } : undefined,
    }).then((r) => r.data),

  getTemplate: (id: string) =>
    apiClient.get<ApiResponse<BOMTemplate>>(`/bom/templates/${id}`).then((r) => r.data),

  createTemplate: (data: BOMTemplatePayload) =>
    apiClient.post<ApiResponse<BOMTemplate>>("/bom/templates", data).then((r) => r.data),

  updateTemplate: (id: string, data: Partial<BOMTemplatePayload>) =>
    apiClient.patch<ApiResponse<BOMTemplate>>(`/bom/templates/${id}`, data).then((r) => r.data),

  deleteTemplate: (id: string) =>
    apiClient.delete(`/bom/templates/${id}`).then((r) => r.data),

  calculate: (data: BOMCalculateRequest) =>
    apiClient.post<{ data: BOMCalculateResult }>(`/bom/templates/${data.bomTemplateId}/calculate`, {
      widthCm: data.widthCm,
      dropCm: data.dropCm,
      fullnessRatio: data.fullnessRatio,
      fabricWidthCm: data.fabricWidthCm,
      fabricMaterialId: data.fabricMaterialId,
      liningMaterialId: data.liningMaterialId,
    }).then((r) => r.data),
};
