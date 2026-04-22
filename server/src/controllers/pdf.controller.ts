import { Request, Response } from "express";
import { generateInvoicePDF, generateQuotePDF, generateJobCardPDF } from "../services/pdf.service";

function sendPDF(res: Response, buf: Buffer, filename: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buf.length);
  res.end(buf);
}

export async function invoicePDF(req: Request, res: Response) {
  const buf = await generateInvoicePDF(req.params.id);
  sendPDF(res, buf, `invoice-${req.params.id}.pdf`);
}

export async function quotePDF(req: Request, res: Response) {
  const buf = await generateQuotePDF(req.params.id);
  sendPDF(res, buf, `quote-${req.params.id}.pdf`);
}

export async function jobCardPDF(req: Request, res: Response) {
  const buf = await generateJobCardPDF(req.params.jobCardId);
  sendPDF(res, buf, `job-card-${req.params.jobCardId}.pdf`);
}
