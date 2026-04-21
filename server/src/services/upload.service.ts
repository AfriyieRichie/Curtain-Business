import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";
import { AppError } from "../middleware/errorHandler";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? "./uploads";

// ── Image upload (material swatches, business logo) ────────────────────────────

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dest = path.join(UPLOAD_ROOT, "images");
    ensureDir(dest);
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

function imageFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const allowed = [".jpg", ".jpeg", ".png", ".webp"];
  if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new AppError(400, "Only JPEG, PNG, or WebP images are allowed."));
  }
}

export const uploadImage = multer({
  storage: imageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB ?? "5")) * 1024 * 1024 },
});

// ── CSV upload (bulk material import) ─────────────────────────────────────────

const csvStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dest = path.join(UPLOAD_ROOT, "csv");
    ensureDir(dest);
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `import-${Date.now()}${ext}`);
  },
});

function csvFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if ([".csv", ".txt"].includes(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new AppError(400, "Only CSV files are allowed for bulk import."));
  }
}

export const uploadCSV = multer({
  storage: csvStorage,
  fileFilter: csvFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max for CSV
});
