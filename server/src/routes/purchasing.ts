import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/purchasing.controller";
import * as lceCtrl from "../controllers/landedCosts.controller";

const router = Router();

// ── Suppliers ─────────────────────────────────────────────────────────────────

router.get("/suppliers", authGuard, ctrl.listSuppliers);

router.get("/suppliers/:id",
  authGuard,
  param("id").isString().notEmpty(),
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
  param("id").isString().notEmpty(),
  body("name").optional().isString().notEmpty(),
  body("email").optional().isEmail(),
  validate,
  ctrl.updateSupplier
);

// ── Purchase Orders ───────────────────────────────────────────────────────────

router.get("/purchase-orders",
  authGuard,
  query("supplierId").optional().isString().notEmpty(),
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
  body("supplierId").isString().notEmpty(),
  body("items").isArray({ min: 1 }),
  body("items.*.materialId").isString().notEmpty(),
  body("items.*.orderedQty").customSanitizer((v) => Number(v)).isFloat({ min: 0.0001 }).withMessage("Qty must be greater than 0"),
  body("items.*.unitCostUsd").customSanitizer((v) => Number(v)).isFloat({ min: 0 }).withMessage("Cost must be 0 or more"),
  body("expectedDate").optional({ values: "falsy" }).isISO8601(),
  body("notes").optional().isString(),
  body("freightCostUsd").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("clearingCostGhs").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("otherLandedGhs").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
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

router.patch("/purchase-orders/:id/edit",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  body("items").optional().isArray({ min: 1 }),
  body("items.*.materialId").optional().isString().notEmpty(),
  body("items.*.orderedQty").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0.0001 }),
  body("items.*.unitCostUsd").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("expectedDate").optional({ values: "falsy" }).isISO8601(),
  body("notes").optional().isString(),
  body("freightCostUsd").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("clearingCostGhs").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("otherLandedGhs").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  validate,
  ctrl.editPO
);

router.get("/purchase-orders/:id/pdf",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.downloadPOPDF
);

router.post("/purchase-orders/:id/submit-approval",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  validate,
  ctrl.submitPOForApproval
);

router.post("/purchase-orders/:id/email",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  validate,
  ctrl.emailPO
);

// ── GRNs ──────────────────────────────────────────────────────────────────────

router.get("/purchase-orders/:id/grns",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.listGRNs
);

router.get("/purchase-orders/:id/grns/:grnId/pdf",
  authGuard,
  param("id").isUUID(),
  param("grnId").isUUID(),
  validate,
  ctrl.downloadGRNPDF
);

router.post("/purchase-orders/:id/grns",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  body("items").isArray({ min: 1 }),
  body("items.*.poItemId").isUUID(),
  body("items.*.receivedQty").customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("items.*.unitCostUsd").customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("exchangeRateAtReceipt").optional().isDecimal(),
  body("freightCostUsd").optional().isFloat({ min: 0 }),
  body("clearingCostGhs").optional().isFloat({ min: 0 }),
  body("otherLandedGhs").optional().isFloat({ min: 0 }),
  validate,
  ctrl.createGRN
);

// ── Landed Cost Entries ───────────────────────────────────────────────────────

router.get("/landed-costs",
  authGuard, rbacGuard("ACCOUNTS"),
  lceCtrl.listLCEs
);

router.get("/landed-costs/available-grns",
  authGuard, rbacGuard("ACCOUNTS"),
  lceCtrl.listAvailableGRNs
);

router.post("/landed-costs",
  authGuard, rbacGuard("ACCOUNTS"),
  body("grnIds").isArray({ min: 1 }),
  body("grnIds.*").isUUID(),
  body("freightCostUsd").optional().isFloat({ min: 0 }),
  body("clearingCostGhs").optional().isFloat({ min: 0 }),
  body("otherLandedGhs").optional().isFloat({ min: 0 }),
  body("exchangeRate").optional().isDecimal(),
  validate,
  lceCtrl.createLCE
);

router.get("/landed-costs/:id",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  validate,
  lceCtrl.getLCE
);

router.patch("/landed-costs/:id",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  body("freightCostUsd").optional().isFloat({ min: 0 }),
  body("clearingCostGhs").optional().isFloat({ min: 0 }),
  body("otherLandedGhs").optional().isFloat({ min: 0 }),
  body("exchangeRate").optional().isDecimal(),
  body("grnIds").optional().isArray(),
  body("grnIds.*").optional().isUUID(),
  validate,
  lceCtrl.updateLCE
);

router.post("/landed-costs/:id/post",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  validate,
  lceCtrl.postLCE
);

export default router;
