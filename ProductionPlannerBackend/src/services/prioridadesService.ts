import pool from "../config/database";

// ==========================================================
// TIPOS PUBLICOS
// ==========================================================

export type GetOvsPrioridadInput = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type OvPrioridad = {
  numeroOv: number;
  prioridad: number | null;
  fechaRequerimiento: string | null;
  detalle: string | null;
  clienteExcel: string | null;
  linea: string | null;
  fuente: string | null;
  prioridadActualizadaEn: string | null;
  ots: string[];
  proyectos: string[];
  clientesDb: string[];
  fechaInicioMin: string | null;
  algunaOtLiberada: boolean;
  totalProcesos: number;
  procesosPendientes: number;
  procesosCompletados: number;
  progresoPorcentaje: number;
};

export type OvsPrioridadResult = {
  items: OvPrioridad[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type AsignarPrioridadOvInput = {
  numeroOv: number;
  prioridad: number;
};

export type AsignarPrioridadOvResult = {
  numeroOv: number;
  prioridad: number;
};

export type QuitarPrioridadOvResult = {
  numeroOv: number;
  prioridad: null;
};

// ==========================================================
// ERROR DE NEGOCIO
// ==========================================================

export class PrioridadesError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PrioridadesError";
    this.statusCode = statusCode;
  }
}

// ==========================================================
// TIPOS INTERNOS DB
// ==========================================================

type CountDbRow = {
  total: string | number;
};

type OvPrioridadDbRow = {
  numero_ov: string | number;
  prioridad: string | number | null;
  fecha_requerimiento: string | Date | null;
  detalle: string | null;
  cliente_excel: string | null;
  linea: string | null;
  fuente: string | null;
  prioridad_actualizada_en: string | Date | null;
  ots: unknown;
  proyectos: unknown;
  clientes_db: unknown;
  fecha_inicio_min: string | Date | null;
  alguna_ot_liberada: boolean;
  total_procesos: string | number;
  procesos_pendientes: string | number;
  procesos_completados: string | number;
  progreso_porcentaje: string | number;
};

type PrioridadDbRow = {
  numero_ov: string | number;
  prioridad: string | number | null;
};

// ==========================================================
// HELPERS
// ==========================================================

const toNumber = (
  value: string | number | null | undefined,
): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableNumber = (
  value: string | number | null | undefined,
): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const positiveInteger = (
  value: unknown,
  fieldName: string,
): number => {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new PrioridadesError(
      `${fieldName} debe ser un entero positivo.`,
    );
  }

  return parsed;
};

const normalizeText = (
  value: string | null | undefined,
): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const toDateString = (
  value: string | Date | null | undefined,
): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  return text ? text.slice(0, 10) : null;
};

const toTimestampString = (
  value: string | Date | null | undefined,
): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const text = String(value).trim();
  return text || null;
};

const parseTextArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
};

const translateDatabaseError = (error: unknown): never => {
  const message =
    error instanceof Error
      ? error.message
      : "No fue posible actualizar la prioridad de la OV.";

  if (message.includes("no existe")) {
    throw new PrioridadesError(message, 404);
  }

  if (
    message.includes("uq_prioridades_ov_prioridad") ||
    message.includes("duplicate key value")
  ) {
    throw new PrioridadesError(
      "La prioridad solicitada ya esta ocupada por otra OV.",
      409,
    );
  }

  throw new PrioridadesError(message, 400);
};

const buildSearchCondition = (): string => `
  (
    $1::text IS NULL
    OR v.numero_ov::text ILIKE '%' || $1 || '%'
    OR COALESCE(v.detalle, '') ILIKE '%' || $1 || '%'
    OR COALESCE(v.cliente_excel, '') ILIKE '%' || $1 || '%'
    OR COALESCE(v.linea, '') ILIKE '%' || $1 || '%'
    OR COALESCE(array_to_string(v.ots, ' '), '') ILIKE '%' || $1 || '%'
    OR COALESCE(array_to_string(v.proyectos, ' '), '') ILIKE '%' || $1 || '%'
    OR COALESCE(array_to_string(v.clientes_db, ' '), '') ILIKE '%' || $1 || '%'
  )
`;

// ==========================================================
// LISTAR OVS PARA PRIORIZACION
// ==========================================================

