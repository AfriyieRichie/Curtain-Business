import { apiClient } from "./client";

async function downloadPDF(url: string, filename: string) {
  const res = await apiClient.get(url, { responseType: "blob" });
  const blob = new Blob([res.data as BlobPart], { type: "application/pdf" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export const pdfApi = {
  downloadInvoice: (id: string) => downloadPDF(`/invoices/${id}/pdf`, `invoice-${id}.pdf`),
  downloadQuote: (id: string) => downloadPDF(`/quotes/${id}/pdf`, `quote-${id}.pdf`),
  downloadJobCard: (orderId: string, jobCardId: string) =>
    downloadPDF(`/orders/${orderId}/job-cards/${jobCardId}/pdf`, `job-card-${jobCardId}.pdf`),
};
