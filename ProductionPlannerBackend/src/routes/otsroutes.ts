import { Router } from "express";

import { getOts } from "../controllers/otscontroller";

const router = Router();

// ==========================================================
// GET /api/ots
//
// Trae las OTs desde Epicor con:
//
// - OT
// - OV
// - Cliente
// - Proyecto
// - Parte
// - Plano
// - Estado Epicor
// - Cantidad
// - Progreso
// - Ensambles
// - Operaciones
// - Máquina
// - Área
// - Cantidades producidas
// - Tiempos
// ==========================================================

router.get("/", getOts);

export default router;