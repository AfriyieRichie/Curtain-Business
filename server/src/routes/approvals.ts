import { Router } from "express";
import { param, body } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/approvals.controller";

const router = Router();

router.get("/pending-count", authGuard, ctrl.getPendingCount);

router.get("/",
  authGuard, rbacGuard("ACCOUNTS"),
  ctrl.listApprovals
);

router.get("/:id",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  validate,
  ctrl.getApproval
);

router.post("/:id/approve",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  body("note").optional().isString(),
  validate,
  ctrl.approveRequest
);

router.post("/:id/reject",
  authGuard, rbacGuard("ACCOUNTS"),
  param("id").isUUID(),
  body("note").isString().notEmpty().withMessage("A reason is required when rejecting."),
  validate,
  ctrl.rejectRequest
);

export default router;
