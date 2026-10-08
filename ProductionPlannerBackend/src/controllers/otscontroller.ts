//otscontroller.ts

import {
  Request,
  Response,
} from "express";

import {
  getOtsFromEpicor,
} from "../services/otsservice";

// ==========================================================
// GET /api/ots
//
// Obtiene las OTs desde Epicor con:
//
// - OT
// - OV
// - Cliente
// - Proyecto
// - Parte
// - Plano
// - Estado
// - Progreso
// - Ensambles
// - Operaciones
// - Máquina
// - Área
// - Cantidades
// - Tiempos
//
// IMPORTANTE:
// getOtsFromEpicor() ya devuelve únicamente Jobs activos:
// - JobReleased = 1
// - JobClosed = 0
// - JobComplete = 0
// - ProdQty > 0
// ==========================================================

export const getOts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const pageParam =
      typeof req.query.page === "string"
        ? Number(req.query.page)
        : 1;

    const page =
      Number.isFinite(pageParam) &&
      pageParam >= 1
        ? Math.floor(pageParam)
        : 1;

    const pageSizeParam =
      typeof req.query.pageSize === "string"
        ? Number(req.query.pageSize)
        : 30;

    const pageSize =
      Number.isFinite(pageSizeParam) &&
      pageSizeParam >= 1
        ? Math.floor(pageSizeParam)
        : 30;

    const result =
      await getOtsFromEpicor({
        search,
        page,
        pageSize,
      });

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error(
      "Error obteniendo OTs desde Epicor:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "No fue posible obtener las OTs desde Epicor",
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido",
    });
  }
};
