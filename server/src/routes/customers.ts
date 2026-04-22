import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/customers.controller";

const router = Router();

router.get("/", authGuard, ctrl.listCustomers);

router.get("/:id",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.getCustomer
);

router.post("/",
  authGuard, rbacGuard("SALES"),
  body("name").isString().notEmpty(),
  body("email").optional().isEmail(),
  body("phone").optional().isString(),
  body("address").optional().isString(),
  body("notes").optional().isString(),
  validate,
  ctrl.createCustomer
);

router.patch("/:id",
  authGuard, rbacGuard("SALES"),
  param("id").isUUID(),
  body("name").optional().isString().notEmpty(),
  body("email").optional().isEmail(),
  validate,
  ctrl.updateCustomer
);

router.delete("/:id",
  authGuard, rbacGuard("ADMIN"),
  param("id").isUUID(),
  validate,
  ctrl.deleteCustomer
);

// ── Windows sub-resource ──────────────────────────────────────────────────────

router.get("/:id/windows",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.listWindows
);

router.post("/:id/windows",
  authGuard, rbacGuard("SALES"),
  param("id").isUUID(),
  body("roomName").isString().notEmpty(),
  body("widthCm").customSanitizer((v) => Number(v)).isFloat({ min: 0.01 }),
  body("dropCm").customSanitizer((v) => Number(v)).isFloat({ min: 0.01 }),
  body("quantity").optional().isInt({ min: 1 }),
  body("notes").optional().isString(),
  validate,
  ctrl.createWindow
);

router.patch("/:id/windows/:windowId",
  authGuard, rbacGuard("SALES"),
  param("id").isUUID(),
  param("windowId").isUUID(),
  validate,
  ctrl.updateWindow
);

router.delete("/:id/windows/:windowId",
  authGuard, rbacGuard("SALES"),
  param("id").isUUID(),
  param("windowId").isUUID(),
  validate,
  ctrl.deleteWindow
);

export default router;
