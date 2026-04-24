import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/orders.controller";
import * as pdfCtrl from "../controllers/pdf.controller";

const router = Router();

router.get("/",
  authGuard,
  query("page").optional().isInt({ min: 1 }),
  query("customerId").optional().isUUID(),
  query("status").optional().isString(),
  validate,
  ctrl.listOrders
);

router.get("/:id",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.getOrder
);

router.patch("/:id",
  authGuard, rbacGuard("SALES"),
  param("id").isUUID(),
  body("status").optional().isIn(["PENDING", "CONFIRMED", "IN_PRODUCTION", "COMPLETED", "DELIVERED", "CANCELLED"]),
  body("depositAmount").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("notes").optional().isString(),
  validate,
  ctrl.updateOrder
);

// ── Job Cards ─────────────────────────────────────────────────────────────────

router.post("/:id/job-cards",
  authGuard, rbacGuard("WORKSHOP"),
  param("id").isUUID(),
  body("assignedToId").optional().isUUID(),
  validate,
  ctrl.generateJobCards
);

router.patch("/:id/job-cards/:jobCardId",
  authGuard, rbacGuard("WORKSHOP"),
  param("id").isUUID(),
  param("jobCardId").isUUID(),
  body("status").optional().isIn(["PENDING", "IN_PROGRESS", "COMPLETED", "ON_HOLD"]),
  body("assignedToId").optional().isUUID(),
  body("completedAt").optional().isISO8601(),
  body("labourCostGhs").optional().isFloat({ min: 0 }),
  body("machineCostGhs").optional().isFloat({ min: 0 }),
  body("overheadCostGhs").optional().isFloat({ min: 0 }),
  validate,
  ctrl.updateJobCard
);

router.post("/:id/job-cards/:jobCardId/materials/:materialId/issue",
  authGuard, rbacGuard("WORKSHOP"),
  param("id").isUUID(),
  param("jobCardId").isUUID(),
  param("materialId").isUUID(),
  validate,
  ctrl.issueMaterial
);

router.get("/:id/job-cards/:jobCardId/pdf",
  authGuard,
  param("id").isUUID(),
  param("jobCardId").isUUID(),
  validate,
  pdfCtrl.jobCardPDF
);

export default router;
