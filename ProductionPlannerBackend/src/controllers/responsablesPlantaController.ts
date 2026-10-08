import type { Request, Response } from "express";

import {
  ResponsablesPlantaError,
  actualizarResponsablePlanta,
  crearResponsablePlanta,
  eliminarResponsablePlanta,
  getResponsablesPlanta,
} from "../services/responsablesPlantaService";

// ==========================================================
// HELPERS
// ==========================================================

/**
 * Express puede tipar un parametro de ruta como:
 * string | string[] | undefined.
 *
 * Este helper garantiza que el service reciba un unico string valido.
 */
const getSingleRouteParam = (
  value: string | string[] | undefined,
  fieldName: string,
): string => {
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new ResponsablesPlantaError(
        `El parametro ${fieldName} no es valido.`,
      );
    }

    const firstValue = value[0]?.trim();

    if (!firstValue) {
      throw new ResponsablesPlantaError(
        `El parametro ${fieldName} es obligatorio.`,
      );
    }

    return firstValue;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new ResponsablesPlantaError(
      `El parametro ${fieldName} es obligatorio.`,
    );
  }

  return value.trim();
};

// ==========================================================
// ERROR CENTRALIZADO
// ==========================================================

const handleError = (
  error: unknown,
  res: Response,
  fallbackMessage: string,
): void => {
  console.error(fallbackMessage, error);

  if (error instanceof ResponsablesPlantaError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? fallbackMessage
        : error instanceof Error
          ? error.message
          : fallbackMessage,
  });
};

// ==========================================================
// GET /api/responsables-planta?search=
// ==========================================================

export const getResponsablesPlantaController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search
        : "";

    const data = await getResponsablesPlanta(search);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleError(
      error,
      res,
      "No fue posible consultar los miembros de planta.",
    );
  }
};

// ==========================================================
// POST /api/responsables-planta
// Body: { "nombre": "Nombre completo" }
// ==========================================================

export const crearResponsablePlantaController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = await crearResponsablePlanta({
      nombre: req.body?.nombre,
    });

    res.status(201).json({
      success: true,
      message: `Se agrego a ${data.nombre} como miembro de planta.`,
      data,
    });
  } catch (error) {
    handleError(
      error,
      res,
      "No fue posible crear el miembro de planta.",
    );
  }
};

// ==========================================================
// PUT /api/responsables-planta/:id
// Body: { "nombre": "Nombre completo corregido" }
// ==========================================================

export const actualizarResponsablePlantaController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const id = getSingleRouteParam(req.params.id, "id");

    const data = await actualizarResponsablePlanta({
      id,
      nombre: req.body?.nombre,
    });

    res.status(200).json({
      success: true,
      message: `Se actualizo el nombre a ${data.nombre}.`,
      data,
    });
  } catch (error) {
    handleError(
      error,
      res,
      "No fue posible actualizar el miembro de planta.",
    );
  }
};

// ==========================================================
// DELETE /api/responsables-planta/:id
//
// Elimina SOLO del catalogo. Las asignaciones existentes a procesos
// se conservan con el nombre textual.
// ==========================================================

export const eliminarResponsablePlantaController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const id = getSingleRouteParam(req.params.id, "id");

    const data = await eliminarResponsablePlanta(id);

    res.status(200).json({
      success: true,
      message:
        `Se elimino a ${data.nombre} del catalogo. ` +
        `${data.procesosAsignadosConservados} proceso(s) conservaron su asignacion historica.`,
      data,
    });
  } catch (error) {
    handleError(
      error,
      res,
      "No fue posible eliminar el miembro de planta.",
    );
  }
};
