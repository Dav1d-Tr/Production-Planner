//controlProduccionService.ts

import pool from "../config/database";
import {
  getJobLifecycleFromEpicor,
  getOtsFromEpicor,
  type EpicorJobLifecycle,
} from "./otsservice";

// ==========================================================
// TIPOS PUBLICOS
// ==========================================================

export type ProductionStatus =
  | "En proceso"
  | "Atrasada"
  | "Completada"
  | "Liberada";

export type ProductionRow = {
  id: number;
  cliente: string;
  proyecto: string;
  ov: string;
  ot: string;
  plano: string;
  operacion: string;
  maquina: string;
  ensamble: string;
  responsable: string;

  /** Tiempo total estimado por Ingenieria para completar toda la cantidad programada. */
  tiempo: string;
  tiempoTotal: string;
  tiempoRestante: string;
  tiempoTotalHoras: number;
  tiempoRestanteHoras: number;
  tiempoSinDefinir: boolean;

  cantProg: number;
  cantProd: number;
  cantFal: number;
  areaPrimera: string;
  estado: ProductionStatus;

  /** Prioridad efectiva heredada de la OV. Prioridad 1 = mas urgente. */
  prioridadTrabajo: number | null;
  tipoProceso: string;
  posicionTipo: number;
};

export type ControlKpis = {
  liberadas: number;
  enProceso: number;
  atrasadas: number;
  completadas: number;
  eficiencia: number;
};

export type EpicorSyncInfo = {
  ok: boolean;
  synchronizedAt: string;
  otsConsultadas: number;
  procesosActualizados: number;
  procesosConError: number;
  mensaje: string | null;
};

export type ControlProduccionResult = {
  rows: ProductionRow[];
  kpis: ControlKpis;
  sync: EpicorSyncInfo;
};

// ==========================================================
// TIPOS EPICOR
// ==========================================================

type EpicorResponse = Awaited<ReturnType<typeof getOtsFromEpicor>>;
type EpicorOt = EpicorResponse["items"][number];
type EpicorEnsamble = EpicorOt["ensambles"][number];
type EpicorOperacion = EpicorEnsamble["operaciones"][number];

// ==========================================================
// TIPOS DB
// ==========================================================

type SyncDbRow = {
  id: string | number;
  ot: string;
  assembly_seq: string | number;
  opr_seq: string | number;
  ovs: unknown;
};

type ControlDbRow = {
  id: string | number;
  cliente: string | null;
  proyecto: string | null;
  ov: string | null;
  ot: string;
  plano: string | null;
  operacion: string | null;
  maquina: string | null;
  ensamble: string | null;
  responsable: string | null;
  tiempo_estimado_horas: string | number | null;
  cantidad_programada: string | number | null;
  cantidad_producida: string | number | null;
  cantidad_faltante: string | number | null;
  area_primera: string | null;
  estado: ProductionStatus;
  prioridad_trabajo: string | number | null;
  tipo_proceso: string | null;
  posicion_tipo: string | number;
};

type KpiDbRow = {
  liberadas: string | number;
  en_proceso: string | number;
  atrasadas: string | number;
  completadas: string | number;
  total_programado: string | number;
  total_producido: string | number;
};

// ==========================================================
// CONFIGURACION DE SINCRONIZACION
// ==========================================================

const SYNC_TTL_MS = 10_000;
const EPICOR_CONCURRENCY = 4;

let syncInFlight: Promise<EpicorSyncInfo> | null = null;
let lastSyncAt = 0;
let lastSyncResult: EpicorSyncInfo | null = null;

// ==========================================================
// HELPERS
// ==========================================================

const toNumber = (
  value: string | number | null | undefined,
): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNonNegativeNumber = (
  value: string | number | null | undefined,
): number => Math.max(toNumber(value), 0);

const safeText = (
  value: string | null | undefined,
  fallback: string,
): string => {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
};

const normalize = (value: string): string =>
  value.trim().toUpperCase();

