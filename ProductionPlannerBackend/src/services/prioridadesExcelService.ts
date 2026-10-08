import * as XLSX from "xlsx";
import pool from "../config/database";

// ==========================================================
// TIPOS
// ==========================================================

export type ExcelPrioridadRow = {
  numeroOv: number;
  prioridad: number;
  fechaRequerimiento: string | null;
  detalle: string | null;
  cliente: string | null;
  linea: string | null;
  filaExcel: number;
};

export type SincronizacionPrioridadesExcelResult = {
  archivo: string;
  hoja: string;
  filasLeidas: number;
  filasValidas: number;
  ovsEncontradas: number;
  ovsActualizadas: number;
  ovsNoEncontradas: number[];
  filasIgnoradas: Array<{
    fila: number;
    motivo: string;
  }>;
  sincronizadoEn: string;
};

// ==========================================================
// CONFIGURACION
// ==========================================================

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}.`,
    );
  }

  return value;
};

const getShareUrl = (): string =>
  requireEnv("PRIORIDADES_EXCEL_SHARE_URL");

// ==========================================================
// MICROSOFT GRAPH
// ==========================================================

const getMicrosoftAccessToken = async (): Promise<string> => {
  const tenantId = requireEnv("MS_TENANT_ID");
  const clientId = requireEnv("MS_CLIENT_ID");
  const clientSecret = requireEnv("MS_CLIENT_SECRET");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: GRAPH_SCOPE,
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Microsoft Entra no entrego token. HTTP ${response.status}. ${text}`,
    );
  }

  const result = JSON.parse(text) as {
    access_token?: string;
  };

  if (!result.access_token) {
    throw new Error(
      "Microsoft Entra respondio sin access_token.",
    );
  }

  return result.access_token;
};