export const getOvsPrioridad = async (
  input: GetOvsPrioridadInput = {},
): Promise<OvsPrioridadResult> => {
  const page = Math.max(Number(input.page) || 1, 1);

  const pageSize = Math.min(
    Math.max(Number(input.pageSize) || 50, 1),
    500,
  );

  const offset = (page - 1) * pageSize;
  const search = normalizeText(input.search);
  const searchCondition = buildSearchCondition();

  const [countResult, dataResult] = await Promise.all([
    pool.query<CountDbRow>(
      `
        SELECT COUNT(*)::BIGINT AS total
        FROM public.vw_ovs_priorizacion AS v
        WHERE ${searchCondition};
      `,
      [search],
    ),

    pool.query<OvPrioridadDbRow>(
      `
        SELECT
          v.numero_ov,
          v.prioridad,
          v.fecha_requerimiento,
          v.detalle,
          v.cliente_excel,
          v.linea,
          v.fuente,
          v.prioridad_actualizada_en,
          v.ots,
          v.proyectos,
          v.clientes_db,
          v.fecha_inicio_min,
          v.alguna_ot_liberada,
          v.total_procesos,
          v.procesos_pendientes,
          v.procesos_completados,
          v.progreso_porcentaje
        FROM public.vw_ovs_priorizacion AS v
        WHERE ${searchCondition}
        ORDER BY
          v.prioridad ASC NULLS LAST,
          v.fecha_requerimiento ASC NULLS LAST,
          v.numero_ov ASC
        LIMIT $2
        OFFSET $3;
      `,
      [search, pageSize, offset],
    ),
  ]);

  const total = toNumber(countResult.rows[0]?.total ?? 0);

  const items: OvPrioridad[] = dataResult.rows.map((row) => ({
    numeroOv: toNumber(row.numero_ov),
    prioridad: toNullableNumber(row.prioridad),
    fechaRequerimiento: toDateString(row.fecha_requerimiento),
    detalle: normalizeText(row.detalle),
    clienteExcel: normalizeText(row.cliente_excel),
    linea: normalizeText(row.linea),
    fuente: normalizeText(row.fuente),
    prioridadActualizadaEn: toTimestampString(
      row.prioridad_actualizada_en,
    ),
    ots: parseTextArray(row.ots),
    proyectos: parseTextArray(row.proyectos),
    clientesDb: parseTextArray(row.clientes_db),
    fechaInicioMin: toDateString(row.fecha_inicio_min),
    algunaOtLiberada: Boolean(row.alguna_ot_liberada),
    totalProcesos: toNumber(row.total_procesos),
    procesosPendientes: toNumber(row.procesos_pendientes),
    procesosCompletados: toNumber(row.procesos_completados),
    progresoPorcentaje: toNumber(row.progreso_porcentaje),
  }));

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  };
};

// ==========================================================
// ASIGNAR / MOVER PRIORIDAD DE UNA OV
// ==========================================================

export const asignarPrioridadOv = async (
  input: AsignarPrioridadOvInput,
): Promise<AsignarPrioridadOvResult> => {
  if (!input || typeof input !== "object") {
    throw new PrioridadesError(
      "El cuerpo de la solicitud es obligatorio.",
    );
  }

  const numeroOv = positiveInteger(input.numeroOv, "numeroOv");
  const prioridad = positiveInteger(input.prioridad, "prioridad");

  try {
    const result = await pool.query<PrioridadDbRow>(
      `
        WITH asignada AS (
          SELECT public.asignar_prioridad_ov($1, $2) AS prioridad
        )
        SELECT
          $1::BIGINT AS numero_ov,
          asignada.prioridad
        FROM asignada;
      `,
      [numeroOv, prioridad],
    );

    const row = result.rows[0];

    if (!row) {
      throw new PrioridadesError(
        `No fue posible asignar prioridad a la OV ${numeroOv}.`,
        500,
      );
    }

    return {
      numeroOv: toNumber(row.numero_ov),
      prioridad: toNumber(row.prioridad),
    };
  } catch (error) {
    if (error instanceof PrioridadesError) {
      throw error;
    }

    return translateDatabaseError(error);
  }
};

// ==========================================================
// QUITAR PRIORIDAD DE UNA OV
// ==========================================================

export const quitarPrioridadOv = async (
  numeroOvInput: unknown,
): Promise<QuitarPrioridadOvResult> => {
  const numeroOv = positiveInteger(numeroOvInput, "numeroOv");

  try {
    await pool.query(
      "SELECT public.quitar_prioridad_ov($1);",
      [numeroOv],
    );

    return {
      numeroOv,
      prioridad: null,
    };
  } catch (error) {
    if (error instanceof PrioridadesError) {
      throw error;
    }

    return translateDatabaseError(error);
  }
};