const formatHours = (
  value: string | number | null | undefined,
): string => {
  const hours = toNonNegativeNumber(value);
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${wholeHours}h ${String(minutes).padStart(2, "0")}m`;
};

/**
 * Calcula el tiempo que realmente falta para completar el proceso.
 *
 * Regla:
 *   tiempo_restante = tiempo_total_estimado * (cantidad_faltante / cantidad_programada)
 *
 * Si Ingenieria dejo el tiempo estimado en 0, no inventamos un tiempo.
 */
const calculateRemainingHours = (
  totalEstimatedHours: string | number | null | undefined,
  programmedQuantity: string | number | null | undefined,
  remainingQuantity: string | number | null | undefined,
): number => {
  const totalHours = toNonNegativeNumber(totalEstimatedHours);
  const programmed = toNonNegativeNumber(programmedQuantity);
  const remaining = toNonNegativeNumber(remainingQuantity);

  if (totalHours <= 0 || programmed <= 0 || remaining <= 0) {
    return 0;
  }

  const effectiveRemaining = Math.min(remaining, programmed);

  return totalHours * (effectiveRemaining / programmed);
};

const parseOvArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter(
          (item) => Number.isSafeInteger(item) && item > 0,
        ),
    ),
  );
};

const epicorOvs = (ot: EpicorOt): number[] =>
  (ot.ovs ?? [])
    .map((item) => Number(item.ov))
    .filter(
      (item) => Number.isSafeInteger(item) && item > 0,
    );

const findExactEpicorOt = (
  response: EpicorResponse,
  ot: string,
  internalOvs: number[],
): EpicorOt => {
  const exactCandidates = response.items.filter(
    (item) => normalize(item.ot) === normalize(ot),
  );

  if (exactCandidates.length === 0) {
    throw new Error(`La OT ${ot} no fue encontrada en Epicor.`);
  }

  if (exactCandidates.length === 1) {
    return exactCandidates[0]!;
  }

  // Si el mismo JobNum existe en mas de una Company, usamos la OV
  // como criterio adicional de desambiguacion. La OV NO reemplaza
  // la llave operativa OT + AssemblySeq + OprSeq.
  if (internalOvs.length > 0) {
    const internalOvSet = new Set(internalOvs);

    const byOv = exactCandidates.filter((candidate) =>
      epicorOvs(candidate).some((ov) => internalOvSet.has(ov)),
    );

    if (byOv.length === 1) {
      return byOv[0]!;
    }

    const openByOv = byOv.filter((candidate) => !candidate.jobClosed);

    if (openByOv.length === 1) {
      return openByOv[0]!;
    }
  }

  const openCandidates = exactCandidates.filter(
    (candidate) => !candidate.jobClosed,
  );

  if (openCandidates.length === 1) {
    return openCandidates[0]!;
  }

  throw new Error(
    `La OT ${ot} existe mas de una vez en Epicor y no fue posible identificar de forma segura la Company usando sus OVs.`,
  );
};


// ==========================================================
// CICLO DE VIDA DE LA OT
// ==========================================================

/**
 * Un Job solo se considera ACTIVO para sincronización detallada cuando
 * cumple simultáneamente las mismas reglas que getOtsFromEpicor():
 *
 * - JobReleased = 1
 * - JobClosed   = 0
 * - JobComplete = 0
 * - ProdQty     > 0
 *
 * Cualquier otro estado se considera inactivo para la sincronización
 * de ensambles/operaciones, aunque el Job siga existiendo en JobHead.
 */
const isEpicorJobActive = (
  lifecycle: EpicorJobLifecycle,
): boolean =>
  Boolean(lifecycle.jobReleased) &&
  !Boolean(lifecycle.jobClosed) &&
  !Boolean(lifecycle.jobComplete) &&
  toNonNegativeNumber(lifecycle.prodQty) > 0;

const getEpicorInactiveReason = (
  lifecycle: EpicorJobLifecycle,
): string => {
  const reasons: string[] = [];

  if (!lifecycle.jobReleased) {
    reasons.push('JobReleased = 0');
  }

  if (lifecycle.jobClosed) {
    reasons.push('JobClosed = 1');
  }

  if (lifecycle.jobComplete) {
    reasons.push('JobComplete = 1');
  }

  if (toNonNegativeNumber(lifecycle.prodQty) <= 0) {
    reasons.push(`ProdQty = ${toNonNegativeNumber(lifecycle.prodQty)}`);
  }

  return reasons.length > 0
    ? reasons.join(', ')
    : 'estado no activo';
};

const findLifecycleCandidate = (
  candidates: EpicorJobLifecycle[],
  internalOvs: number[],
): EpicorJobLifecycle | null => {
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0]!;
  }

  // Si el mismo JobNum existe en varias Company, usamos primero
  // las OVs guardadas en PostgreSQL para identificar la correcta.
  if (internalOvs.length > 0) {
    const internalOvSet = new Set(internalOvs);

    const byOv = candidates.filter((candidate) =>
      candidate.ovs.some((ov) => internalOvSet.has(ov)),
    );

    if (byOv.length === 1) {
      return byOv[0]!;
    }

    const activeByOv = byOv.filter(isEpicorJobActive);

    if (activeByOv.length === 1) {
      return activeByOv[0]!;
    }

    const openByOv = byOv.filter((candidate) => !candidate.jobClosed);

    if (openByOv.length === 1) {
      return openByOv[0]!;
    }
  }

  // Sin una OV concluyente, preferimos un único Job activo.
  const activeCandidates = candidates.filter(isEpicorJobActive);

  if (activeCandidates.length === 1) {
    return activeCandidates[0]!;
  }

  // Si no hay activo con cantidad, un único Job abierto también
  // es una selección segura (por ejemplo ProdQty = 0).
  const openCandidates = candidates.filter(
    (candidate) => !candidate.jobClosed,
  );

  if (openCandidates.length === 1) {
    return openCandidates[0]!;
  }

  // Si todas las coincidencias están cerradas, el resultado operativo
  // es el mismo para el planner: debe dejar de mostrarse.
  if (candidates.every((candidate) => candidate.jobClosed)) {
    return candidates[0]!;
  }

  return null;
};

const updateOtLifecycle = async (
  ot: string,
  lifecycle: EpicorJobLifecycle,
): Promise<void> => {
  await pool.query(
    `
      UPDATE ots
      SET
        job_released = $2,
        job_closed = $3,
        job_complete = $4
      WHERE ot = $1;
    `,
    [
      ot,
      Boolean(lifecycle.jobReleased),
      Boolean(lifecycle.jobClosed),
      Boolean(lifecycle.jobComplete),
    ],
  );
};

// ==========================================================
// PRIORIDAD
// ==========================================================
//
// La prioridad ya NO se administra en ots.prioridad.
// Se obtiene dinamicamente desde public.prioridades_ov a traves de
// las OVs relacionadas con la OT. Por eso la sincronizacion Epicor
// no modifica ni libera prioridades.
// ==========================================================

const markProcessesSyncOk = async (
  processIds: number[],
): Promise<void> => {
  if (processIds.length === 0) {
    return;
  }

  await pool.query(
    `
      UPDATE procesos
      SET
        sincronizacion_epicor_ok = TRUE,
        error_sincronizacion_epicor = NULL,
        ultima_sincronizacion_epicor = CURRENT_TIMESTAMP
      WHERE id = ANY($1::BIGINT[]);
    `,
    [processIds],
  );
};

const markOtWithoutProduction = async (
  processIds: number[],
): Promise<void> => {
  if (processIds.length === 0) {
    return;
  }

  // NO cerramos la OT. Solamente llevamos sus cantidades/tiempos
  // productivos a cero para retirarla de la vista. Como sigue abierta,
  // getProcessesToSync() continuará revisándola y podrá reaparecer si
  // Epicor vuelve a colocar ProdQty > 0.
  await pool.query(
    `
      UPDATE procesos
      SET
        cantidad_programada = 0,
        cantidad_producida = 0,
        tiempo_estimado_horas = 0,
        tiempo_unitario_horas = 0,
        tiempo_producido_horas = 0,
        sincronizacion_epicor_ok = TRUE,
        error_sincronizacion_epicor = NULL,
        ultima_sincronizacion_epicor = CURRENT_TIMESTAMP
      WHERE id = ANY($1::BIGINT[]);
    `,
    [processIds],
  );
};

const findEpicorOperation = (
  epicorOt: EpicorOt,
  assemblySeq: number,
  oprSeq: number,
): EpicorOperacion | null => {
  const assembly = (epicorOt.ensambles ?? []).find(
    (item) => Number(item.assemblySeq) === assemblySeq,
  );

  if (!assembly) {
    return null;
  }

  return (
    (assembly.operaciones ?? []).find(
      (item) => Number(item.oprSeq) === oprSeq,
    ) ?? null
  );
};

const getMachineText = (operation: EpicorOperacion): string | null => {
  const principal = operation.maquina?.trim();

  if (principal) {
    return principal;
  }

  const machines = (operation.maquinas ?? [])
    .map((item) => item.trim())
    .filter(Boolean);

  return machines.length > 0 ? machines.join(" / ") : null;
};

// ==========================================================
// PROCESOS A SINCRONIZAR
//
// IMPORTANTE:
// Aquí NO filtramos por job_released ni por cantidad faltante.
// Un Job no liberado o con ProdQty = 0 debe seguir entrando a la
// consulta liviana de ciclo de vida, para poder detectar si luego
// vuelve a activarse.
//
// Los Jobs cerrados sí quedan fuera, porque ya fueron retirados
// definitivamente del planner por su estado JobClosed.
// ==========================================================

const getProcessesToSync = async (): Promise<SyncDbRow[]> => {
  const result = await pool.query<SyncDbRow>(`
    SELECT
      p.id,
      ot.ot,
      e.assembly_seq,
      p.opr_seq,
      COALESCE(
        ARRAY(
          SELECT DISTINCT ov.numero_ov
          FROM ovs AS ov
          WHERE ov.id_ot = ot.id
          ORDER BY ov.numero_ov
        ),
        ARRAY[]::BIGINT[]
      ) AS ovs
    FROM procesos AS p
    INNER JOIN ensambles AS e
      ON e.id = p.id_ensamble
    INNER JOIN ots AS ot
      ON ot.id = e.id_ot
    WHERE
      ot.job_closed = FALSE
    ORDER BY
      ot.ot,
      e.assembly_seq,
      p.opr_seq;
  `);

  return result.rows;
};

const markSyncError = async (
  processIds: number[],
  message: string,
): Promise<void> => {
  if (processIds.length === 0) {
    return;
  }

  try {
    await pool.query(
      `
        UPDATE procesos
        SET
          sincronizacion_epicor_ok = FALSE,
          error_sincronizacion_epicor = $2,
          ultima_sincronizacion_epicor = CURRENT_TIMESTAMP
        WHERE id = ANY($1::BIGINT[]);
      `,
      [processIds, message.slice(0, 4000)],
    );
  } catch (error) {
    console.error(
      "No fue posible registrar el error de sincronizacion Epicor:",
      error,
    );
  }
};

const updateProcessFromEpicor = async (
  processId: number,
  operation: EpicorOperacion,
): Promise<void> => {
  await pool.query(
    `
      UPDATE procesos
      SET
        op_code = $2,
        op_desc = $3,
        maquina = $4,
        cantidad_programada = $5,
        cantidad_producida = $6,
        tiempo_estimado_horas = $7,
        tiempo_unitario_horas = $8,
        tiempo_producido_horas = $9,
        sincronizacion_epicor_ok = TRUE,
        error_sincronizacion_epicor = NULL,
        ultima_sincronizacion_epicor = CURRENT_TIMESTAMP
      WHERE id = $1;
    `,
    [
      processId,
      operation.opCode?.trim() || null,
      operation.opDesc?.trim() || null,
      getMachineText(operation),
      toNonNegativeNumber(operation.cantidadProgramada),
      toNonNegativeNumber(operation.cantidadProducida),
      toNonNegativeNumber(operation.tiempoEstimadoHoras),
      toNonNegativeNumber(operation.tiempoUnitarioHoras),
      toNonNegativeNumber(operation.tiempoProducidoHoras),
    ],
  );
};

const syncSingleOt = async (
  rows: SyncDbRow[],
): Promise<{
  updated: number;
  errors: number;
}> => {
  const first = rows[0];

  if (!first) {
    return { updated: 0, errors: 0 };
  }

  const ot = first.ot.trim();
  const processIds = rows
    .map((row) => toNumber(row.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  const internalOvs = parseOvArray(first.ovs);

  try {
    // ======================================================
    // 1. LEER JOBHEAD SIN EL FILTRO ProdQty > 0
    // ======================================================
    const lifecycleCandidates = await getJobLifecycleFromEpicor(ot);

    if (lifecycleCandidates.length === 0) {
      const message =
        `La OT ${ot} no existe en ERP10.Erp.JobHead de Epicor.`;

      console.error(`Error sincronizando OT ${ot}: ${message}`);
      await markSyncError(processIds, message);

      return {
        updated: 0,
        errors: processIds.length,
      };
    }

    const lifecycle = findLifecycleCandidate(
      lifecycleCandidates,
      internalOvs,
    );

    if (!lifecycle) {
      const companies = lifecycleCandidates
        .map((candidate) => candidate.company)
        .filter(Boolean)
        .join(", ");

      const message =
        `La OT ${ot} existe en varias Company de Epicor (${companies || "sin Company"}) ` +
        "y no fue posible identificar de forma segura cuál corresponde a PostgreSQL.";

      console.error(`Error sincronizando OT ${ot}: ${message}`);
      await markSyncError(processIds, message);

      return {
        updated: 0,
        errors: processIds.length,
      };
    }

    // Siempre conservamos en PostgreSQL el estado real de JobHead.
    await updateOtLifecycle(ot, lifecycle);

    // ======================================================
    // 2. VALIDAR SI EL JOB SIGUE ACTIVO ANTES DE SINCRONIZAR
    //
    // Regla:
    //   JobReleased = 1
    //   JobClosed   = 0
    //   JobComplete = 0
    //   ProdQty     > 0
    //
    // Si NO cumple, NO llamamos getOtsFromEpicor(), porque esa función
    // filtra precisamente por estas condiciones. Esto evita el falso
    // error "La OT ... no fue encontrada en Epicor" cuando el Job sí
    // existe, pero ya dejó de estar activo.
    // ======================================================
    if (!isEpicorJobActive(lifecycle)) {
      const reason = getEpicorInactiveReason(lifecycle);

      // Si está completo o quedó sin producción, llevamos los valores
      // productivos locales a cero para que deje de mostrarse por cantidad.
      //
      // Para JobReleased = 0 no borramos las cantidades históricas:
      // el Home ya lo oculta porque exige ot.job_released = TRUE.
      //
      // Para JobClosed = 1 tampoco borramos cantidades históricas:
      // el Home lo oculta porque exige ot.job_closed = FALSE.
      if (
        lifecycle.jobComplete ||
        toNonNegativeNumber(lifecycle.prodQty) <= 0
      ) {
        await markOtWithoutProduction(processIds);
      } else {
        // Limpia errores antiguos de sincronización, ya que este estado
        // no es una falla: simplemente el Job dejó de ser administrable.
        await markProcessesSyncOk(processIds);
      }

      console.log(
        `[Epicor] OT ${ot} omitida de sincronización detallada: ${reason}.`,
      );

      return {
        updated: processIds.length,
        errors: 0,
      };
    }

    // ======================================================
    // 3. JOB ACTIVO: SINCRONIZACIÓN DETALLADA
    // ======================================================
    const epicorResponse = await getOtsFromEpicor({
      search: ot,
      page: 1,
      pageSize: 100,
    });

    const epicorOt = findExactEpicorOt(
      epicorResponse,
      ot,
      internalOvs,
    );

    await pool.query(
      `
        UPDATE ots
        SET
          job_released = $2,
          job_closed = $3,
          job_complete = $4
        WHERE ot = $1;
      `,
      [
        ot,
        Boolean(epicorOt.jobReleased),
        Boolean(epicorOt.jobClosed),
        Boolean(epicorOt.jobComplete),
      ],
    );

    let updated = 0;
    let errors = 0;

    for (const row of rows) {
      const processId = toNumber(row.id);
      const assemblySeq = toNumber(row.assembly_seq);
      const oprSeq = toNumber(row.opr_seq);

      const operation = findEpicorOperation(
        epicorOt,
        assemblySeq,
        oprSeq,
      );

      if (!operation) {
        errors += 1;

        await markSyncError(
          [processId],
          `Epicor no devolvio la operacion OT ${ot}, AssemblySeq ${assemblySeq}, OprSeq ${oprSeq}.`,
        );

        continue;
      }

      await updateProcessFromEpicor(processId, operation);
      updated += 1;
    }

    if (errors === 0) {
    }

    return { updated, errors };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Error desconocido consultando Epicor para la OT ${ot}.`;

    console.error(`Error sincronizando OT ${ot}:`, error);

    await markSyncError(processIds, message);

    return {
      updated: 0,
      errors: processIds.length,
    };
  }
};

