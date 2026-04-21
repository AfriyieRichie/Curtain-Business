import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/exchange-rates.controller";

const router = Router();

router.get("/current", authGuard, ctrl.getCurrent);
router.get("/", authGuard, ctrl.listHistory);

router.post("/",
  authGuard, rbacGuard("ACCOUNTS"),
  body("rate").isDecimal({ decimal_digits: "1,6" }).withMessage("Rate must be a positive decimal"),
  validate,
  ctrl.createRate
);

export default router;
