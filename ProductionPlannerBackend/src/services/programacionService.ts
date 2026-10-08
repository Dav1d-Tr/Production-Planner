//programacionService.ts

import type { PoolClient } from "pg";

import pool from "../config/database";
import { getOtsFromEpicor } from "./otsservice";

// ==========================================================
// TIPOS PUBLICOS
// ==========================================================

export type ProgramarOtInput = {
  ot: string;
  company: string;
  fecha: string;
  ov?: number | null;

  /**
   * Nombre del proyecto que se guardará en PostgreSQL.
   *
   * - undefined: usar el proyecto obtenido de ERP10.Erp.QuoteHed.PONum.
   * - string: guardar el texto enviado por el usuario.
   * - null o cadena vacía: guardar el proyecto como NULL.
   */
  proyecto?: string | null;

  ensambles: Array<{
    assemblySeq: number;
  }>;
};

export type ProgramarOtResult = {
  idOt: number;
  ot: string;
  estado: "Programada";
  fechaInicio: string;
  ovPrincipal: number | null;
  proyectoGuardado: string | null;
  ovsGuardadas: number;
  ensamblesGuardados: number;
  procesosGuardados: number;
};

export class ProgramacionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ProgramacionError";
    this.statusCode = statusCode;
  }
}

// ==========================================================
// TIPOS INTERNOS
// ==========================================================

type EpicorResponse = Awaited<ReturnType<typeof getOtsFromEpicor>>;
type EpicorOt = EpicorResponse["items"][number];
type EpicorEnsamble = EpicorOt["ensambles"][number];
type EpicorOperacion = EpicorEnsamble["operaciones"][number];

type IdRow = {
  id: string | number;
};

// ==========================================================
// UTILIDADES
// ==========================================================

const normalizeText = (
  value: string | null | undefined
): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const toNonNegativeNumber = (
  value: number | string | null | undefined
): number => {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(parsed, 0);
};

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const getRequiredId = (
  rows: ReadonlyArray<IdRow>,
  entityName: string
): number => {
  const id = Number(rows[0]?.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ProgramacionError(
      `PostgreSQL no devolvió un id válido para ${entityName}.`,
      500
    );
  }

  return id;
};

// ==========================================================
// VALIDACION DE ENTRADA
// ==========================================================

const validateInput = (input: ProgramarOtInput): void => {
  if (!input || typeof input !== "object") {
    throw new ProgramacionError(
      "El cuerpo de la solicitud es obligatorio."
    );
  }

  if (!normalizeText(input.ot)) {
    throw new ProgramacionError("La OT es obligatoria.");
  }

  if (!normalizeText(input.company)) {
    throw new ProgramacionError("La compañía es obligatoria.");
  }

  if (
    typeof input.fecha !== "string" ||
    !isValidIsoDate(input.fecha)
  ) {
    throw new ProgramacionError(
      "La fecha inicial debe tener formato YYYY-MM-DD y ser una fecha válida."
    );
  }

  if (
    input.ov !== undefined &&
    input.ov !== null &&
    (!Number.isSafeInteger(Number(input.ov)) || Number(input.ov) <= 0)
  ) {
    throw new ProgramacionError("La OV enviada no es válida.");
  }

  if (
    input.proyecto !== undefined &&
    input.proyecto !== null &&
    typeof input.proyecto !== "string"
  ) {
    throw new ProgramacionError(
      "El proyecto debe ser texto, null o no enviarse."
    );
  }

  if (!Array.isArray(input.ensambles) || input.ensambles.length === 0) {
    throw new ProgramacionError(
      "Debes seleccionar al menos un ensamble."
    );
  }

  const assemblySeqs = input.ensambles.map((item) =>
    Number(item?.assemblySeq)
  );

  if (
    assemblySeqs.some(
      (assemblySeq) =>
        !Number.isSafeInteger(assemblySeq) || assemblySeq < 0
    )
  ) {
    throw new ProgramacionError(
      "Todos los assemblySeq deben ser enteros válidos."
    );
  }

  if (new Set(assemblySeqs).size !== assemblySeqs.length) {
    throw new ProgramacionError(
      "No debes enviar el mismo ensamble más de una vez."
    );
  }
};

