import { apiClient } from "./client";
import type { ApiResponse, BOMTemplate, CurtainType } from "@/types";

export interface BOMCalculateRequest {
  bomTemplateId: string;
  widthCm: number;
  dropCm: number;
  fullnessRatio: number;
  fabricWidthCm: number;
}

export const bomApi = {
  getCurtainTypes: () =>
    apiClient.get<ApiResponse<CurtainType[]>>("/bom/curtain-types").then((r) => r.data),

  getTemplates: (curtainTypeId?: string) =>
    apiClient.get<ApiResponse<BOMTemplate[]>>("/bom/templates", {
      params: curtainTypeId ? { curtainTypeId } : undefined,
    }).then((r) => r.data),

  getTemplate: (id: string) =>
    apiClient.get<ApiResponse<BOMTemplate>>(`/bom/templates/${id}`).then((r) => r.data),

  createTemplate: (data: Partial<BOMTemplate>) =>
    apiClient.post<ApiResponse<BOMTemplate>>("/bom/templates", data).then((r) => r.data),

  updateTemplate: (id: string, data: Partial<BOMTemplate>) =>
    apiClient.put<ApiResponse<BOMTemplate>>(`/bom/templates/${id}`, data).then((r) => r.data),

  calculate: (data: BOMCalculateRequest) =>
    apiClient.post(`/bom/templates/${data.bomTemplateId}/calculate`, {
      widthCm: data.widthCm,
      dropCm: data.dropCm,
      fullnessRatio: data.fullnessRatio,
      fabricWidthCm: data.fabricWidthCm,
    }).then((r) => r.data),
};
