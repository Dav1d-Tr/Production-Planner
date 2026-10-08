// controlProduccionController.ts

import type {
  Request,
  Response,
} from "express";

import {
  getControlProduccion,
} from "../services/controlProduccionService";

// ==========================================================
// GET /api/control-produccion
//
// Antes de devolver la matriz:
// 1. El service consulta el ciclo de vida actual de cada OT administrada.
// 2. Solo hace sincronizacion detallada si:
//    - JobReleased = 1
//    - JobClosed = 0
//    - JobComplete = 0
//    - ProdQty > 0
// 3. Los Jobs que ya no cumplen dejan de generar falsos errores
//    de "OT no encontrada".
// 4. La prioridad NO se toma de ots.prioridad. Se obtiene desde
//    public.prioridades_ov mediante las OVs asociadas a la OT.
// 5. El service devuelve prioridad efectiva, posicion operativa
//    por area + tipo de proceso y tiempo restante proporcional.
// ==========================================================

export const getControlProduccionController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await getControlProduccion();

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "Error consultando control de produccion:",
      error,
    );

    res.status(500).json({
      success: false,
      message:
        "No fue posible consultar el control de produccion.",
      ...(process.env.NODE_ENV !== "production" && {
        detail:
          error instanceof Error
            ? error.message
            : String(error),
      }),
    });
  }
};
