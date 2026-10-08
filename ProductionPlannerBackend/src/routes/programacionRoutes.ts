import { Router } from "express";

import { programarOtController } from "../controllers/programacionController";

const router = Router();

// POST /api/programacion
router.post("/", programarOtController);

export default router;