const executeEpicorSync = async (): Promise<EpicorSyncInfo> => {
  const rows = await getProcessesToSync();

  const grouped = new Map<string, SyncDbRow[]>();

  for (const row of rows) {
    const key = row.ot.trim();
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  const groups = Array.from(grouped.values());
  let nextIndex = 0;
  let procesosActualizados = 0;
  let procesosConError = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      const group = groups[index];

      if (!group) {
        return;
      }

      const result = await syncSingleOt(group);
      procesosActualizados += result.updated;
      procesosConError += result.errors;
    }
  };

  const workerCount = Math.min(
    EPICOR_CONCURRENCY,
    Math.max(groups.length, 1),
  );

  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );

  const synchronizedAt = new Date().toISOString();
  const ok = procesosConError === 0;

  return {
    ok,
    synchronizedAt,
    otsConsultadas: groups.length,
    procesosActualizados,
    procesosConError,
    mensaje: ok
      ? null
      : `${procesosConError} proceso(s) no pudieron sincronizarse con Epicor. Se conservaron los ultimos valores validos en PostgreSQL.`,
  };
};

const synchronizeEpicor = async (): Promise<EpicorSyncInfo> => {
  const now = Date.now();

  if (
    lastSyncResult &&
    now - lastSyncAt < SYNC_TTL_MS
  ) {
    return lastSyncResult;
  }

  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = executeEpicorSync()
    .then((result) => {
      lastSyncResult = result;
      lastSyncAt = Date.now();
      return result;
    })
    .finally(() => {
      syncInFlight = null;
    });

  return syncInFlight;
};

