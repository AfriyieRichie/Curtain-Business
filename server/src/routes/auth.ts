import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/auth.controller";

const router = Router();

router.post("/login",
  body("email").isEmail().normalizeEmail(),
  body("password").notEmpty(),
  validate,
  ctrl.login
);

router.post("/logout", ctrl.logout);
router.post("/refresh", ctrl.refresh);
router.get("/me", authGuard, ctrl.me);

router.post("/change-password",
  authGuard,
  body("currentPassword").notEmpty(),
  body("newPassword").isLength({ min: 8 }).withMessage("New password must be at least 8 characters"),
  validate,
  ctrl.changePassword
);

router.get("/users", authGuard, rbacGuard("ADMIN"), ctrl.listUsers);

router.post("/users",
  authGuard, rbacGuard("ADMIN"),
  body("name").trim().notEmpty(),
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 }),
  body("role").isIn(["ADMIN", "ACCOUNTS", "SALES", "WORKSHOP"]),
  validate,
  ctrl.createUser
);

router.put("/users/:id",
  authGuard, rbacGuard("ADMIN"),
  body("name").optional().trim().notEmpty(),
  body("email").optional().isEmail().normalizeEmail(),
  body("role").optional().isIn(["ADMIN", "ACCOUNTS", "SALES", "WORKSHOP"]),
  validate,
  ctrl.updateUser
);

router.put("/users/:id/deactivate", authGuard, rbacGuard("ADMIN"), ctrl.deactivateUser);

router.put("/users/:id/reset-password",
  authGuard, rbacGuard("ADMIN"),
  body("newPassword").isLength({ min: 6 }),
  validate,
  ctrl.resetPassword
);

export default router;
