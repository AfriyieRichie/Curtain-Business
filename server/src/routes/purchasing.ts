import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/purchasing.controller";

const router = Router();

// ── Suppliers ─────────────────────────────────────────────────────────────────

router.get("/suppliers", authGuard, ctrl.listSuppliers);

router.get("/suppliers/:id",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.getSupplier
);

router.post("/suppliers",
  authGuard, rbacGuard("ACCOUNTS"),
  body("name").isString().notEmpty(),
  body("contactPerson").optional().isString(),
  body("email").optional().isEmail(),
  body("phone").optional().isString(),
  body("preferredCurrency").optional().isIn(["USD", "EUR", "GBP", "GHS"]),
  validate,
  ctrl.createSupplier
);

router.patch("/suppliers/:id",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  body("name").optional().isString().notEmpty(),
  body("email").optional().isEmail(),
  validate,
  ctrl.updateSupplier
);

// ── Purchase Orders ───────────────────────────────────────────────────────────

router.get("/purchase-orders",
  authGuard,
  query("supplierId").optional().isUUID(),
  query("status").optional().isString(),
  validate,
  ctrl.listPOs
);

router.get("/purchase-orders/:id",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.getPO
);

router.post("/purchase-orders",
  authGuard, rbacGuard("ACCOUNTS"),
  body("supplierId").isUUID(),
  body("items").isArray({ min: 1 }),
  body("items.*.materialId").isUUID(),
  body("items.*.orderedQty").isNumeric(),
  body("items.*.unitCostUsd").isNumeric(),
  body("expectedDate").optional().isISO8601(),
  body("notes").optional().isString(),
  validate,
  ctrl.createPO
);

router.patch("/purchase-orders/:id",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  body("status").optional().isIn(["DRAFT", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]),
  body("expectedDate").optional().isISO8601(),
  body("notes").optional().isString(),
  validate,
  ctrl.updatePO
);

// ── GRNs ──────────────────────────────────────────────────────────────────────

router.get("/purchase-orders/:id/grns",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.listGRNs
);

router.post("/purchase-orders/:id/grns",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  body("items").isArray({ min: 1 }),
  body("items.*.poItemId").isUUID(),
  body("items.*.receivedQty").isNumeric(),
  body("items.*.unitCostUsd").isNumeric(),
  body("exchangeRateAtReceipt").optional().isDecimal(),
  validate,
  ctrl.createGRN
);

export default router;