// ==========================================================
// EPICOR
// ==========================================================

const getExactOtFromEpicor = async (
  ot: string,
  company: string
): Promise<EpicorOt> => {
  const normalizedOt = ot.trim();
  const normalizedCompany = company.trim().toUpperCase();

  const response = await getOtsFromEpicor({
    search: normalizedOt,
    page: 1,
    pageSize: 100,
  });

  const exactOt = response.items.find(
    (item) =>
      item.ot.trim() === normalizedOt &&
      item.company.trim().toUpperCase() === normalizedCompany
  );

  if (!exactOt) {
    throw new ProgramacionError(
      `La OT ${normalizedOt} no fue encontrada en Epicor para la compañía ${company}.`,
      404
    );
  }

  return exactOt;
};

// ==========================================================
// POSTGRESQL - ESTADO PROGRAMADA
// ==========================================================

const getProgramadaStateId = async (
  client: PoolClient
): Promise<number> => {
  const result = await client.query<IdRow>(
    `
      INSERT INTO estados (
        estado,
        descripcion,
        activo
      )
      VALUES (
        'Programada',
        'OT programada desde el coordinador de producción',
        TRUE
      )
      ON CONFLICT (estado)
      DO UPDATE SET
        descripcion = EXCLUDED.descripcion,
        activo = TRUE
      RETURNING id;
    `
  );

  return getRequiredId(result.rows, "estado Programada");
};

// ==========================================================
// POSTGRESQL - OT
// ==========================================================

const upsertOt = async (
  client: PoolClient,
  epicorOt: EpicorOt,
  fechaInicio: string,
  idEstado: number,
  proyecto: string | null
): Promise<number> => {
  const result = await client.query<IdRow>(
    `
      INSERT INTO ots (
        ot,
        part_num,
        part_description,
        plano,
        prod_code,
        proyecto,
        fecha_inicio,
        fecha_fin,
        id_estado,
        job_released,
        job_closed,
        job_complete
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::date,
        NULL,
        $8,
        $9,
        $10,
        $11
      )
      ON CONFLICT (ot)
      DO UPDATE SET
        part_num = EXCLUDED.part_num,
        part_description = EXCLUDED.part_description,
        plano = EXCLUDED.plano,
        prod_code = EXCLUDED.prod_code,
        proyecto = EXCLUDED.proyecto,
        fecha_inicio = EXCLUDED.fecha_inicio,
        id_estado = EXCLUDED.id_estado,
        job_released = EXCLUDED.job_released,
        job_closed = EXCLUDED.job_closed,
        job_complete = EXCLUDED.job_complete
      RETURNING id;
    `,
    [
      epicorOt.ot.trim(),
      normalizeText(epicorOt.partNum),
      normalizeText(epicorOt.partDescription),
      normalizeText(epicorOt.plano),
      normalizeText(epicorOt.prodCode),
      proyecto,
      fechaInicio,
      idEstado,
      Boolean(epicorOt.jobReleased),
      Boolean(epicorOt.jobClosed),
      Boolean(epicorOt.jobComplete),
    ]
  );

  return getRequiredId(result.rows, `OT ${epicorOt.ot}`);
};

// ==========================================================
// POSTGRESQL - OV
// ==========================================================

const upsertOv = async (
  client: PoolClient,
  idOt: number,
  numeroOv: number
): Promise<number> => {
  const result = await client.query<IdRow>(
    `
      INSERT INTO ovs (
        id_ot,
        numero_ov
      )
      VALUES ($1, $2)
      ON CONFLICT (id_ot, numero_ov)
      DO UPDATE SET
        numero_ov = EXCLUDED.numero_ov
      RETURNING id;
    `,
    [idOt, numeroOv]
  );

  return getRequiredId(result.rows, `OV ${numeroOv}`);
};

// ==========================================================
// POSTGRESQL - CLIENTE
// ==========================================================

