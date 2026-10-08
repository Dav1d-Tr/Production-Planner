import { Router } from "express";

import {
  actualizarResponsablePlantaController,
  crearResponsablePlantaController,
  eliminarResponsablePlantaController,
  getResponsablesPlantaController,
} from "../controllers/responsablesPlantaController";

const router = Router();

router.get(
  "/",
  getResponsablesPlantaController,
);

router.post(
  "/",
  crearResponsablePlantaController,
);

router.put(
  "/:id",
  actualizarResponsablePlantaController,
);

router.delete(
  "/:id",
  eliminarResponsablePlantaController,
);

export default router;
