import { Router } from "express";

import {
  asignarProcesosController,
  getAreasController,
  getEquipoPorAreaController,
  getProcesosController,
  getResumenProcesosController,
  getTiposProcesoController,
} from "../controllers/procesosController";

const router = Router();

router.get("/", getProcesosController);
router.get("/resumen", getResumenProcesosController);
router.get("/tipos", getTiposProcesoController);
router.get("/areas", getAreasController);
router.get("/areas/:areaId/equipo", getEquipoPorAreaController);
router.put("/asignacion", asignarProcesosController);

export default router;
