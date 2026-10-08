//procesosController.ts

import type {
  Request,
  Response,
} from "express";

import {
  ProcesosError,
  asignarProcesos,
  getAreas,
  getEquipoPorArea,
  getProcesos,
  getResumenProcesos,
  getTiposProceso,
  type AsignarProcesosInput,
} from "../services/procesosService";

// ==========================================================
// MANEJO DE ERRORES
// ==========================================================

const handleError = (
  error: unknown,
  res: Response,
  fallbackMessage: string
): void => {
  console.error(
    fallbackMessage,
    error
  );

  // --------------------------------------------------------
  // Errores controlados desde procesosService
  // --------------------------------------------------------

  if (
    error instanceof
    ProcesosError
  ) {
    res
      .status(
        error.statusCode
      )
      .json({
        success: false,
        message:
          error.message,
      });

    return;
  }

  // --------------------------------------------------------
  // Error no controlado
  // --------------------------------------------------------

  res
    .status(500)
    .json({
      success: false,
      message:
        fallbackMessage,
    });
};

// ==========================================================
// GET /api/procesos
//
// Query params:
// - search
// - opDesc
// - page
// - pageSize
// - estadoCantidad
//
// estadoCantidad:
// - PENDIENTES
// - COMPLETADOS
// - TODOS
//
// Compatibilidad:
// - soloPendientes=true
// - soloPendientes=false
// ==========================================================

// ==========================================================
// GET /api/procesos
// ==========================================================

export const getProcesosController =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // ======================================================
      // BUSCADOR
      // ======================================================

      const search =
        typeof req.query.search === "string"
          ? req.query.search
          : "";

      // ======================================================
      // TIPO DE PROCESO
      // ======================================================

      const opDesc =
        typeof req.query.opDesc === "string"
          ? req.query.opDesc
          : "";

      // ======================================================
      // PAGINACION
      // ======================================================

      const page =
        typeof req.query.page === "string"
          ? Number(req.query.page)
          : 1;

      const pageSize =
        typeof req.query.pageSize === "string"
          ? Number(req.query.pageSize)
          : 50;

      // ======================================================
      // FILTRO DE ESTADO
      //
      // PENDIENTES
      // COMPLETADOS
      // TODOS
      // ======================================================

      const estadoCantidadRaw =
        typeof req.query.estadoCantidad === "string"
          ? req.query.estadoCantidad
              .trim()
              .toUpperCase()
          : "";

      let estadoCantidad:
        | "PENDIENTES"
        | "COMPLETADOS"
        | "TODOS"
        | undefined;

      switch (estadoCantidadRaw) {
        case "PENDIENTES":
        case "COMPLETADOS":
        case "TODOS":
          estadoCantidad =
            estadoCantidadRaw;
          break;

        case "":
          estadoCantidad =
            undefined;
          break;

        default:
          throw new ProcesosError(
            "estadoCantidad debe ser PENDIENTES, COMPLETADOS o TODOS.",
            400
          );
      }

      // ======================================================
      // COMPATIBILIDAD CON soloPendientes
      //
      // true  -> pendientes
      // false -> todos
      // ======================================================

      let soloPendientes:
        boolean | undefined;

      if (
        typeof req.query.soloPendientes ===
        "string"
      ) {
        const value =
          req.query.soloPendientes
            .trim()
            .toLowerCase();

        if (value === "true") {
          soloPendientes = true;
        } else if (
          value === "false"
        ) {
          soloPendientes = false;
        } else {
          throw new ProcesosError(
            "soloPendientes debe ser true o false.",
            400
          );
        }
      }

      // ======================================================
      // CONSTRUIR INPUT
      //
      // IMPORTANTE:
      // con exactOptionalPropertyTypes=true
      // NO enviamos propiedades con valor undefined.
      // ======================================================

      const input = {
        search,
        opDesc,
        page,
        pageSize,

        ...(estadoCantidad !== undefined
          ? {
              estadoCantidad,
            }
          : {}),

        ...(soloPendientes !== undefined
          ? {
              soloPendientes,
            }
          : {}),
      };

      // ======================================================
      // CONSULTAR SERVICE
      // ======================================================

      const result =
        await getProcesos(
          input
        );

      // ======================================================
      // RESPUESTA
      // ======================================================

      res
        .status(200)
        .json({
          success: true,
          data:
            result,
        });
    } catch (error) {
      handleError(
        error,
        res,
        "No fue posible consultar los procesos."
      );
    }
  };
// ==========================================================
// GET /api/procesos/resumen
// ==========================================================

export const getResumenProcesosController =
  async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const result =
        await getResumenProcesos();

      res
        .status(200)
        .json({
          success: true,
          data:
            result,
        });
    } catch (error) {
      handleError(
        error,
        res,
        "No fue posible consultar el resumen de procesos."
      );
    }
  };

// ==========================================================
// GET /api/procesos/tipos
// ==========================================================

export const getTiposProcesoController =
  async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const result =
        await getTiposProceso();

      res
        .status(200)
        .json({
          success: true,
          data:
            result,
        });
    } catch (error) {
      handleError(
        error,
        res,
        "No fue posible consultar los tipos de proceso."
      );
    }
  };

// ==========================================================
// GET /api/procesos/areas
// ==========================================================

export const getAreasController =
  async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const result =
        await getAreas();

      res
        .status(200)
        .json({
          success: true,
          data:
            result,
        });
    } catch (error) {
      handleError(
        error,
        res,
        "No fue posible consultar las áreas."
      );
    }
  };

// ==========================================================
// GET /api/procesos/areas/:areaId/equipo
//
// Ahora este endpoint NO depende de usuarios responsables.
// Devuelve:
//
// {
//   area,
//   lideresSugeridos: [],
//   responsablesSugeridos: []
// }
//
// Los nombres siguen siendo texto libre.
// ==========================================================

export const getEquipoPorAreaController =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const areaId =
        req.params.areaId;

      if (
        !areaId
      ) {
        throw new ProcesosError(
          "El id del área es obligatorio.",
          400
        );
      }

      const result =
        await getEquipoPorArea(
          areaId
        );

      res
        .status(200)
        .json({
          success: true,
          data:
            result,
        });
    } catch (error) {
      handleError(
        error,
        res,
        "No fue posible consultar las sugerencias del área."
      );
    }
  };

// ==========================================================
// PUT /api/procesos/asignacion
//
// Body esperado:
//
// {
//   "procesosIds": [1, 2, 3],
//   "idArea": 4,
//   "lider": "Carlos Restrepo",
//   "responsables": [
//     "Francisco Arango",
//     "Juan Pérez"
//   ]
// }
//
// IMPORTANTE:
// líder y responsables son TEXTO.
// Ya no se envían IDs de usuarios.
// ==========================================================

export const asignarProcesosController =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // ------------------------------------------------------
      // BODY
      // ------------------------------------------------------

      const input =
        req.body as
          AsignarProcesosInput;

      // ------------------------------------------------------
      // SERVICE
      // ------------------------------------------------------

      const result =
        await asignarProcesos(
          input
        );

      // ------------------------------------------------------
      // RESPUESTA
      // ------------------------------------------------------

      res
        .status(200)
        .json({
          success: true,

          message:
            `Se asignaron ${result.procesosActualizados} proceso(s) correctamente.`,

          data:
            result,
        });
    } catch (error) {
      handleError(
        error,
        res,
        "No fue posible guardar la asignación."
      );
    }
  };