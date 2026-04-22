import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/invoices.controller";
import * as pdfCtrl from "../controllers/pdf.controller";

const router = Router();

router.get("/",
  authGuard,
  query("page").optional().isInt({ min: 1 }),
  query("customerId").optional().isUUID(),
  query("status").optional().isString(),
  validate,
  ctrl.listInvoices
);

router.get("/:id",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.getInvoice
);

router.post("/",
  authGuard, rbacGuard("ACCOUNTS"),
  body("orderId").isUUID(),
  body("dueDate").optional().isISO8601(),
  body("notes").optional().isString(),
  validate,
  ctrl.generateInvoice
);

router.patch("/:id",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  body("dueDate").optional().isISO8601(),
  body("notes").optional().isString(),
  body("status").optional().isIn(["DRAFT", "SENT", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]),
  validate,
  ctrl.updateInvoice
);

// ── Payments ──────────────────────────────────────────────────────────────────

router.get("/:id/payments",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.listPayments
);

router.post("/:id/payments",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  body("amountGhs").isDecimal({ decimal_digits: "1,2" }),
  body("method").isIn(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE"]),
  body("reference").optional().isString(),
  body("notes").optional().isString(),
  body("paidAt").optional().isISO8601(),
  validate,
  ctrl.recordPayment
);

router.get("/:id/pdf", authGuard, param("id").isUUID(), validate, pdfCtrl.invoicePDF);
router.post("/:id/email", authGuard, rbacGuard("ACCOUNTS"), param("id").isUUID(), validate, ctrl.emailInvoice);

export default router;