// ==========================================================
// CONTROL DE PRODUCCION
// ==========================================================
//
// 1. Sincroniza cantidades y tiempos desde Epicor.
// 2. PostgreSQL recalcula cantidad_faltante automaticamente.
// 3. Devuelve SOLO actividades pendientes asignadas.
// 4. Un proceso con cantidad_faltante = 0 deja de salir del planner.
//
// La llave operativa es:
//   OT / JobNum + AssemblySeq + OprSeq
//
// La OV se usa para dos cosas:
// 1. desambiguar una OT que exista en mas de una Company de Epicor;
// 2. heredar la prioridad operativa desde public.prioridades_ov.
// ==========================================================

export const getControlProduccion =
  async (): Promise<ControlProduccionResult> => {
    const sync = await synchronizeEpicor();

    const result = await pool.query<ControlDbRow>(`
      WITH pendientes AS (
        SELECT
          p.id,
          comercial.clientes AS cliente,
          ot.proyecto,
          comercial.ovs AS ov,
          ot.ot,
          COALESCE(
            NULLIF(TRIM(e.plano), ''),
            NULLIF(TRIM(ot.plano), '')
          ) AS plano,
          COALESCE(
            NULLIF(TRIM(p.op_desc), ''),
            NULLIF(TRIM(p.op_code), '')
          ) AS operacion,
          COALESCE(
            NULLIF(BTRIM(p.op_code), ''),
            NULLIF(BTRIM(p.op_desc), ''),
            'SIN_TIPO'
          ) AS tipo_proceso,
          p.maquina,
          e.ensamble,
          CONCAT_WS(
            ' / ',
            CASE
              WHEN NULLIF(BTRIM(p.lider), '') IS NOT NULL
                THEN BTRIM(p.lider) || ' (Lider)'
              ELSE NULL
            END,
            equipo.responsables
          ) AS responsable,
          p.tiempo_estimado_horas,
          p.cantidad_programada,
          p.cantidad_producida,
          p.cantidad_faltante,
          a.area AS area_primera,
          p.id_area,
          e.assembly_seq,
          p.opr_seq,
          prioridad_ov.prioridad_trabajo AS prioridad_trabajo,
          CASE
            WHEN COALESCE(p.cantidad_producida, 0) > 0
              THEN 'En proceso'
            WHEN ot.fecha_inicio < CURRENT_DATE
              THEN 'Atrasada'
            ELSE 'Liberada'
          END AS estado,
          CASE
            WHEN COALESCE(p.cantidad_producida, 0) > 0 THEN 2
            WHEN ot.fecha_inicio < CURRENT_DATE THEN 1
            ELSE 3
          END AS orden_estado
        FROM procesos AS p
        INNER JOIN ensambles AS e
          ON e.id = p.id_ensamble
        INNER JOIN ots AS ot
          ON ot.id = e.id_ot
        LEFT JOIN areas AS a
          ON a.id = p.id_area

        -- La prioridad pertenece a la OV, no a la OT.
        -- Como el modelo actual relaciona proceso -> ensamble -> OT y una OT
        -- puede tener varias OVs, usamos la prioridad mas urgente (MIN).
        -- Si una OT tiene una sola OV, el proceso recibe exactamente esa prioridad.
        LEFT JOIN LATERAL (
          SELECT
            MIN(po.prioridad)::INTEGER AS prioridad_trabajo
          FROM ovs AS ov_prioridad
          INNER JOIN prioridades_ov AS po
            ON po.numero_ov = ov_prioridad.numero_ov
          WHERE
            ov_prioridad.id_ot = ot.id
            AND po.prioridad IS NOT NULL
        ) AS prioridad_ov
          ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            string_agg(
              DISTINCT ov.numero_ov::text,
              ' / '
              ORDER BY ov.numero_ov::text
            ) AS ovs,
            string_agg(
              DISTINCT c.nombre_cliente,
              ' / '
              ORDER BY c.nombre_cliente
            ) AS clientes
          FROM ovs AS ov
          LEFT JOIN clientes AS c
            ON c.id_ov = ov.id
          WHERE ov.id_ot = ot.id
        ) AS comercial
          ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            string_agg(
              DISTINCT BTRIM(pr.nombre),
              ' / '
              ORDER BY BTRIM(pr.nombre)
            ) AS responsables
          FROM procesos_responsables AS pr
          WHERE
            pr.id_proceso = p.id
            AND NULLIF(BTRIM(pr.nombre), '') IS NOT NULL
        ) AS equipo
          ON TRUE
        WHERE
          ot.job_released = TRUE
          AND ot.job_closed = FALSE
          AND ot.job_complete = FALSE
          AND p.id_area IS NOT NULL
          AND NULLIF(BTRIM(p.lider), '') IS NOT NULL
          AND COALESCE(p.cantidad_faltante, 0) > 0
      )
      SELECT
        pendientes.id,
        pendientes.cliente,
        pendientes.proyecto,
        pendientes.ov,
        pendientes.ot,
        pendientes.plano,
        pendientes.operacion,
        pendientes.maquina,
        pendientes.ensamble,
        pendientes.responsable,
        pendientes.tiempo_estimado_horas,
        pendientes.cantidad_programada,
        pendientes.cantidad_producida,
        pendientes.cantidad_faltante,
        pendientes.area_primera,
        pendientes.estado,
        pendientes.prioridad_trabajo,
        pendientes.tipo_proceso,
        ROW_NUMBER() OVER (
          PARTITION BY
            pendientes.id_area,
            pendientes.tipo_proceso
          ORDER BY
            pendientes.prioridad_trabajo ASC NULLS LAST,
            pendientes.ot ASC,
            pendientes.assembly_seq ASC,
            pendientes.opr_seq ASC,
            pendientes.id ASC
        ) AS posicion_tipo
      FROM pendientes
      ORDER BY
        pendientes.prioridad_trabajo ASC NULLS LAST,
        pendientes.orden_estado ASC,
        pendientes.ot ASC,
        pendientes.assembly_seq ASC,
        pendientes.opr_seq ASC;
    `);

    const rows = result.rows.map<ProductionRow>((row) => {
      const tiempoTotalHoras = toNonNegativeNumber(
        row.tiempo_estimado_horas,
      );
      const cantProg = toNonNegativeNumber(row.cantidad_programada);
      const cantProd = toNonNegativeNumber(row.cantidad_producida);
      const cantFal = toNonNegativeNumber(row.cantidad_faltante);
      const tiempoRestanteHoras = calculateRemainingHours(
        tiempoTotalHoras,
        cantProg,
        cantFal,
      );

      return {
        id: toNumber(row.id),
        cliente: safeText(row.cliente, "Sin cliente"),
        proyecto: safeText(row.proyecto, "Sin proyecto"),
        ov: safeText(row.ov, "Sin OV"),
        ot: safeText(row.ot, "Sin OT"),
        plano: safeText(row.plano, "Sin plano"),
        operacion: safeText(row.operacion, "Sin operacion"),
        maquina: safeText(row.maquina, "Sin maquina"),
        ensamble: safeText(row.ensamble, "Sin ensamble"),
        responsable: safeText(row.responsable, "Sin responsable"),

        // `tiempo` conserva la semantica anterior para no romper clientes.
        tiempo: formatHours(tiempoTotalHoras),
        tiempoTotal: formatHours(tiempoTotalHoras),
        tiempoRestante: formatHours(tiempoRestanteHoras),
        tiempoTotalHoras,
        tiempoRestanteHoras,
        tiempoSinDefinir: cantFal > 0 && tiempoTotalHoras <= 0,

        cantProg,
        cantProd,
        cantFal,
        areaPrimera: safeText(row.area_primera, "Sin area"),
        estado: row.estado,
        prioridadTrabajo:
          row.prioridad_trabajo == null
            ? null
            : toNumber(row.prioridad_trabajo),
        tipoProceso: safeText(row.tipo_proceso, "SIN_TIPO"),
        posicionTipo: toNumber(row.posicion_tipo),
      };
    });

    // KPIs sobre todos los procesos asignados, incluidos los ya terminados.
    const kpiResult = await pool.query<KpiDbRow>(`
      SELECT
        COUNT(*) FILTER (
          WHERE
            COALESCE(p.cantidad_faltante, 0) > 0
            AND COALESCE(p.cantidad_producida, 0) = 0
            AND ot.fecha_inicio >= CURRENT_DATE
            AND ot.job_closed = FALSE
            AND ot.job_complete = FALSE
        ) AS liberadas,
        COUNT(*) FILTER (
          WHERE
            COALESCE(p.cantidad_faltante, 0) > 0
            AND COALESCE(p.cantidad_producida, 0) > 0
            AND ot.job_closed = FALSE
            AND ot.job_complete = FALSE
        ) AS en_proceso,
        COUNT(*) FILTER (
          WHERE
            COALESCE(p.cantidad_faltante, 0) > 0
            AND COALESCE(p.cantidad_producida, 0) = 0
            AND ot.fecha_inicio < CURRENT_DATE
            AND ot.job_closed = FALSE
            AND ot.job_complete = FALSE
        ) AS atrasadas,
        COUNT(*) FILTER (
          WHERE
            ot.job_closed = FALSE
            AND COALESCE(p.cantidad_programada, 0) > 0
            AND COALESCE(p.cantidad_faltante, 0) <= 0
        ) AS completadas,
        COALESCE(SUM(GREATEST(COALESCE(p.cantidad_programada, 0), 0)), 0)
          AS total_programado,
        COALESCE(
          SUM(
            LEAST(
              GREATEST(COALESCE(p.cantidad_producida, 0), 0),
              GREATEST(COALESCE(p.cantidad_programada, 0), 0)
            )
          ),
          0
        ) AS total_producido
      FROM procesos AS p
      INNER JOIN ensambles AS e
        ON e.id = p.id_ensamble
      INNER JOIN ots AS ot
        ON ot.id = e.id_ot
      WHERE
        p.id_area IS NOT NULL
        AND NULLIF(BTRIM(p.lider), '') IS NOT NULL;
    `);

    const kpi = kpiResult.rows[0];
    const totalProgramado = toNumber(kpi?.total_programado);
    const totalProducido = toNumber(kpi?.total_producido);

    return {
      rows,
      kpis: {
        liberadas: toNumber(kpi?.liberadas),
        enProceso: toNumber(kpi?.en_proceso),
        atrasadas: toNumber(kpi?.atrasadas),
        completadas: toNumber(kpi?.completadas),
        eficiencia:
          totalProgramado > 0
            ? Math.round((totalProducido / totalProgramado) * 100)
            : 0,
      },
      sync,
    };
  };