const encodeSharingUrl = (sharingUrl: string): string => {
  const base64 = Buffer.from(sharingUrl, "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\//g, "_")
    .replace(/\+/g, "-");

  return `u!${base64}`;
};

const downloadExcelFromOneDrive = async (): Promise<Buffer> => {
  const token = await getMicrosoftAccessToken();
  const shareUrl = getShareUrl();
  const shareId = encodeSharingUrl(shareUrl);

  const response = await fetch(
    `${GRAPH_BASE}/shares/${shareId}/driveItem/content`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      redirect: "follow",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `No fue posible descargar el Excel desde OneDrive. HTTP ${response.status}. ${text}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
};

// ==========================================================
// EXCEL
// ==========================================================

const normalizeHeader = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const normalizeCellText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
};

const getNormalizedRow = (
  row: Record<string, unknown>,
): Map<string, unknown> => {
  const result = new Map<string, unknown>();

  for (const [key, value] of Object.entries(row)) {
    result.set(normalizeHeader(key), value);
  }

  return result;
};

const getCell = (
  row: Map<string, unknown>,
  ...names: string[]
): unknown => {
  for (const name of names) {
    const value = row.get(normalizeHeader(name));

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

const parsePositiveInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized =
    typeof value === "string"
      ? value.replace(/\./g, "").replace(/,/g, "").trim()
      : value;

  const parsed = Number(normalized);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const toIsoDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed) {
      return [
        String(parsed.y).padStart(4, "0"),
        String(parsed.m).padStart(2, "0"),
        String(parsed.d).padStart(2, "0"),
      ].join("-");
    }
  }

  const text = String(value).trim();

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return text;
  }

  const localMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (localMatch) {
    const [, day, month, year] = localMatch;

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
};

const parseWorkbook = (
  buffer: Buffer,
): {
  archivo: string;
  hoja: string;
  filasLeidas: number;
  validRows: ExcelPrioridadRow[];
  ignoredRows: Array<{ fila: number; motivo: string }>;
} => {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error(
      "El archivo Excel no contiene ninguna hoja.",
    );
  }

  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(
      `No fue posible abrir la hoja ${sheetName}.`,
    );
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    worksheet,
    {
      defval: null,
      raw: true,
    },
  );

  const validRows: ExcelPrioridadRow[] = [];
  const ignoredRows: Array<{ fila: number; motivo: string }> = [];

  // Excel: fila 1 es cabecera, por eso el primer registro de datos es fila 2.
  rows.forEach((rawRow, index) => {
    const filaExcel = index + 2;
    const row = getNormalizedRow(rawRow);

    const numeroOv = parsePositiveInteger(
      getCell(row, "OV", "ORDEN DE VENTA"),
    );

    const prioridad = parsePositiveInteger(
      getCell(row, "PRIORIDAD"),
    );

    if (!numeroOv && !prioridad) {
      ignoredRows.push({
        fila: filaExcel,
        motivo: "Fila sin OV ni prioridad.",
      });
      return;
    }

    if (!numeroOv) {
      ignoredRows.push({
        fila: filaExcel,
        motivo: "OV invalida o vacia.",
      });
      return;
    }

    if (!prioridad) {
      ignoredRows.push({
        fila: filaExcel,
        motivo: `La OV ${numeroOv} no tiene una prioridad valida.`,
      });
      return;
    }

    validRows.push({
      numeroOv,
      prioridad,
      fechaRequerimiento: toIsoDate(
        getCell(
          row,
          "FECHA REQUERIMIENTO",
          "FECHA DE REQUERIMIENTO",
        ),
      ),
      detalle: normalizeCellText(getCell(row, "DETALLE")),
      cliente: normalizeCellText(getCell(row, "CLIENTE")),
      linea: normalizeCellText(getCell(row, "LINEA", "LÍNEA")),
      filaExcel,
    });
  });

  // ----------------------------------------------------------
  // Validacion de duplicados dentro del Excel
  // ----------------------------------------------------------

  const ovSeen = new Map<number, ExcelPrioridadRow>();
  const prioritySeen = new Map<number, ExcelPrioridadRow>();

  for (const row of validRows) {
    const previousOv = ovSeen.get(row.numeroOv);

    if (previousOv) {
      throw new Error(
        `La OV ${row.numeroOv} esta repetida en las filas ${previousOv.filaExcel} y ${row.filaExcel} del Excel.`,
      );
    }

    ovSeen.set(row.numeroOv, row);

    const previousPriority = prioritySeen.get(row.prioridad);

    if (previousPriority) {
      throw new Error(
        `La prioridad ${row.prioridad} esta repetida para las OVs ${previousPriority.numeroOv} y ${row.numeroOv}.`,
      );
    }

    prioritySeen.set(row.prioridad, row);
  }

  return {
    archivo: "Prioridades OneDrive",
    hoja: sheetName,
    filasLeidas: rows.length,
    validRows,
    ignoredRows,
  };
};

// ==========================================================
// POSTGRESQL
// ==========================================================

const getInternalOvs = async (
  numeroOvs: number[],
): Promise<Set<number>> => {
  if (numeroOvs.length === 0) {
    return new Set<number>();
  }

  const result = await pool.query<{ numero_ov: string | number }>(
    `
      SELECT DISTINCT numero_ov
      FROM public.ovs
      WHERE numero_ov = ANY($1::BIGINT[]);
    `,
    [numeroOvs],
  );

  return new Set(
    result.rows.map((row) => Number(row.numero_ov)),
  );
};

const savePrioridades = async (
  rows: ExcelPrioridadRow[],
): Promise<number> => {
  if (rows.length === 0) {
    return 0;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Comparte el mismo lock transaccional de las funciones manuales para
    // evitar que una edicion desde la interfaz choque con la sincronizacion.
    await client.query(
      "SELECT pg_advisory_xact_lock(91026002);",
    );

    await client.query(
      "SET CONSTRAINTS uq_prioridades_ov_prioridad DEFERRED;",
    );

    const prioridades = rows.map((row) => row.prioridad);

    // El Excel es la fuente autoritativa de las filas que sincroniza.
    // Si una OV que antes venia del Excel ya no aparece en el archivo,
    // deja de conservar una prioridad vieja que podria seguir afectando
    // el orden operativo. Conservamos el registro y sus metadatos, pero
    // liberamos su posicion.
    await client.query(
      `
        UPDATE public.prioridades_ov
        SET
          prioridad = NULL,
          fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE fuente = 'EXCEL_ONEDRIVE';
      `,
    );

    // Si una de las prioridades exactas del Excel estaba ocupada por una
    // OV cargada manualmente, se libera esa posicion para respetar el
    // numero que viene en el archivo.
    await client.query(
      `
        UPDATE public.prioridades_ov
        SET
          prioridad = NULL,
          fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE prioridad = ANY($1::INTEGER[]);
      `,
      [prioridades],
    );

    const payload = rows.map((row) => ({
      numero_ov: row.numeroOv,
      prioridad: row.prioridad,
      fecha_requerimiento: row.fechaRequerimiento,
      detalle: row.detalle,
      cliente_excel: row.cliente,
      linea: row.linea,
    }));

    const result = await client.query(
      `
        INSERT INTO public.prioridades_ov (
          numero_ov,
          prioridad,
          fecha_requerimiento,
          detalle,
          cliente_excel,
          linea,
          fuente,
          fecha_actualizacion
        )
        SELECT
          x.numero_ov,
          x.prioridad,
          x.fecha_requerimiento,
          x.detalle,
          x.cliente_excel,
          x.linea,
          'EXCEL_ONEDRIVE',
          CURRENT_TIMESTAMP
        FROM jsonb_to_recordset($1::jsonb) AS x(
          numero_ov BIGINT,
          prioridad INTEGER,
          fecha_requerimiento DATE,
          detalle TEXT,
          cliente_excel TEXT,
          linea VARCHAR(150)
        )
        ON CONFLICT (numero_ov)
        DO UPDATE SET
          prioridad = EXCLUDED.prioridad,
          fecha_requerimiento = EXCLUDED.fecha_requerimiento,
          detalle = EXCLUDED.detalle,
          cliente_excel = EXCLUDED.cliente_excel,
          linea = EXCLUDED.linea,
          fuente = 'EXCEL_ONEDRIVE',
          fecha_actualizacion = CURRENT_TIMESTAMP
        RETURNING numero_ov;
      `,
      [JSON.stringify(payload)],
    );

    await client.query("COMMIT");
    return result.rowCount ?? rows.length;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Error haciendo rollback de prioridades Excel:",
        rollbackError,
      );
    }

    throw error;
  } finally {
    client.release();
  }
};

// ==========================================================
// SINCRONIZACION
// ==========================================================

let syncInFlight: Promise<SincronizacionPrioridadesExcelResult> | null = null;
let autoSyncTimer: NodeJS.Timeout | null = null;

const executeSync = async (): Promise<SincronizacionPrioridadesExcelResult> => {
  const buffer = await downloadExcelFromOneDrive();
  const parsed = parseWorkbook(buffer);

  const internalOvs = await getInternalOvs(
    parsed.validRows.map((row) => row.numeroOv),
  );

  const existingRows = parsed.validRows.filter((row) =>
    internalOvs.has(row.numeroOv),
  );

  const missingOvs = parsed.validRows
    .filter((row) => !internalOvs.has(row.numeroOv))
    .map((row) => row.numeroOv)
    .sort((a, b) => a - b);

  const updated = await savePrioridades(existingRows);

  return {
    archivo: parsed.archivo,
    hoja: parsed.hoja,
    filasLeidas: parsed.filasLeidas,
    filasValidas: parsed.validRows.length,
    ovsEncontradas: existingRows.length,
    ovsActualizadas: updated,
    ovsNoEncontradas: missingOvs,
    filasIgnoradas: parsed.ignoredRows,
    sincronizadoEn: new Date().toISOString(),
  };
};

export const sincronizarPrioridadesDesdeExcel = async (): Promise<SincronizacionPrioridadesExcelResult> => {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = executeSync().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
};

// ==========================================================
// SINCRONIZACION AUTOMATICA OPCIONAL
// ==========================================================
// PRIORIDADES_EXCEL_SYNC_MS=300000 -> cada 5 minutos
// PRIORIDADES_EXCEL_SYNC_MS=0      -> deshabilitada
// ==========================================================

export const startPrioridadesExcelAutoSync = (): void => {
  if (autoSyncTimer) {
    return;
  }

  const intervalMs = Number(
    process.env.PRIORIDADES_EXCEL_SYNC_MS ?? 0,
  );

  if (!Number.isFinite(intervalMs) || intervalMs < 15_000) {
    console.log(
      "[Prioridades Excel] Sincronizacion automatica deshabilitada.",
    );
    return;
  }

  const run = async () => {
    try {
      const result = await sincronizarPrioridadesDesdeExcel();

      console.log(
        `[Prioridades Excel] ${result.ovsActualizadas} OV(s) actualizadas. ` +
          `${result.ovsNoEncontradas.length} OV(s) del Excel no existen aun en PostgreSQL.`,
      );
    } catch (error) {
      console.error(
        "[Prioridades Excel] Error sincronizando OneDrive:",
        error,
      );
    }
  };

  void run();

  autoSyncTimer = setInterval(() => {
    void run();
  }, intervalMs);
};
