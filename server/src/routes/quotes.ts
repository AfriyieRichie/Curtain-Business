import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/quotes.controller";

const router = Router();

router.get("/",
  authGuard,
  query("page").optional().isInt({ min: 1 }),
  query("customerId").optional().isUUID(),
  query("status").optional().isString(),
  validate,
  ctrl.listQuotes
);

router.get("/:id",
  authGuard,
  param("id").isUUID(),
  validate,
  ctrl.getQuote
);

router.post("/",
  authGuard, rbacGuard("SALES"),
  body("customerId").isUUID(),
  body("items").isArray({ min: 1 }),
  body("items.*.curtainTypeId").isUUID(),
  body("items.*.bomTemplateId").isUUID(),
  body("items.*.widthCm").isNumeric(),
  body("items.*.dropCm").isNumeric(),
  body("items.*.quantity").isInt({ min: 1 }),
  body("items.*.fullnessRatio").optional().isNumeric(),
  body("items.*.fabricWidthCm").optional().isNumeric(),
  body("items.*.unitPriceGhs").optional().isDecimal(),
  body("validUntil").optional().isISO8601(),
  body("notes").optional().isString(),
  validate,
  ctrl.createQuote
);

router.patch("/:id",
  authGuard, rbacGuard("SALES"),
  param("id").isUUID(),
  body("status").optional().isIn(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]),
  body("validUntil").optional().isISO8601(),
  body("notes").optional().isString(),
  validate,
  ctrl.updateQuote
);

router.post("/:id/convert",
  authGuard, rbacGuard("SALES"),
  param("id").isUUID(),
  body("depositAmount").optional().isDecimal(),
  validate,
  ctrl.convertToOrder
);

export default router;
