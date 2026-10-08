import pool from "../config/database";

// ==========================================================
// TIPOS PUBLICOS
// ==========================================================

export type ResponsablePlanta = {
  id: number;
  nombre: string;
  procesosAsignados: number;
  fechaCreacion: string;
  fechaActualizacion: string;
};

export type CrearResponsablePlantaInput = {
  nombre: string;
};

export type ActualizarResponsablePlantaInput = {
  id: number | string;
  nombre: string;
};

export type EliminarResponsablePlantaResult = {
  id: number;
  nombre: string;
  procesosAsignadosConservados: number;
};

// ==========================================================
// ERROR DE NEGOCIO
// ==========================================================

export class ResponsablesPlantaError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ResponsablesPlantaError";
    this.statusCode = statusCode;
  }
}

// ==========================================================
// TIPOS DB
// ==========================================================

type ResponsableDbRow = {
  id: string | number;
  nombre: string;
  procesos_asignados: string | number;
  fecha_creacion: string | Date;
  fecha_actualizacion: string | Date;
};

type ResponsableBaseDbRow = {
  id: string | number;
  nombre: string;
};

type CountDbRow = {
  total: string | number;
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

const toIso = (value: string | Date): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toISOString();
};

const normalizeVisibleName = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new ResponsablesPlantaError(
      "El nombre completo debe ser texto.",
    );
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new ResponsablesPlantaError(
      "El nombre completo es obligatorio.",
    );
  }

  if (normalized.length > 150) {
    throw new ResponsablesPlantaError(
      "El nombre completo no puede superar 150 caracteres.",
    );
  }

  return normalized;
};

const positiveInteger = (
  value: unknown,
  fieldName: string,
): number => {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ResponsablesPlantaError(
      `${fieldName} debe ser un entero positivo.`,
    );
  }

  return parsed;
};

