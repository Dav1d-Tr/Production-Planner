//programacionController.ts

import type { Request, Response } from "express";

import {
  ProgramacionError,
  programarOt,
  programarOts,
  type ProgramarOtInput,
} from "../services/programacionService";

type DbLikeError = Error & {
  code?: string;
  detail?: string;
  constraint?: string;
};

type ProgramarLoteInput = {
  programaciones: ProgramarOtInput[];
};

const isBatchPayload = (
  value: ProgramarOtInput | ProgramarLoteInput
): value is ProgramarLoteInput => {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    "programaciones" in value
  );
};

// ==========================================================
// POST /api/programacion
//
// Compatible con:
// 1. Una sola OT (formato anterior).
// 2. Varias OTs: { programaciones: ProgramarOtInput[] }.
// ==========================================================

export const programarOtController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const payload = req.body as ProgramarOtInput | ProgramarLoteInput;

    if (isBatchPayload(payload)) {
      const result = await programarOts(payload.programaciones);

      const partial = result.exitosas > 0 && result.fallidas > 0;
      const allFailed = result.exitosas === 0;

      const statusCode = allFailed ? 400 : partial ? 207 : 201;

      res.status(statusCode).json({
        success: !allFailed,
        partial,
        message:
          result.fallidas === 0
            ? `${result.exitosas} OT(s) programada(s) correctamente.`
            : allFailed
              ? `No fue posible programar ninguna de las ${result.totalSolicitadas} OT(s).`
              : `${result.exitosas} OT(s) programada(s) y ${result.fallidas} OT(s) con error.`,
        data: result,
      });

      return;
    }

    const result = await programarOt(payload);

    res.status(201).json({
      success: true,
      message: `La OT ${result.ot} fue programada correctamente.`,
      data: result,
    });
  } catch (error) {
    console.error("Error programando OT(s):", error);

    if (error instanceof ProgramacionError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    const dbError = error as DbLikeError;
    const isProduction = process.env.NODE_ENV === "production";

    res.status(500).json({
      success: false,
      message: "No fue posible guardar la programacion de la(s) OT(s).",
      ...(!isProduction
        ? {
            error: dbError?.message ?? String(error),
            code: dbError?.code ?? null,
            detail: dbError?.detail ?? null,
            constraint: dbError?.constraint ?? null,
          }
        : {}),
    });
  }
};
