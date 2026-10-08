import {
  NextFunction,
  Request,
  Response,
} from "express";
import { ApiError } from "../utils/ApiError";

export function notFound(
  req: Request,
  res: Response
) {
  res.status(404).json({
    success: false,
    message:
      `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(error);

  if (
    error instanceof ApiError
  ) {
    res
      .status(error.statusCode)
      .json({
        success: false,
        message: error.message,
        details:
          error.details ?? null,
      });

    return;
  }

  const message =
    error instanceof Error
      ? error.message
      : "Error interno del servidor";

  res.status(500).json({
    success: false,
    message,
  });
}
