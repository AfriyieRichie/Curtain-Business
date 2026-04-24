import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/settings.controller";

const router = Router();

router.get("/", authGuard, ctrl.listSettings);

router.get("/:key",
  authGuard,
  param("key").isString().notEmpty(),
  validate,
  ctrl.getSetting
);

router.put("/:key",
  authGuard, rbacGuard("ADMIN"),
  param("key").isString().notEmpty(),
  body("value").isString().notEmpty(),
  body("description").optional().isString(),
  validate,
  ctrl.upsertSetting
);

router.post("/bulk",
  authGuard, rbacGuard("ADMIN"),
  body().isArray({ min: 1 }),
  body("*.key").isString().notEmpty(),
  body("*.value").isString().notEmpty(),
  validate,
  ctrl.bulkUpsertSettings
);

router.post("/logo",
  authGuard, rbacGuard("ADMIN"),
  ctrl.uploadLogo,
  ctrl.uploadBusinessLogo
);

// ── Material Categories ───────────────────────────────────────────────────────

router.get("/material-categories", authGuard, ctrl.listCategories);

router.post("/material-categories",
  authGuard, rbacGuard("ADMIN"),
  body("name").isString().notEmpty(),
  body("description").optional().isString(),
  validate,
  ctrl.createCategory
);

router.patch("/material-categories/:id",
  authGuard, rbacGuard("ADMIN"),
  param("id").isString().notEmpty(),
  body("name").optional().isString().notEmpty(),
  body("description").optional().isString(),
  validate,
  ctrl.updateCategory
);

router.delete("/material-categories/:id",
  authGuard, rbacGuard("ADMIN"),
  param("id").isString().notEmpty(),
  validate,
  ctrl.deleteCategory
);

export default router;
