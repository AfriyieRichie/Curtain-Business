import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/bom.controller";

const router = Router();

// ── Curtain Types ─────────────────────────────────────────────────────────────

router.get("/curtain-types", authGuard, ctrl.listCurtainTypes);

router.get("/curtain-types/:id",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.getCurtainType
);

router.post("/curtain-types",
  authGuard, rbacGuard("ADMIN"),
  body("name").isString().notEmpty(),
  body("description").optional().isString(),
  body("defaultFullnessRatio").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  validate,
  ctrl.createCurtainType
);

router.patch("/curtain-types/:id",
  authGuard, rbacGuard("ADMIN"),
  param("id").isUUID(),
  body("name").optional().isString().notEmpty(),
  body("defaultFullnessRatio").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("isActive").optional().isBoolean(),
  validate,
  ctrl.updateCurtainType
);

// ── BOM Templates ─────────────────────────────────────────────────────────────

router.get("/templates",
  authGuard,
  query("curtainTypeId").optional().isUUID(),
  validate,
  ctrl.listTemplates
);

router.get("/templates/:id",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.getTemplate
);

router.post("/templates",
  authGuard, rbacGuard("ADMIN"),
  body("curtainTypeId").isUUID(),
  body("name").isString().notEmpty(),
  body("labourHoursFormula").optional().isString(),
  body("items").isArray({ min: 1 }),
  body("items.*.materialId").isUUID(),
  body("items.*.quantityFormula").isString().notEmpty(),
  body("items.*.role").optional().isIn(["FIXED", "FABRIC", "LINING"]),
  body("items.*.notes").optional().isString(),
  validate,
  ctrl.createTemplate
);

router.patch("/templates/:id",
  authGuard, rbacGuard("ADMIN"),
  param("id").isUUID(),
  body("name").optional().isString().notEmpty(),
  body("labourHoursFormula").optional().isString(),
  body("items").optional().isArray({ min: 1 }),
  body("items.*.materialId").optional().isUUID(),
  body("items.*.quantityFormula").optional().isString().notEmpty(),
  body("items.*.role").optional().isIn(["FIXED", "FABRIC", "LINING"]),
  validate,
  ctrl.updateTemplate
);

router.delete("/templates/:id",
  authGuard, rbacGuard("ADMIN"),
  param("id").isUUID(),
  validate,
  ctrl.deleteTemplate
);

// ── BOM Calculation ───────────────────────────────────────────────────────────

router.post("/templates/:id/calculate",
  authGuard,
  param("id").isUUID(),
  body("widthCm").customSanitizer((v) => Number(v)).isFloat({ min: 0.01 }),
  body("dropCm").customSanitizer((v) => Number(v)).isFloat({ min: 0.01 }),
  body("fullnessRatio").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("fabricWidthCm").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("fabricMaterialId").optional().isUUID(),
  body("liningMaterialId").optional().isUUID(),
  validate,
  ctrl.calculateBOMForTemplate
);

export default router;
