import { Router } from "express";

import {
  asignarPrioridadController,
  getOvsPrioridadController,
  quitarPrioridadController,
  sincronizarExcelController,
} from "../controllers/prioridadesController";

const router = Router();

router.get("/", getOvsPrioridadController);
router.post("/sincronizar-excel", sincronizarExcelController);
router.put("/:numeroOv", asignarPrioridadController);
router.delete("/:numeroOv", quitarPrioridadController);

export default router;
