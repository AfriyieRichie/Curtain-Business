import { Request } from "express";

/** Safely extract a string param from req.params — always returns string */
export function param(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : (v ?? "");
}

/** Safely extract a string from req.query — returns string or undefined */
export function query(req: Request, key: string): string | undefined {
  const v = req.query[key];
  if (Array.isArray(v)) return v[0] as string;
  if (typeof v === "string") return v;
  return undefined;
}
