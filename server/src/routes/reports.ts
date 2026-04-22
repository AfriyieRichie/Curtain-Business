import { Router } from "express";
import { query } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/reports.controller";

const router = Router();

router.get("/dashboard", authGuard, ctrl.getDashboard);
router.get("/charts", authGuard, ctrl.getChartData);

router.get("/sales",
  authGuard, rbacGuard("ACCOUNTS"),
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
  validate,
  ctrl.getSalesReport
);

router.get("/profitability",
  authGuard, rbacGuard("ACCOUNTS"),
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
  validate,
  ctrl.getProfitabilityReport
);

router.get("/inventory",
  authGuard, rbacGuard("ACCOUNTS"),
  ctrl.getInventoryReport
);

router.get("/stock-movements",
  authGuard,
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
  query("materialId").optional().isUUID(),
  query("movementType").optional().isString(),
  validate,
  ctrl.getStockMovementsReport
);

router.get("/purchases",
  authGuard, rbacGuard("ACCOUNTS"),
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
  query("supplierId").optional().isUUID(),
  validate,
  ctrl.getPurchasesReport
);

router.get("/aged-debtors",
  authGuard, rbacGuard("ACCOUNTS"),
  ctrl.getAgedDebtors
);

export default router;