const upsertCliente = async (
  client: PoolClient,
  idOv: number,
  cliente: string | null | undefined
): Promise<void> => {
  const nombreCliente = normalizeText(cliente);

  if (!nombreCliente) {
    return;
  }

  const existing = await client.query<IdRow>(
    `
      SELECT id
      FROM clientes
      WHERE id_ov = $1
      ORDER BY id
      LIMIT 1;
    `,
    [idOv]
  );

  const existingId = Number(existing.rows[0]?.id);

  if (Number.isSafeInteger(existingId) && existingId > 0) {
    await client.query(
      `
        UPDATE clientes
        SET nombre_cliente = $2
        WHERE id = $1;
      `,
      [existingId, nombreCliente]
    );
    return;
  }

  await client.query(
    `
      INSERT INTO clientes (
        id_ov,
        nombre_cliente
      )
      VALUES ($1, $2);
    `,
    [idOv, nombreCliente]
  );
};

// ==========================================================
// POSTGRESQL - ENSAMBLE
//
// V4: el ensamble pertenece DIRECTAMENTE a la OT.
// Ya no depende de id_ov.
// ==========================================================

const upsertEnsamble = async (
  client: PoolClient,
  idOt: number,
  ensamble: EpicorEnsamble
): Promise<number> => {
  const assemblySeq = Number(ensamble.assemblySeq);

  if (!Number.isSafeInteger(assemblySeq) || assemblySeq < 0) {
    throw new ProgramacionError(
      `Epicor devolvió un AssemblySeq inválido: ${String(ensamble.assemblySeq)}.`
    );
  }

  const descripcion =
    normalizeText(ensamble.descripcion) ??
    `Ensamble ${assemblySeq}`;

  const result = await client.query<IdRow>(
    `
      INSERT INTO ensambles (
        id_ot,
        assembly_seq,
        part_num,
        ensamble,
        plano
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5
      )
      ON CONFLICT (id_ot, assembly_seq)
      DO UPDATE SET
        part_num = EXCLUDED.part_num,
        ensamble = EXCLUDED.ensamble,
        plano = EXCLUDED.plano
      RETURNING id;
    `,
    [
      idOt,
      assemblySeq,
      normalizeText(ensamble.partNum),
      descripcion,
      normalizeText(ensamble.plano),
    ]
  );

  return getRequiredId(
    result.rows,
    `ensamble ${assemblySeq} de la OT`
  );
};

// ==========================================================
// POSTGRESQL - PROCESO
//
// V4:
// - NO existe id_usuario_responsable en procesos.
// - id_area queda NULL hasta la asignacion del coordinador.
// - lider queda NULL hasta la asignacion del coordinador.
// - cantidad_faltante es GENERATED ALWAYS y NO se escribe.
// - si el proceso ya existia, se conservan id_area y lider.
// ==========================================================

const upsertProceso = async (
  client: PoolClient,
  idEnsamble: number,
  operacion: EpicorOperacion
): Promise<void> => {
  const oprSeq = Number(operacion.oprSeq);

  if (!Number.isSafeInteger(oprSeq) || oprSeq < 0) {
    throw new ProgramacionError(
      `Epicor devolvió un OprSeq inválido: ${String(operacion.oprSeq)}.`
    );
  }

  const maquinas = Array.isArray(operacion.maquinas)
    ? operacion.maquinas
    : [];

  const maquinasConcatenadas = maquinas
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0)
    .join(" / ");

  const maquina =
    normalizeText(operacion.maquina) ??
    normalizeText(maquinasConcatenadas);

  await client.query(
    `
      INSERT INTO procesos (
        id_ensamble,
        opr_seq,
        op_code,
        op_desc,
        maquina,
        cantidad_programada,
        cantidad_producida,
        tiempo_estimado_horas,
        tiempo_unitario_horas,
        tiempo_producido_horas,
        ultima_sincronizacion_epicor,
        sincronizacion_epicor_ok,
        error_sincronizacion_epicor
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        CURRENT_TIMESTAMP,
        TRUE,
        NULL
      )
      ON CONFLICT (id_ensamble, opr_seq)
      DO UPDATE SET
        op_code = EXCLUDED.op_code,
        op_desc = EXCLUDED.op_desc,
        maquina = EXCLUDED.maquina,
        cantidad_programada = EXCLUDED.cantidad_programada,
        cantidad_producida = EXCLUDED.cantidad_producida,
        tiempo_estimado_horas = EXCLUDED.tiempo_estimado_horas,
        tiempo_unitario_horas = EXCLUDED.tiempo_unitario_horas,
        tiempo_producido_horas = EXCLUDED.tiempo_producido_horas,
        ultima_sincronizacion_epicor = CURRENT_TIMESTAMP,
        sincronizacion_epicor_ok = TRUE,
        error_sincronizacion_epicor = NULL;
    `,
    [
      idEnsamble,
      oprSeq,
      normalizeText(operacion.opCode),
      normalizeText(operacion.opDesc),
      maquina,
      toNonNegativeNumber(operacion.cantidadProgramada),
      toNonNegativeNumber(operacion.cantidadProducida),
      toNonNegativeNumber(operacion.tiempoEstimadoHoras),
      toNonNegativeNumber(operacion.tiempoUnitarioHoras),
      toNonNegativeNumber(operacion.tiempoProducidoHoras),
    ]
  );
};

