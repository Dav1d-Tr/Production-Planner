import {
  Router,
} from "express";

import {
  getControlProduccionController,
} from "../controllers/controlProduccionController";

const router = Router();

// GET /api/control-produccion
router.get(
  "/",
  getControlProduccionController,
);

export default router;
