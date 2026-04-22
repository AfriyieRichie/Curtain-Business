import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate";
import { authGuard } from "../middleware/authGuard";
import { rbacGuard } from "../middleware/rbacGuard";
import * as ctrl from "../controllers/quotes.controller";
import * as pdfCtrl from "../controllers/pdf.controller";

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
  body("items.*.widthCm").customSanitizer((v) => Number(v)).isFloat({ min: 0.01 }),
  body("items.*.dropCm").customSanitizer((v) => Number(v)).isFloat({ min: 0.01 }),
  body("items.*.quantity").customSanitizer((v) => Number(v)).isInt({ min: 1 }),
  body("items.*.fullnessRatio").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("items.*.fabricWidthCm").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  body("items.*.unitPriceGhs").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
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
  body("depositAmount").optional().customSanitizer((v) => Number(v)).isFloat({ min: 0 }),
  validate,
  ctrl.convertToOrder
);

router.get("/:id/pdf", authGuard, param("id").isUUID(), validate, pdfCtrl.quotePDF);

export default router;
