import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import { uploadImage, uploadCSV } from "../services/upload.service";
import * as ctrl from "../controllers/inventory.controller";

const router = Router();

// ── Categories ────────────────────────────────────────────────────────────────

router.get("/categories", authGuard, ctrl.listCategories);

router.post("/categories",
  authGuard, rbacGuard("ADMIN"),
  body("name").isString().notEmpty().withMessage("Category name is required"),
  body("description").optional().isString(),
  validate,
  ctrl.createCategory
);

// ── Materials ─────────────────────────────────────────────────────────────────

router.get("/",
  authGuard,
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 500 }),
  validate,
  ctrl.listMaterials
);

router.get("/valuation", authGuard, rbacGuard("ACCOUNTS"), ctrl.getValuation);

router.get("/low-stock-count", authGuard, ctrl.getLowStockCount);

router.get("/:id",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.getMaterial
);

router.post("/",
  authGuard, rbacGuard("ADMIN"),
  uploadImage.single("image"),
  body("code").isString().notEmpty().withMessage("Code is required"),
  body("name").isString().notEmpty().withMessage("Name is required"),
  body("categoryId").isUUID().withMessage("Valid categoryId required"),
  body("unit").isString().notEmpty(),
  body("unitCostUsd").isDecimal({ decimal_digits: "1,6" }).withMessage("Valid USD cost required"),
  body("currentStock").optional().isDecimal(),
  body("minimumStock").optional().isDecimal(),
  body("reorderQuantity").optional().isDecimal(),
  body("supplierId").optional().isUUID(),
  body("sellingPriceGhs").optional().isDecimal(),
  validate,
  ctrl.createMaterial
);

router.patch("/:id",
  authGuard, rbacGuard("ADMIN"),
  uploadImage.single("image"),
  param("id").isUUID(),
  body("name").optional().isString().notEmpty(),
  body("categoryId").optional().isUUID(),
  body("unit").optional().isString().notEmpty(),
  body("unitCostUsd").optional().isDecimal({ decimal_digits: "1,6" }),
  body("minimumStock").optional().isDecimal(),
  body("reorderQuantity").optional().isDecimal(),
  body("supplierId").optional().isUUID(),
  body("sellingPriceGhs").optional().isDecimal(),
  body("isActive").optional().isBoolean(),
  validate,
  ctrl.updateMaterial
);

router.delete("/:id",
  authGuard, rbacGuard("ADMIN"),
  param("id").isUUID(),
  validate,
  ctrl.deleteMaterial
);

// ── Bulk CSV Import ────────────────────────────────────────────────────────────

router.post("/bulk-import",
  authGuard, rbacGuard("ADMIN"),
  uploadCSV.single("file"),
  ctrl.bulkImport
);

// ── Stock Movements ────────────────────────────────────────────────────────────

router.get("/:id/movements",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.listMovements
);

router.post("/:id/adjust",
  authGuard, rbacGuard("WORKSHOP"),
  param("id").isUUID(),
  body("quantity").isNumeric().withMessage("Quantity required"),
  body("movementType").isIn(["MANUAL_ADJUSTMENT", "DAMAGE", "RETURN"]),
  body("notes").optional().isString(),
  validate,
  ctrl.adjustStockHandler
);

export default router;