const getPgCode = (error: unknown): string | null => {
  if (!error || typeof error !== "object") {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
};

const mapResponsable = (
  row: ResponsableDbRow,
): ResponsablePlanta => ({
  id: toNumber(row.id),
  nombre: row.nombre,
  procesosAsignados: toNumber(row.procesos_asignados),
  fechaCreacion: toIso(row.fecha_creacion),
  fechaActualizacion: toIso(row.fecha_actualizacion),
});

// ==========================================================
// LISTAR / BUSCAR
// ==========================================================

export const getResponsablesPlanta = async (
  searchInput: unknown = "",
): Promise<ResponsablePlanta[]> => {
  const search =
    typeof searchInput === "string" && searchInput.trim()
      ? searchInput.trim()
      : null;

  const result = await pool.query<ResponsableDbRow>(
    `
      SELECT
        rp.id,
        rp.nombre,
        COUNT(DISTINCT pr.id_proceso)::INTEGER AS procesos_asignados,
        rp.fecha_creacion,
        rp.fecha_actualizacion
      FROM public.responsables_planta AS rp
      LEFT JOIN public.procesos_responsables AS pr
        ON pr.id_responsable_planta = rp.id
      WHERE
        $1::TEXT IS NULL
        OR rp.nombre ILIKE '%' || $1::TEXT || '%'
      GROUP BY
        rp.id,
        rp.nombre,
        rp.fecha_creacion,
        rp.fecha_actualizacion
      ORDER BY
        rp.nombre ASC,
        rp.id ASC;
    `,
    [search],
  );

  return result.rows.map(mapResponsable);
};

// ==========================================================
// CREAR
// ==========================================================

export const crearResponsablePlanta = async (
  input: CrearResponsablePlantaInput,
): Promise<ResponsablePlanta> => {
  const nombre = normalizeVisibleName(input?.nombre);

  try {
    const result = await pool.query<ResponsableBaseDbRow>(
      `
        WITH input AS (
          SELECT $1::TEXT AS nombre
        )
        INSERT INTO public.responsables_planta (
          nombre,
          nombre_clave
        )
        SELECT
          input.nombre,
          public.normalizar_nombre_responsable(input.nombre)
        FROM input
        RETURNING
          id,
          nombre;
      `,
      [nombre],
    );

    const created = result.rows[0];

    if (!created) {
      throw new Error(
        "PostgreSQL no devolvio el responsable creado.",
      );
    }

    const listed = await pool.query<ResponsableDbRow>(
      `
        SELECT
          rp.id,
          rp.nombre,
          COUNT(DISTINCT pr.id_proceso)::INTEGER AS procesos_asignados,
          rp.fecha_creacion,
          rp.fecha_actualizacion
        FROM public.responsables_planta AS rp
        LEFT JOIN public.procesos_responsables AS pr
          ON pr.id_responsable_planta = rp.id
        WHERE rp.id = $1
        GROUP BY
          rp.id,
          rp.nombre,
          rp.fecha_creacion,
          rp.fecha_actualizacion;
      `,
      [created.id],
    );

    return mapResponsable(listed.rows[0]!);
  } catch (error) {
    if (getPgCode(error) === "23505") {
      throw new ResponsablesPlantaError(
        `Ya existe un miembro de planta llamado "${nombre}".`,
        409,
      );
    }

    throw error;
  }
};

// ==========================================================
// EDITAR
// ==========================================================

export const actualizarResponsablePlanta = async (
  input: ActualizarResponsablePlantaInput,
): Promise<ResponsablePlanta> => {
  const id = positiveInteger(input?.id, "id");
  const nombre = normalizeVisibleName(input?.nombre);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const currentResult = await client.query<ResponsableBaseDbRow>(
      `
        SELECT
          id,
          nombre
        FROM public.responsables_planta
        WHERE id = $1
        FOR UPDATE;
      `,
      [id],
    );

    const current = currentResult.rows[0];

    if (!current) {
      throw new ResponsablesPlantaError(
        "El miembro de planta no existe.",
        404,
      );
    }

    // El trigger de responsables_planta propaga el nuevo nombre a todas
    // las asignaciones vinculadas, sin cambiar el id_proceso.
    await client.query(
      `
        UPDATE public.responsables_planta
        SET nombre = $2
        WHERE id = $1;
      `,
      [id, nombre],
    );

    const listed = await client.query<ResponsableDbRow>(
      `
        SELECT
          rp.id,
          rp.nombre,
          COUNT(DISTINCT pr.id_proceso)::INTEGER AS procesos_asignados,
          rp.fecha_creacion,
          rp.fecha_actualizacion
        FROM public.responsables_planta AS rp
        LEFT JOIN public.procesos_responsables AS pr
          ON pr.id_responsable_planta = rp.id
        WHERE rp.id = $1
        GROUP BY
          rp.id,
          rp.nombre,
          rp.fecha_creacion,
          rp.fecha_actualizacion;
      `,
      [id],
    );

    await client.query("COMMIT");

    return mapResponsable(listed.rows[0]!);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Error haciendo rollback de responsable de planta:",
        rollbackError,
      );
    }

    if (error instanceof ResponsablesPlantaError) {
      throw error;
    }

    if (getPgCode(error) === "23505") {
      throw new ResponsablesPlantaError(
        `No se puede usar el nombre "${nombre}" porque ya existe o produciria una asignacion duplicada en un proceso.`,
        409,
      );
    }

    throw error;
  } finally {
    client.release();
  }
};

// ==========================================================
// ELIMINAR DEL CATALOGO
// ==========================================================
//
// MUY IMPORTANTE:
// La eliminacion afecta UNICAMENTE responsables_planta.
// Por el FK ON DELETE SET NULL las filas de procesos_responsables se
// conservan con su nombre textual. Por tanto NO se pierde ninguna asignacion.
// ==========================================================

export const eliminarResponsablePlanta = async (
  idInput: unknown,
): Promise<EliminarResponsablePlantaResult> => {
  const id = positiveInteger(idInput, "id");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const currentResult = await client.query<ResponsableBaseDbRow>(
      `
        SELECT
          id,
          nombre
        FROM public.responsables_planta
        WHERE id = $1
        FOR UPDATE;
      `,
      [id],
    );

    const current = currentResult.rows[0];

    if (!current) {
      throw new ResponsablesPlantaError(
        "El miembro de planta no existe.",
        404,
      );
    }

    const countResult = await client.query<CountDbRow>(
      `
        SELECT
          COUNT(DISTINCT id_proceso)::INTEGER AS total
        FROM public.procesos_responsables
        WHERE id_responsable_planta = $1;
      `,
      [id],
    );

    const procesosAsignadosConservados = toNumber(
      countResult.rows[0]?.total,
    );

    await client.query(
      `
        DELETE FROM public.responsables_planta
        WHERE id = $1;
      `,
      [id],
    );

    await client.query("COMMIT");

    return {
      id,
      nombre: current.nombre,
      procesosAsignadosConservados,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Error haciendo rollback eliminando responsable de planta:",
        rollbackError,
      );
    }

    throw error;
  } finally {
    client.release();
  }
};