// ==========================================================
// SERVICIO PRINCIPAL
// ==========================================================

export const programarOt = async (
  input: ProgramarOtInput
): Promise<ProgramarOtResult> => {
  validateInput(input);

  const ot = input.ot.trim();
  const company = input.company.trim();

  // Siempre volvemos a consultar Epicor para no confiar en
  // cantidades/tiempos enviados por el frontend.
  const epicorOt = await getExactOtFromEpicor(ot, company);

  // getOtsFromEpicor resuelve `proyecto` desde:
  // ERP10.Erp.QuoteHed.PONum
  // mediante JobProd -> OrderDtl -> QuoteHed.
  //
  // Si el frontend NO envia proyecto, guardamos ese PONum.
  // Si el usuario lo modifica y lo envia (incluso null), respetamos
  // exactamente la decision del usuario para esta programacion.
  const proyectoDesdeQuote = normalizeText(epicorOt.proyecto);

  const proyectoGuardado =
    input.proyecto === undefined
      ? proyectoDesdeQuote
      : normalizeText(input.proyecto);

  if (epicorOt.jobClosed) {
    throw new ProgramacionError(
      `La OT ${ot} está cerrada en Epicor y no se puede programar.`
    );
  }

  const epicorOvs = epicorOt.ovs ?? [];

  // La OV es informacion complementaria. En V4 el ensamble
  // depende de la OT, por lo que una OT sin OV tambien puede
  // programarse si Epicor devuelve ensambles validos.
  let ovPrincipal: number | null =
    input.ov === null || input.ov === undefined
      ? null
      : Number(input.ov);

  if (ovPrincipal !== null) {
    const exists = epicorOvs.some(
      (item) => Number(item.ov) === ovPrincipal
    );

    if (!exists) {
      throw new ProgramacionError(
        `La OV ${ovPrincipal} no pertenece a la OT ${ot} según Epicor.`
      );
    }
  } else {
    const firstValidOv = epicorOvs
      .map((item) => Number(item.ov))
      .find(
        (value) =>
          Number.isSafeInteger(value) && value > 0
      );

    ovPrincipal = firstValidOv ?? null;
  }

  const selectedAssemblySeqs = new Set<number>(
    input.ensambles.map((item) => Number(item.assemblySeq))
  );

  const epicorAssemblies = epicorOt.ensambles ?? [];

  const selectedEpicorAssemblies = epicorAssemblies.filter(
    (ensamble) =>
      selectedAssemblySeqs.has(Number(ensamble.assemblySeq))
  );

  if (
    selectedEpicorAssemblies.length !==
    selectedAssemblySeqs.size
  ) {
    const found = new Set<number>(
      selectedEpicorAssemblies.map((ensamble) =>
        Number(ensamble.assemblySeq)
      )
    );

    const missing = Array.from(selectedAssemblySeqs).filter(
      (assemblySeq) => !found.has(assemblySeq)
    );

    throw new ProgramacionError(
      `Los siguientes ensambles no existen en la OT ${ot}: ${missing.join(", ")}.`
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const idEstado = await getProgramadaStateId(client);

    const idOt = await upsertOt(
      client,
      epicorOt,
      input.fecha,
      idEstado,
      proyectoGuardado
    );

    // Guardar OVs/clientes como informacion adicional.
    // No son la FK del ensamble en V4.
    let ovsGuardadas = 0;

    for (const epicorOv of epicorOvs) {
      const numeroOv = Number(epicorOv.ov);

      if (!Number.isSafeInteger(numeroOv) || numeroOv <= 0) {
        continue;
      }

      const idOv = await upsertOv(client, idOt, numeroOv);

      await upsertCliente(
        client,
        idOv,
        epicorOv.cliente ?? null
      );

      ovsGuardadas += 1;
    }

    let procesosGuardados = 0;

    for (const ensamble of selectedEpicorAssemblies) {
      const idEnsamble = await upsertEnsamble(
        client,
        idOt,
        ensamble
      );

      const operaciones = ensamble.operaciones ?? [];

      for (const operacion of operaciones) {
        await upsertProceso(
          client,
          idEnsamble,
          operacion
        );

        procesosGuardados += 1;
      }
    }

    await client.query("COMMIT");

    return {
      idOt,
      ot,
      estado: "Programada",
      fechaInicio: input.fecha,
      ovPrincipal,
      proyectoGuardado,
      ovsGuardadas,
      ensamblesGuardados: selectedEpicorAssemblies.length,
      procesosGuardados,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Error ejecutando ROLLBACK de programación:",
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
};

// ==========================================================
// PROGRAMACION MASIVA
// ==========================================================

export type ProgramarOtsResultItem =
  | {
      success: true;
      ot: string;
      message: string;
      data: ProgramarOtResult;
    }
  | {
      success: false;
      ot: string;
      message: string;
    };

export type ProgramarOtsResult = {
  totalSolicitadas: number;
  exitosas: number;
  fallidas: number;
  resultados: ProgramarOtsResultItem[];
};

/**
 * Programa varias OTs en una sola solicitud HTTP.
 *
 * Cada OT conserva la transaccion individual de programarOt().
 * Esto permite que una OT con error no haga rollback de las OTs que
 * ya fueron programadas correctamente.
 */
export const programarOts = async (
  programaciones: ProgramarOtInput[]
): Promise<ProgramarOtsResult> => {
  if (!Array.isArray(programaciones) || programaciones.length === 0) {
    throw new ProgramacionError(
      "Debes enviar al menos una OT para programar."
    );
  }

  if (programaciones.length > 100) {
    throw new ProgramacionError(
      "No puedes programar mas de 100 OTs en una sola solicitud."
    );
  }

  const uniqueKeys = new Set<string>();

  for (const programacion of programaciones) {
    const ot = normalizeText(programacion?.ot);
    const company = normalizeText(programacion?.company);

    if (!ot || !company) {
      continue;
    }

    const key = `${company.toUpperCase()}::${ot}`;

    if (uniqueKeys.has(key)) {
      throw new ProgramacionError(
        `La OT ${ot} esta repetida en el lote para la compania ${company}.`
      );
    }

    uniqueKeys.add(key);
  }

  const resultados: ProgramarOtsResultItem[] = [];

  // Secuencial a proposito: evita lanzar decenas de consultas simultaneas
  // contra Epicor y PostgreSQL.
  for (const programacion of programaciones) {
    const ot = normalizeText(programacion?.ot) ?? "OT desconocida";

    try {
      const data = await programarOt(programacion);

      resultados.push({
        success: true,
        ot: data.ot,
        message: `La OT ${data.ot} fue programada correctamente.`,
        data,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No fue posible programar la OT.";

      resultados.push({
        success: false,
        ot,
        message,
      });
    }
  }

  const exitosas = resultados.filter((item) => item.success).length;
  const fallidas = resultados.length - exitosas;

  return {
    totalSolicitadas: resultados.length,
    exitosas,
    fallidas,
    resultados,
  };
};
