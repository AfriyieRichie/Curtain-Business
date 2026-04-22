import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { startCronJobs } from "./services/cron.service";

// Route imports (wired up in later steps)
import authRouter from "./routes/auth";
import exchangeRateRouter from "./routes/exchange-rates";
import inventoryRouter from "./routes/inventory";
import bomRouter from "./routes/bom";
import customersRouter from "./routes/customers";
import quotesRouter from "./routes/quotes";
import ordersRouter from "./routes/orders";
import invoicesRouter from "./routes/invoices";
import purchasingRouter from "./routes/purchasing";
import reportsRouter from "./routes/reports";
import settingsRouter from "./routes/settings";

const app = express();
const PORT = process.env.PORT ?? 4000;

// ── Security & parsing ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = process.env.CLIENT_URL ?? "http://localhost:5173";
    // In development, allow any localhost port
    if (!origin || origin === allowed || (process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin))) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// ── Static file serving for uploads ──────────────────────────────────────────
app.use("/uploads", express.static(path.resolve(process.env.UPLOAD_DIR ?? "./uploads")));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/exchange-rates", exchangeRateRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/bom", bomRouter);
app.use("/api/customers", customersRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/purchasing", purchasingRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Error handlers ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.info(`Server running on http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== "test") {
    startCronJobs();
  }
});

export default app;
