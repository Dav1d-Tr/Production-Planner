//procesosService.ts

import pool from "../config/database";

// ==========================================================
// TIPOS PUBLICOS
// ==========================================================

export type EstadoCantidadFiltro =
  | "PENDIENTES"
  | "COMPLETADOS"
  | "TODOS";

export type GetProcesosInput = {
  search?: string;
  opDesc?: string;
  page?: number;
  pageSize?: number;
  estadoCantidad?: EstadoCantidadFiltro | string;

  /**
   * Compatibilidad con versiones anteriores.
   * false equivale a estadoCantidad = "TODOS".
   */
  soloPendientes?: boolean;
};

export type ProcesoOv = {
  numeroOv: number;
  cliente: string | null;
};

export type ProcesoResponsable = {
  id: number;
  nombre: string;
};

export type ProcesoListado = {
  id: number;

  oprSeq: number;
  opCode: string | null;
  opDesc: string | null;
  maquina: string | null;

  cantidadProgramada: number;
  cantidadProducida: number;
  cantidadFaltante: number;

  tiempoEstimadoHoras: number;
  tiempoUnitarioHoras: number;
  tiempoProducidoHoras: number;

  idArea: number | null;
  area: string | null;

  lider: string | null;
  responsables: ProcesoResponsable[];

  idEnsamble: number;
  assemblySeq: number;
  partNumEnsamble: string | null;
  ensamble: string;
  planoEnsamble: string | null;

  idOt: number;
  ot: string;
  proyecto: string | null;
  fechaInicio: string;
  estado: string;

  jobReleased: boolean;
  jobClosed: boolean;
  jobComplete: boolean;
  prioridadTrabajo: number | null;

  ultimaSincronizacionEpicor: string | null;
  sincronizacionEpicorOk: boolean;
  errorSincronizacionEpicor: string | null;

  ovs: ProcesoOv[];
};

export type ProcesosPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ProcesosResult = {
  items: ProcesoListado[];
  pagination: ProcesosPagination;
};

export type ResumenProcesos = {
  otsConProcesos: number;
  totalProcesos: number;
  procesosAsignados: number;
  procesosSinAsignar: number;
};

export type AreaListado = {
  id: number;
  area: string;
};

/**
 * Como lider y responsables ahora son texto libre, este endpoint ya no
 * devuelve usuarios de la BD. Devuelve nombres historicos del area como
 * sugerencias para autocomplete, sin impedir escribir nombres nuevos.
 */
export type EquipoArea = {
  area: AreaListado;
  lideresSugeridos: string[];
  responsablesSugeridos: string[];
};

export type AsignarProcesosInput = {
  procesosIds: number[];
  idArea: number;
  lider: string;
  responsables?: string[];
};

export type AsignarProcesosResult = {
  procesosActualizados: number;
  idArea: number;
  lider: string;
  responsablesPorProceso: number;
};

// ==========================================================
// ERROR DE NEGOCIO
// ==========================================================

export class ProcesosError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ProcesosError";
    this.statusCode = statusCode;
  }
}

// ==========================================================
// TIPOS INTERNOS DB
// ==========================================================

type ProcesoDbRow = {
  total_registros: string | number;

  id: string | number;
  opr_seq: string | number;
  op_code: string | null;
  op_desc: string | null;
  maquina: string | null;

  cantidad_programada: string | number | null;
  cantidad_producida: string | number | null;
  cantidad_faltante: string | number | null;

  tiempo_estimado_horas: string | number | null;
  tiempo_unitario_horas: string | number | null;
  tiempo_producido_horas: string | number | null;

  id_area: string | number | null;
  area: string | null;
  lider: string | null;

  id_ensamble: string | number;
  assembly_seq: string | number;
  part_num_ensamble: string | null;
  ensamble: string;
  plano_ensamble: string | null;

  id_ot: string | number;
  ot: string;
  proyecto: string | null;
  fecha_inicio: string | Date;
  estado: string;

  job_released: boolean;
  job_closed: boolean;
  job_complete: boolean;
  prioridad_trabajo: string | number | null;

  ultima_sincronizacion_epicor: string | Date | null;
  sincronizacion_epicor_ok: boolean;
  error_sincronizacion_epicor: string | null;

  ovs: unknown;
  responsables: unknown;
};

