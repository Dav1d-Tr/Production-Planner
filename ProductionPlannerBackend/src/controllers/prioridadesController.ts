import type { Request, Response } from "express";

import {
  PrioridadesError,
  asignarPrioridadOv,
  getOvsPrioridad,
  quitarPrioridadOv,
} from "../services/prioridadesService";

import {
  sincronizarPrioridadesDesdeExcel,
} from "../services/prioridadesExcelService";

// ==========================================================
// MANEJO DE ERRORES
// ==========================================================

const handleError = (
  error: unknown,
  res: Response,
  fallbackMessage: string,
): void => {
  console.error(fallbackMessage, error);

  if (error instanceof PrioridadesError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message:
      error instanceof Error
        ? error.message
        : fallbackMessage,
  });
};

// ==========================================================
// GET /api/prioridades
// Query: search, page, pageSize
// ==========================================================

export const getOvsPrioridadController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search
        : "";

    const page =
      typeof req.query.page === "string"
        ? Number(req.query.page)
        : 1;

    const pageSize =
      typeof req.query.pageSize === "string"
        ? Number(req.query.pageSize)
        : 50;

    const data = await getOvsPrioridad({
      search,
      page,
      pageSize,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleError(
      error,
      res,
      "No fue posible consultar las OVs para priorizacion.",
    );
  }
};

// ==========================================================
// POST /api/prioridades/sincronizar-excel
// ==========================================================

export const sincronizarExcelController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = await sincronizarPrioridadesDesdeExcel();

    const missingMessage =
      data.ovsNoEncontradas.length > 0
        ? ` ${data.ovsNoEncontradas.length} OV(s) del Excel aun no existen en la base interna.`
        : "";

    res.status(200).json({
      success: true,
      message:
        `${data.ovsActualizadas} OV(s) sincronizadas desde OneDrive.` +
        missingMessage,
      data,
    });
  } catch (error) {
    handleError(
      error,
      res,
      "No fue posible sincronizar las prioridades desde OneDrive.",
    );
  }
};

// ==========================================================
// PUT /api/prioridades/:numeroOv
// Body: { "prioridad": 2 }
// ==========================================================

export const asignarPrioridadController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = await asignarPrioridadOv({
      numeroOv: Number(req.params.numeroOv),
      prioridad: Number(req.body?.prioridad),
    });

    res.status(200).json({
      success: true,
      message:
        `La OV ${data.numeroOv} quedo en prioridad ${data.prioridad}.`,
      data,
    });
  } catch (error) {
    handleError(
      error,
      res,
      "No fue posible asignar la prioridad de la OV.",
    );
  }
};

// ==========================================================
// DELETE /api/prioridades/:numeroOv
// ==========================================================

export const quitarPrioridadController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = await quitarPrioridadOv(
      req.params.numeroOv,
    );

    res.status(200).json({
      success: true,
      message:
        `Se quito la prioridad de la OV ${data.numeroOv}.`,
      data,
    });
  } catch (error) {
    handleError(
      error,
      res,
      "No fue posible quitar la prioridad de la OV.",
    );
  }
};
