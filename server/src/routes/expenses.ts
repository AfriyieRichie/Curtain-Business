import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/expenses.controller";

const router = Router();

// ── Categories ────────────────────────────────────────────────────────────────

router.get("/categories", authGuard, ctrl.listCategories);

router.post("/categories",
  authGuard, rbacGuard("ADMIN"),
  body("name").isString().notEmpty(),
  body("type").optional().isIn(["ADMIN", "FACTORY", "SHARED"]),
  validate,
  ctrl.createCategory
);

router.put("/categories/:id",
  authGuard, rbacGuard("ADMIN"),
  param("id").isUUID(),
  body("name").optional().isString().notEmpty(),
  body("type").optional().isIn(["ADMIN", "FACTORY", "SHARED"]),
  validate,
  ctrl.updateCategory
);

router.delete("/categories/:id",
  authGuard, rbacGuard("ADMIN"),
  param("id").isUUID(),
  validate,
  ctrl.deleteCategory
);

// ── Overhead Analysis ─────────────────────────────────────────────────────────

router.get("/overhead-summary", authGuard, ctrl.getOverheadSummary);

router.post("/apply-overhead-rate",
  authGuard, rbacGuard("ADMIN"),
  body("overheadRate").isNumeric(),
  body("capacityHours").optional().isNumeric(),
  validate,
  ctrl.applyOverheadRate
);

// ── Expenses CRUD ─────────────────────────────────────────────────────────────

router.get("/", authGuard, ctrl.listExpenses);

router.post("/",
  authGuard,
  body("date").isISO8601(),
  body("description").isString().notEmpty(),
  body("amountGhs").isNumeric(),
  body("type").isIn(["ADMIN", "FACTORY", "SHARED"]),
  body("categoryId").optional({ nullable: true }).isUUID(),
  body("notes").optional().isString(),
  validate,
  ctrl.createExpense
);

router.put("/:id",
  authGuard,
  param("id").isUUID(),
  body("date").optional().isISO8601(),
  body("description").optional().isString().notEmpty(),
  body("amountGhs").optional().isNumeric(),
  body("type").optional().isIn(["ADMIN", "FACTORY", "SHARED"]),
  body("categoryId").optional({ nullable: true }).isUUID(),
  body("notes").optional().isString(),
  validate,
  ctrl.updateExpense
);

router.delete("/:id",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.deleteExpense
);

export default router;