type ResumenDbRow = {
  ots_con_procesos: string | number;
  total_procesos: string | number;
  procesos_asignados: string | number;
  procesos_sin_asignar: string | number;
};

type TipoProcesoDbRow = {
  op_desc: string;
};

type AreaDbRow = {
  id: string | number;
  area: string;
};

type NombreDbRow = {
  nombre: string;
};

type IdDbRow = {
  id: string | number;
};

// ==========================================================
// UTILIDADES
// ==========================================================

const toNumber = (
  value: string | number | null | undefined
): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateString = (value: string | Date): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
};

const toIsoDateTimeOrNull = (
  value: string | Date | null | undefined
): string | null => {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return String(value);
};

const normalizeText = (
  value: string | null | undefined
): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const normalizeEstadoCantidad = (
  value: unknown,
  soloPendientes?: boolean
): EstadoCantidadFiltro => {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();

    if (
      normalized === "PENDIENTES" ||
      normalized === "COMPLETADOS" ||
      normalized === "TODOS"
    ) {
      return normalized;
    }
  }

  return soloPendientes === false ? "TODOS" : "PENDIENTES";
};

const requiredText = (
  value: unknown,
  fieldName: string,
  maxLength = 150
): string => {
  if (typeof value !== "string") {
    throw new ProcesosError(`${fieldName} debe ser texto.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new ProcesosError(`${fieldName} es obligatorio.`);
  }

  if (normalized.length > maxLength) {
    throw new ProcesosError(
      `${fieldName} no puede superar ${maxLength} caracteres.`
    );
  }

  return normalized;
};

const positiveInteger = (
  value: unknown,
  fieldName: string
): number => {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ProcesosError(
      `${fieldName} debe ser un entero positivo.`
    );
  }

  return parsed;
};

const uniquePositiveIds = (
  value: unknown,
  fieldName: string,
  allowEmpty = false
): number[] => {
  if (!Array.isArray(value)) {
    throw new ProcesosError(`${fieldName} debe ser un arreglo.`);
  }

  const ids = value.map((item) =>
    positiveInteger(item, fieldName)
  );

  const unique = Array.from(new Set(ids));

  if (!allowEmpty && unique.length === 0) {
    throw new ProcesosError(
      `${fieldName} debe contener al menos un elemento.`
    );
  }

  return unique;
};

const uniqueTexts = (
  value: unknown,
  fieldName: string,
  maxLength = 150
): string[] => {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ProcesosError(`${fieldName} debe ser un arreglo.`);
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const text = requiredText(item, fieldName, maxLength);
    const key = text.normalize("NFKC").toLocaleLowerCase("es");

    if (!seen.has(key)) {
      seen.add(key);
      result.push(text);
    }
  }

  return result;
};

const parseJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const parseOvs = (value: unknown): ProcesoOv[] => {
  return parseJsonArray(value).flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const numeroOv = Number(record.numeroOv);

    if (!Number.isSafeInteger(numeroOv) || numeroOv <= 0) {
      return [];
    }

    const cliente =
      typeof record.cliente === "string" && record.cliente.trim()
        ? record.cliente.trim()
        : null;

    return [{ numeroOv, cliente }];
  });
};

const parseResponsables = (
  value: unknown
): ProcesoResponsable[] => {
  return parseJsonArray(value).flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const id = Number(record.id);
    const nombre =
      typeof record.nombre === "string"
        ? record.nombre.trim()
        : "";

    if (!Number.isSafeInteger(id) || id <= 0 || !nombre) {
      return [];
    }

    return [{ id, nombre }];
  });
};

// ==========================================================
// LISTAR PROCESOS
// ==========================================================

export const getProcesos = async (
  input: GetProcesosInput = {}
): Promise<ProcesosResult> => {
  const page = Math.max(Number(input.page) || 1, 1);

  const pageSize = Math.min(
    Math.max(Number(input.pageSize) || 50, 1),
    200
  );

  const offset = (page - 1) * pageSize;
  const search = normalizeText(input.search);
  const opDesc = normalizeText(input.opDesc);

  const estadoCantidad = normalizeEstadoCantidad(
    input.estadoCantidad,
    input.soloPendientes
  );

  const result = await pool.query<ProcesoDbRow>(
    `
      SELECT
        COUNT(*) OVER() AS total_registros,

        p.id,
        p.opr_seq,
        p.op_code,
        p.op_desc,
        p.maquina,

        p.cantidad_programada,
        p.cantidad_producida,
        p.cantidad_faltante,

        p.tiempo_estimado_horas,
        p.tiempo_unitario_horas,
        p.tiempo_producido_horas,

        p.id_area,
        a.area,
        p.lider,

        e.id AS id_ensamble,
        e.assembly_seq,
        e.part_num AS part_num_ensamble,
        e.ensamble,
        e.plano AS plano_ensamble,

        ot.id AS id_ot,
        ot.ot,
        ot.proyecto,
        ot.fecha_inicio,
        ot.job_released,
        ot.job_closed,
        ot.job_complete,
        ot.prioridad AS prioridad_trabajo,

        es.estado,

        p.ultima_sincronizacion_epicor,
        p.sincronizacion_epicor_ok,
        p.error_sincronizacion_epicor,

        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'numeroOv', ov.numero_ov,
                'cliente',
                (
                  SELECT c.nombre_cliente
                  FROM clientes AS c
                  WHERE c.id_ov = ov.id
                  ORDER BY c.id
                  LIMIT 1
                )
              )
              ORDER BY ov.numero_ov
            )
            FROM ovs AS ov
            WHERE ov.id_ot = ot.id
          ),
          '[]'::jsonb
        ) AS ovs,

        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', pr.id,
                'nombre', pr.nombre
              )
              ORDER BY pr.nombre
            )
            FROM procesos_responsables AS pr
            WHERE pr.id_proceso = p.id
          ),
          '[]'::jsonb
        ) AS responsables

      FROM procesos AS p

      INNER JOIN ensambles AS e
        ON e.id = p.id_ensamble

      INNER JOIN ots AS ot
        ON ot.id = e.id_ot

      INNER JOIN estados AS es
        ON es.id = ot.id_estado

      LEFT JOIN areas AS a
        ON a.id = p.id_area

      WHERE
        (
          $1::text IS NULL

          OR ot.ot ILIKE '%' || $1 || '%'

          OR COALESCE(ot.proyecto, '')
            ILIKE '%' || $1 || '%'

          OR COALESCE(p.op_desc, '')
            ILIKE '%' || $1 || '%'

          OR COALESCE(p.op_code, '')
            ILIKE '%' || $1 || '%'

          OR COALESCE(e.ensamble, '')
            ILIKE '%' || $1 || '%'

          OR COALESCE(p.lider, '')
            ILIKE '%' || $1 || '%'

          OR EXISTS (
            SELECT 1
            FROM procesos_responsables AS pr_search
            WHERE
              pr_search.id_proceso = p.id
              AND pr_search.nombre ILIKE '%' || $1 || '%'
          )

          OR EXISTS (
            SELECT 1
            FROM ovs AS ov_search

            LEFT JOIN clientes AS c_search
              ON c_search.id_ov = ov_search.id

            WHERE
              ov_search.id_ot = ot.id
              AND (
                CAST(ov_search.numero_ov AS TEXT)
                  ILIKE '%' || $1 || '%'

                OR COALESCE(c_search.nombre_cliente, '')
                  ILIKE '%' || $1 || '%'
              )
          )
        )

        AND (
          $2::text IS NULL
          OR TRIM(COALESCE(p.op_desc, '')) = $2
        )

        AND (
          $3::text = 'TODOS'

          OR (
            $3::text = 'PENDIENTES'
            AND ot.job_closed = FALSE
            AND ot.job_complete = FALSE
            AND NOT (
              COALESCE(p.cantidad_programada, 0) > 0
              AND COALESCE(p.cantidad_faltante, 0) <= 0
            )
          )

          OR (
            $3::text = 'COMPLETADOS'
            AND (
              ot.job_closed = TRUE
              OR ot.job_complete = TRUE
              OR (
                COALESCE(p.cantidad_programada, 0) > 0
                AND COALESCE(p.cantidad_faltante, 0) <= 0
              )
            )
          )
        )

      ORDER BY
        ot.fecha_inicio DESC,
        ot.ot,
        e.assembly_seq,
        p.opr_seq

      LIMIT $4
      OFFSET $5;
    `,
    [
      search,
      opDesc,
      estadoCantidad,
      pageSize,
      offset,
    ]
  );

  const total = toNumber(
    result.rows[0]?.total_registros ?? 0
  );

  const items = result.rows.map((row: ProcesoDbRow): ProcesoListado => ({
    id: toNumber(row.id),

    oprSeq: toNumber(row.opr_seq),
    opCode: row.op_code,
    opDesc: row.op_desc,
    maquina: row.maquina,

    cantidadProgramada: toNumber(row.cantidad_programada),
    cantidadProducida: toNumber(row.cantidad_producida),
    cantidadFaltante: toNumber(row.cantidad_faltante),

    tiempoEstimadoHoras: toNumber(row.tiempo_estimado_horas),
    tiempoUnitarioHoras: toNumber(row.tiempo_unitario_horas),
    tiempoProducidoHoras: toNumber(row.tiempo_producido_horas),

    idArea:
      row.id_area === null
        ? null
        : toNumber(row.id_area),

    area: row.area,
    lider: normalizeText(row.lider),

    responsables: parseResponsables(row.responsables),

    idEnsamble: toNumber(row.id_ensamble),
    assemblySeq: toNumber(row.assembly_seq),
    partNumEnsamble: row.part_num_ensamble,
    ensamble: row.ensamble,
    planoEnsamble: row.plano_ensamble,

    idOt: toNumber(row.id_ot),
    ot: row.ot,
    proyecto: row.proyecto,
    fechaInicio: toDateString(row.fecha_inicio),
    estado: row.estado,

    jobReleased: Boolean(row.job_released),
    jobClosed: Boolean(row.job_closed),
    jobComplete: Boolean(row.job_complete),
    prioridadTrabajo:
      row.prioridad_trabajo == null
        ? null
        : toNumber(row.prioridad_trabajo),

    ultimaSincronizacionEpicor: toIsoDateTimeOrNull(
      row.ultima_sincronizacion_epicor
    ),
    sincronizacionEpicorOk: Boolean(
      row.sincronizacion_epicor_ok
    ),
    errorSincronizacionEpicor:
      row.error_sincronizacion_epicor,

    ovs: parseOvs(row.ovs),
  }));

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages:
        total === 0
          ? 0
          : Math.ceil(total / pageSize),
    },
  };
};

// ==========================================================
// RESUMEN / KPIs
// ==========================================================

export const getResumenProcesos =
  async (): Promise<ResumenProcesos> => {
    const result = await pool.query<ResumenDbRow>(
      `
        SELECT
          COUNT(DISTINCT e.id_ot) AS ots_con_procesos,

          COUNT(p.id) AS total_procesos,

          COUNT(p.id) FILTER (
            WHERE
              p.id_area IS NOT NULL
              AND p.lider IS NOT NULL
              AND BTRIM(p.lider) <> ''
          ) AS procesos_asignados,

          COUNT(p.id) FILTER (
            WHERE
              p.id_area IS NULL
              OR p.lider IS NULL
              OR BTRIM(p.lider) = ''
          ) AS procesos_sin_asignar

        FROM procesos AS p

        INNER JOIN ensambles AS e
          ON e.id = p.id_ensamble;
      `
    );

    const row = result.rows[0];

    return {
      otsConProcesos: toNumber(row?.ots_con_procesos),
      totalProcesos: toNumber(row?.total_procesos),
      procesosAsignados: toNumber(row?.procesos_asignados),
      procesosSinAsignar: toNumber(row?.procesos_sin_asignar),
    };
  };

// ==========================================================
// TIPOS DE PROCESO (op_desc)
// ==========================================================

export const getTiposProceso =
  async (): Promise<string[]> => {
    const result = await pool.query<TipoProcesoDbRow>(
      `
        SELECT DISTINCT
          TRIM(op_desc) AS op_desc

        FROM procesos

        WHERE
          op_desc IS NOT NULL
          AND TRIM(op_desc) <> ''

        ORDER BY TRIM(op_desc);
      `
    );

    return result.rows.map((row: TipoProcesoDbRow) => row.op_desc);
  };

// ==========================================================
// AREAS
// ==========================================================

export const getAreas = async (): Promise<AreaListado[]> => {
  const result = await pool.query<AreaDbRow>(
    `
      SELECT
        id,
        area

      FROM areas

      WHERE activo = TRUE

      ORDER BY area;
    `
  );

  return result.rows.map((row: AreaDbRow) => ({
    id: toNumber(row.id),
    area: row.area,
  }));
};

// ==========================================================
// SUGERENCIAS DE NOMBRES POR AREA
// ==========================================================

/**
 * Ya no existe una tabla de usuarios responsables.
 * Esta funcion mantiene el nombre del endpoint anterior, pero ahora devuelve
 * nombres historicos usados en el area para poder ofrecer autocomplete.
 * El frontend debe permitir escribir cualquier nombre nuevo.
 */
export const getEquipoPorArea = async (
  idAreaInput: unknown
): Promise<EquipoArea> => {
  const idArea = positiveInteger(idAreaInput, "idArea");

  const areaResult = await pool.query<AreaDbRow>(
    `
      SELECT
        id,
        area

      FROM areas

      WHERE
        id = $1
        AND activo = TRUE;
    `,
    [idArea]
  );

  const area = areaResult.rows[0];

  if (!area) {
    throw new ProcesosError(
      "El área no existe o está inactiva.",
      404
    );
  }

  const lideresResult = await pool.query<NombreDbRow>(
    `
      SELECT DISTINCT
        BTRIM(p.lider) AS nombre

      FROM procesos AS p

      WHERE
        p.id_area = $1
        AND p.lider IS NOT NULL
        AND BTRIM(p.lider) <> ''

      ORDER BY nombre;
    `,
    [idArea]
  );

  const responsablesResult = await pool.query<NombreDbRow>(
    `
      SELECT DISTINCT
        BTRIM(pr.nombre) AS nombre

      FROM procesos_responsables AS pr

      INNER JOIN procesos AS p
        ON p.id = pr.id_proceso

      WHERE
        p.id_area = $1
        AND BTRIM(pr.nombre) <> ''

      ORDER BY nombre;
    `,
    [idArea]
  );

  return {
    area: {
      id: toNumber(area.id),
      area: area.area,
    },
    lideresSugeridos: lideresResult.rows.map(
      (row: NombreDbRow) => row.nombre
    ),
    responsablesSugeridos: responsablesResult.rows.map(
      (row: NombreDbRow) => row.nombre
    ),
  };
};

// ==========================================================
// ASIGNACION MASIVA
// ==========================================================
//
// Reemplaza el area, lider y responsables anteriores de todos
// los procesos seleccionados.
//
// El lider es UN texto.
// Los responsables son CERO, UNO o MUCHOS textos.
// ==========================================================

export const asignarProcesos = async (
  input: AsignarProcesosInput
): Promise<AsignarProcesosResult> => {
  if (!input || typeof input !== "object") {
    throw new ProcesosError(
      "El cuerpo de la solicitud es obligatorio."
    );
  }

  const procesosIds = uniquePositiveIds(
    input.procesosIds,
    "procesosIds"
  );

  const idArea = positiveInteger(
    input.idArea,
    "idArea"
  );

  const lider = requiredText(
    input.lider,
    "lider",
    150
  );

  const responsables = uniqueTexts(
    input.responsables ?? [],
    "responsables",
    150
  );

  const liderKey = lider
    .normalize("NFKC")
    .toLocaleLowerCase("es");

  const liderRepetido = responsables.some(
    (responsable) =>
      responsable
        .normalize("NFKC")
        .toLocaleLowerCase("es") === liderKey
  );

  if (liderRepetido) {
    throw new ProcesosError(
      "El líder no debe repetirse dentro de responsables."
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ------------------------------------------------------
    // BLOQUEAR Y VALIDAR AREA
    // ------------------------------------------------------

    const areaResult = await client.query<AreaDbRow>(
      `
        SELECT
          id,
          area

        FROM areas

        WHERE
          id = $1
          AND activo = TRUE

        FOR UPDATE;
      `,
      [idArea]
    );

    if (!areaResult.rows[0]) {
      throw new ProcesosError(
        "El área seleccionada no existe o está inactiva.",
        404
      );
    }

    // ------------------------------------------------------
    // BLOQUEAR Y VALIDAR PROCESOS
    // ------------------------------------------------------

    const procesosResult = await client.query<IdDbRow>(
      `
        SELECT id

        FROM procesos

        WHERE id = ANY($1::bigint[])

        FOR UPDATE;
      `,
      [procesosIds]
    );

    const procesosEncontrados = new Set(
      procesosResult.rows.map((row: IdDbRow) => toNumber(row.id))
    );

    const faltantes = procesosIds.filter(
      (id) => !procesosEncontrados.has(id)
    );

    if (faltantes.length > 0) {
      throw new ProcesosError(
        `No existen los siguientes procesos: ${faltantes.join(", ")}.`,
        404
      );
    }

    // ------------------------------------------------------
    // ASIGNAR AREA Y LIDER
    // ------------------------------------------------------

    await client.query(
      `
        UPDATE procesos

        SET
          id_area = $1,
          lider = $2

        WHERE id = ANY($3::bigint[]);
      `,
      [idArea, lider, procesosIds]
    );

    // ------------------------------------------------------
    // REEMPLAZAR RESPONSABLES ANTERIORES
    // ------------------------------------------------------

    await client.query(
      `
        DELETE FROM procesos_responsables

        WHERE id_proceso = ANY($1::bigint[]);
      `,
      [procesosIds]
    );

    // ------------------------------------------------------
    // INSERTAR RESPONSABLES PARA CADA PROCESO
    // ------------------------------------------------------

    if (responsables.length > 0) {
      await client.query(
        `
          INSERT INTO procesos_responsables (
            id_proceso,
            nombre
          )

          SELECT
            proceso.id,
            responsable.nombre

          FROM unnest($1::bigint[]) AS proceso(id)

          CROSS JOIN unnest($2::text[]) AS responsable(nombre);
        `,
        [procesosIds, responsables]
      );
    }

    await client.query("COMMIT");

    return {
      procesosActualizados: procesosIds.length,
      idArea,
      lider,
      responsablesPorProceso: responsables.length,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Error ejecutando ROLLBACK de asignación:",
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
};
