import { apiClient } from "./client";
import type { ApiResponse, Expense, ExpenseCategory, ExpenseType, OverheadSummary } from "@/types";

export const expensesApi = {
  // Categories
  getCategories: () =>
    apiClient.get<ApiResponse<ExpenseCategory[]>>("/expenses/categories").then((r) => r.data),

  createCategory: (data: { name: string; type: ExpenseType }) =>
    apiClient.post<ApiResponse<ExpenseCategory>>("/expenses/categories", data).then((r) => r.data),

  updateCategory: (id: string, data: { name?: string; type?: ExpenseType }) =>
    apiClient.put<ApiResponse<ExpenseCategory>>(`/expenses/categories/${id}`, data).then((r) => r.data),

  deleteCategory: (id: string) =>
    apiClient.delete(`/expenses/categories/${id}`).then((r) => r.data),

  // Expenses
  getExpenses: (params?: { from?: string; to?: string; type?: ExpenseType; categoryId?: string }) =>
    apiClient.get<ApiResponse<Expense[]>>("/expenses", { params }).then((r) => r.data),

  createExpense: (data: {
    date: string;
    description: string;
    amountGhs: string;
    type: ExpenseType;
    categoryId?: string | null;
    notes?: string;
  }) => apiClient.post<ApiResponse<Expense>>("/expenses", data).then((r) => r.data),

  updateExpense: (id: string, data: Partial<{
    date: string;
    description: string;
    amountGhs: string;
    type: ExpenseType;
    categoryId: string | null;
    notes: string;
  }>) => apiClient.put<ApiResponse<Expense>>(`/expenses/${id}`, data).then((r) => r.data),

  deleteExpense: (id: string) =>
    apiClient.delete(`/expenses/${id}`).then((r) => r.data),

  // Overhead Analysis
  getOverheadSummary: (params: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<OverheadSummary>>("/expenses/overhead-summary", { params }).then((r) => r.data),

  applyOverheadRate: (data: { overheadRate: string; capacityHours?: string }) =>
    apiClient.post<ApiResponse<{ applied: boolean; overheadRateGhs: string }>>("/expenses/apply-overhead-rate", data).then((r) => r.data),
};
