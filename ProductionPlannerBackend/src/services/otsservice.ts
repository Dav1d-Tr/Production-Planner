//otsservice.ts

import * as sql from "mssql";

import { getEpicorPool } from "../config/epicorDatabase";

// ==========================================================
// PARÁMETROS
// ==========================================================

interface GetOtsParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

// ==========================================================
// FILA QUE VIENE DIRECTAMENTE DE EPICOR
// ==========================================================

type EpicorOtRow = {
  TotalRegistros: number;

  Company: string;

  Cliente: string | null;

  OV: number | null;

  Proyecto: string | null;

  OT: string;

  PartNum: string | null;

  PartDescription: string | null;

  PlanoOT: string | null;

  ProdCode: string | null;

  CantidadOT: number | null;

  JobReleased: boolean;

  JobClosed: boolean;

  JobComplete: boolean;

  AssemblySeq: number;

  PartNumEnsamble: string | null;

  Ensamble: string | null;

  PlanoEnsamble: string | null;

  OprSeq: number;

  OpCode: string | null;

  OpDesc: string | null;

  OpDtlDesc: string | null;

  Maquina: string | null;

  Area: string | null;

  AreaID: string | null;

  CantidadProgramada: number | null;

  CantidadProducida: number | null;

  CantidadFaltante: number | null;

  TiempoEstimadoHoras: number | null;

  TiempoUnitarioHoras: number | null;

  TiempoProducidoHoras: number | null;
};

// ==========================================================
// TIPOS INTERNOS PARA AGRUPACIÓN
// ==========================================================

type InternalOperation = {
  oprSeq: number;

  opCode: string | null;

  opDesc: string | null;

  detallesOperacion: Set<string>;

  maquinas: Set<string>;

  areas: Map<
    string,
    {
      areaId: string | null;
      area: string | null;
    }
  >;

  cantidadProgramada: number;

  cantidadProducida: number;

  cantidadFaltante: number;

  tiempoEstimadoHoras: number;

  tiempoUnitarioHoras: number;

  tiempoProducidoHoras: number;
};

type InternalAssembly = {
  assemblySeq: number;

  partNum: string | null;

  descripcion: string | null;

  plano: string | null;

  operaciones: Map<number, InternalOperation>;
};

type InternalOt = {
  company: string;

  ot: string;

  proyecto: string | null;

  partNum: string | null;

  partDescription: string | null;

  plano: string | null;

  prodCode: string | null;

  cantidadOT: number;

  jobReleased: boolean;

  jobClosed: boolean;

  jobComplete: boolean;

  ovs: Map<
    number,
    {
      ov: number;
      cliente: string | null;
    }
  >;

  ensambles: Map<number, InternalAssembly>;
};

// ==========================================================
// UTILIDAD
// ==========================================================

const toNumber = (
  value: number | string | null | undefined
): number => {
  return Number(value ?? 0);
};

// ==========================================================
// OBTENER TODAS LAS OTs
//
// Devuelve:
// OT
// ├── OV / cliente
// ├── proyecto
// ├── progreso
// └── ensambles
//      └── operaciones
//           ├── detalle
//           ├── máquina
//           ├── área
//           ├── cantidades
//           └── tiempos
// ==========================================================

export const getOtsFromEpicor = async ({
  search = "",
  page = 1,
  pageSize = 30,
}: GetOtsParams) => {
  // ========================================================
  // PAGINACIÓN SEGURA
  // ========================================================

  const safePage = Math.max(
    Number(page) || 1,
    1
  );

  const safePageSize = Math.min(
    Math.max(
      Number(pageSize) || 30,
      1
    ),
    1000
  );

  const offset =
    (safePage - 1) *
    safePageSize;

  // ========================================================
  // CONEXIÓN
  // ========================================================

  const pool =
    await getEpicorPool();

  const request =
    pool.request();

  // ========================================================
  // PARÁMETROS SQL
  // ========================================================

  request.input(
    "Search",
    sql.NVarChar(200),
    search.trim() === ""
      ? null
      : search.trim()
  );

  request.input(
    "Offset",
    sql.Int,
    offset
  );

  request.input(
    "PageSize",
    sql.Int,
    safePageSize
  );

  // ========================================================
  // CONSULTA
  //
  // IMPORTANTE:
  // Primero paginamos las OTs.
  //
  // Después traemos TODA la información correspondiente
  // únicamente a esas OTs.
  //
  // Así no paginamos operaciones accidentalmente.
  // ========================================================

  const result =
    await request.query<EpicorOtRow>(`
      WITH FilteredJobs AS (
        SELECT
          JH.Company,

          JH.JobNum,

          COUNT(*) OVER()
            AS TotalRegistros,

          ROW_NUMBER() OVER (
            ORDER BY
              JH.JobNum DESC,
              JH.Company
          ) AS RowNum

        FROM ERP10.Erp.JobHead AS JH

        WHERE

          -- =================================================
          -- DEBE TENER PRODUCCIÓN
          -- =================================================

          JH.ProdQty > 0

          -- =================================================
          -- ESTADO VALIDO PARA PROGRAMACION
          -- Solo mostrar OTs liberadas, abiertas y no completas.
          -- =================================================

          AND ISNULL(JH.JobReleased, 0) = 1

          AND ISNULL(JH.JobClosed, 0) = 0

          AND ISNULL(JH.JobComplete, 0) = 0

          -- =================================================
          -- FORMATOS DE OT PERMITIDOS
          -- 1. OT SIMPLE: 000000
          --    Ejemplo: 016541
          -- 2. OT COMPUESTA: 000000-0-0
          --    Ejemplos:
          --    016541-1-1
          --    016541-10-2
          --    123456-2-15
          -- =================================================

          AND (
            -- -----------------------------------------------
            -- FORMATO SIMPLE: exactamente 6 dígitos
            -- -----------------------------------------------
            (
              LEN(LTRIM(RTRIM(JH.JobNum))) = 6
              AND LTRIM(RTRIM(JH.JobNum))
                NOT LIKE '%[^0-9]%'
            )

            OR

            -- -----------------------------------------------
            -- FORMATO COMPUESTO:
            -- 6 dígitos + '-' + números + '-' + números
            -- -----------------------------------------------
            (
              LTRIM(RTRIM(JH.JobNum)) LIKE
                '[0-9][0-9][0-9][0-9][0-9][0-9]-[0-9]%-[0-9]%'

              AND LTRIM(RTRIM(JH.JobNum))
                NOT LIKE '%[^0-9-]%'

              AND (
                LEN(LTRIM(RTRIM(JH.JobNum))) -
                LEN(
                  REPLACE(
                    LTRIM(RTRIM(JH.JobNum)),
                    '-',
                    ''
                  )
                )
              ) = 2
            )
          )

          -- =================================================
          -- DEBE TENER OPERACIONES
          -- =================================================

          AND EXISTS (
            SELECT 1

            FROM ERP10.Erp.JobOper AS JO_EXISTE

            WHERE
              JO_EXISTE.Company =
                JH.Company

              AND JO_EXISTE.JobNum =
                JH.JobNum
          )

          -- =================================================
          -- BUSCADOR
          -- OT / Parte / Proyecto / OV / Cliente
          -- =================================================

          AND (
            @Search IS NULL

            OR JH.JobNum
              LIKE '%' + @Search + '%'

            OR JH.PartNum
              LIKE '%' + @Search + '%'

            OR JH.PartDescription
              LIKE '%' + @Search + '%'

            OR JH.CommentText
              LIKE '%' + @Search + '%'

            OR EXISTS (
              SELECT 1

              FROM ERP10.Erp.JobProd AS JP_SEARCH

              LEFT OUTER JOIN
                ERP10.Erp.OrderHed AS OH_SEARCH

                ON JP_SEARCH.Company =
                  OH_SEARCH.Company

                AND JP_SEARCH.OrderNum =
                  OH_SEARCH.OrderNum

                AND JP_SEARCH.OrderNum <> 0

              LEFT OUTER JOIN
                ERP10.Erp.Customer AS C_SEARCH

                ON OH_SEARCH.Company =
                  C_SEARCH.Company

                AND OH_SEARCH.CustNum =
                  C_SEARCH.CustNum

              WHERE

                JP_SEARCH.Company =
                  JH.Company

                AND JP_SEARCH.JobNum =
                  JH.JobNum

                AND (
                  CAST(
                    JP_SEARCH.OrderNum
                    AS VARCHAR(20)
                  )
                    LIKE '%' + @Search + '%'

                  OR C_SEARCH.Name
                    LIKE '%' + @Search + '%'
                )
            )
          )
      ),

      PagedJobs AS (
        SELECT
          Company,
          JobNum,
          TotalRegistros

        FROM FilteredJobs

        WHERE
          RowNum > @Offset

          AND RowNum <=
            @Offset + @PageSize
      )

      SELECT DISTINCT

        PJ.TotalRegistros,

        -- =================================================
        -- COMPANY
        -- =================================================

        JH.Company,

        -- =================================================
        -- CLIENTE
        -- =================================================

        CASE
          WHEN ISNULL(
            JP.OrderNum,
            0
          ) = 0
          THEN NULL

          ELSE C.Name
        END AS Cliente,

        -- =================================================
        -- OV
        -- =================================================

        CASE
          WHEN ISNULL(
            JP.OrderNum,
            0
          ) = 0
          THEN NULL

          ELSE JP.OrderNum
        END AS OV,

        -- =================================================
        -- PROYECTO
        -- =================================================

        CASE
          WHEN JH.CommentText IS NULL
            OR JH.CommentText = ''
          THEN JH.PartDescription

          ELSE JH.CommentText
        END AS Proyecto,

        -- =================================================
        -- OT
        -- =================================================

        JH.JobNum AS OT,

        JH.PartNum,

        JH.PartDescription,

        JH.DrawNum
          AS PlanoOT,

        JH.ProdCode,

        JH.ProdQty
          AS CantidadOT,

        -- =================================================
        -- ESTADO DE LA OT
        -- =================================================

        JH.JobReleased,

        JH.JobClosed,

        JH.JobComplete,

        -- =================================================
        -- ENSAMBLE
        -- =================================================

        JA.AssemblySeq,

        JA.PartNum
          AS PartNumEnsamble,

        JA.Description
          AS Ensamble,

        JA.DrawNum
          AS PlanoEnsamble,

        -- =================================================
        -- OPERACIÓN
        -- =================================================

        JO.OprSeq,

        JO.OpCode,

        JO.OpDesc,

        -- =================================================
        -- DETALLE DE OPERACIÓN
        -- =================================================

        JOD.OpDtlDesc,

        -- =================================================
        -- MÁQUINA
        

        CASE
          WHEN JOD.OpDtlDesc IS NOT NULL
            AND LTRIM(
              RTRIM(
                JOD.OpDtlDesc
              )
            ) <> ''

          THEN JOD.OpDtlDesc

          ELSE R.Description
        END AS Maquina,

        -- =================================================
        -- ÁREA
        -- =================================================

        CASE
          WHEN JOD.ResourceGrpID
            IS NOT NULL

          THEN RG.Description

          ELSE NULL
        END AS Area,

        JOD.ResourceGrpID
          AS AreaID,

        -- =================================================
        -- CANTIDADES
        -- =================================================

        JO.RunQty
          AS CantidadProgramada,

        JO.QtyCompleted
          AS CantidadProducida,

        JO.RunQty -
        JO.QtyCompleted
          AS CantidadFaltante,

        -- =================================================
        -- TIEMPOS
        -- =================================================

        JO.EstProdHours
          AS TiempoEstimadoHoras,

        CASE
          WHEN ROUND(
            JO.RunQty,
            0
          ) = 0

          THEN 0

          ELSE
            JO.EstProdHours /
            JO.RunQty

        END AS TiempoUnitarioHoras,

        CASE
          WHEN ROUND(
            JO.RunQty,
            0
          ) = 0

          THEN 0

          ELSE
            (
              JO.EstProdHours /
              JO.RunQty
            )
            *
            JO.QtyCompleted

        END AS TiempoProducidoHoras

      -- ===================================================
      -- OT PAGINADA
      -- ===================================================

      FROM PagedJobs AS PJ

      INNER JOIN
        ERP10.Erp.JobHead AS JH

        ON PJ.Company =
          JH.Company

        AND PJ.JobNum =
          JH.JobNum

      -- ===================================================
      -- RELACIÓN OT / OV
      -- ===================================================

      LEFT OUTER JOIN
        ERP10.Erp.JobProd AS JP

        ON JH.Company =
          JP.Company

        AND JH.JobNum =
          JP.JobNum

      -- ===================================================
      -- OV
      -- ===================================================

      LEFT OUTER JOIN
        ERP10.Erp.OrderHed AS OH

        ON JP.Company =
          OH.Company

        AND JP.OrderNum =
          OH.OrderNum

        AND JP.OrderNum <> 0

      -- ===================================================
      -- CLIENTE
      -- ===================================================

      LEFT OUTER JOIN
        ERP10.Erp.Customer AS C

        ON OH.Company =
          C.Company

        AND OH.CustNum =
          C.CustNum

      -- ===================================================
      -- ENSAMBLES
      -- ===================================================

      LEFT OUTER JOIN
        ERP10.Erp.JobAsmbl AS JA

        ON JH.Company =
          JA.Company

        AND JH.JobNum =
          JA.JobNum

      -- ===================================================
      -- OPERACIONES
      -- ===================================================

      LEFT OUTER JOIN
        ERP10.Erp.JobOper AS JO

        ON JH.Company =
          JO.Company

        AND JH.JobNum =
          JO.JobNum

        AND JA.AssemblySeq =
          JO.AssemblySeq

      -- ===================================================
      -- DETALLE OPERACIÓN
      -- ===================================================

      LEFT OUTER JOIN
        ERP10.Erp.JobOpDtl AS JOD

        ON JO.Company =
          JOD.Company

        AND JO.JobNum =
          JOD.JobNum

        AND JO.AssemblySeq =
          JOD.AssemblySeq

        AND JO.OprSeq =
          JOD.OprSeq

      -- ===================================================
      -- RECURSO / MÁQUINA

      LEFT OUTER JOIN
        ERP10.Erp.Resource AS R

        ON JOD.Company =
          R.Company

        AND JOD.ResourceGrpID =
          R.ResourceGrpID

      -- ===================================================
      -- ÁREA
      -- ===================================================

      LEFT OUTER JOIN
        ERP10.Erp.ResourceGroup AS RG

        ON JOD.Company =
          RG.Company

        AND JOD.ResourceGrpID =
          RG.ResourceGrpID

      WHERE

        -- =================================================
        -- DEBE TENER OPERACIONES
        -- =================================================

        JO.JobNum IS NOT NULL

        -- =================================================
        -- FORMATOS DE OT PERMITIDOS
        -- 1. 000000
        -- 2. 000000-0-0
        -- Segunda validación defensiva sobre la OT final.
        -- =================================================

        AND (
          -- -----------------------------------------------
          -- FORMATO SIMPLE: exactamente 6 dígitos
          -- -----------------------------------------------
          (
            LEN(LTRIM(RTRIM(JH.JobNum))) = 6
            AND LTRIM(RTRIM(JH.JobNum))
              NOT LIKE '%[^0-9]%'
          )

          OR

          -- -----------------------------------------------
          -- FORMATO COMPUESTO:
          -- 6 dígitos + '-' + números + '-' + números
          -- -----------------------------------------------
          (
            LTRIM(RTRIM(JH.JobNum)) LIKE
              '[0-9][0-9][0-9][0-9][0-9][0-9]-[0-9]%-[0-9]%'

            AND LTRIM(RTRIM(JH.JobNum))
              NOT LIKE '%[^0-9-]%'

            AND (
              LEN(LTRIM(RTRIM(JH.JobNum))) -
              LEN(
                REPLACE(
                  LTRIM(RTRIM(JH.JobNum)),
                  '-',
                  ''
                )
              )
            ) = 2
          )
        )

        -- =================================================
        -- PRODUCCIÓN > 0
        -- =================================================

        AND JH.ProdQty > 0

        -- =================================================
        -- ESTADO VALIDO PARA PROGRAMACION
        -- Validacion defensiva final.
        -- =================================================

        AND ISNULL(JH.JobReleased, 0) = 1

        AND ISNULL(JH.JobClosed, 0) = 0

        AND ISNULL(JH.JobComplete, 0) = 0

      ORDER BY

        JH.JobNum DESC,

        JA.AssemblySeq,

        JO.OprSeq;
    `);

  // ========================================================
  // FILAS CRUDAS
  // ========================================================

  const rows =
    result.recordset;

  // ========================================================
  // TOTAL
  // ========================================================

  const total =
  Number(
    rows[0]?.TotalRegistros ?? 0
  );

  // ========================================================
  // MAP DE OTs
  //
  // IMPORTANTE:
  // La entidad principal es la OT.
  //
  // No devolvemos cada fila SQL como una OT diferente.
  // ========================================================

  const otsMap =
    new Map<
      string,
      InternalOt
    >();

  // ========================================================
  // AGRUPAR TODA LA INFORMACIÓN
  // ========================================================

  for (const row of rows) {
    // ======================================================
    // KEY OT
    // ======================================================

    const otKey =
      `${row.Company}::${row.OT}`;

    // ======================================================
    // CREAR OT SI NO EXISTE
    // ======================================================

    if (!otsMap.has(otKey)) {
      otsMap.set(
        otKey,
        {
          company:
            row.Company,

          ot:
            row.OT,

          proyecto:
            row.Proyecto ??
            null,

          partNum:
            row.PartNum ??
            null,

          partDescription:
            row.PartDescription ??
            null,

          plano:
            row.PlanoOT ??
            null,

          prodCode:
            row.ProdCode ??
            null,

          cantidadOT:
            toNumber(
              row.CantidadOT
            ),

          jobReleased:
            Boolean(
              row.JobReleased
            ),

          jobClosed:
            Boolean(
              row.JobClosed
            ),

          jobComplete:
            Boolean(
              row.JobComplete
            ),

          ovs:
            new Map(),

          ensambles:
            new Map(),
        }
      );
    }

    const ot =
      otsMap.get(
        otKey
      )!;

    // ======================================================
    // OV + CLIENTE
    // ======================================================

    if (
      row.OV !== null &&
      row.OV !== undefined &&
      Number(row.OV) !== 0
    ) {
      const numeroOv =
        Number(row.OV);

      if (
        !ot.ovs.has(
          numeroOv
        )
      ) {
        ot.ovs.set(
          numeroOv,
          {
            ov:
              numeroOv,

            cliente:
              row.Cliente ??
              null,
          }
        );
      }
    }

    // ======================================================
    // ENSAMBLE
    // ======================================================

    const assemblySeq =
      Number(
        row.AssemblySeq
      );

    if (
      !ot.ensambles.has(
        assemblySeq
      )
    ) {
      ot.ensambles.set(
        assemblySeq,
        {
          assemblySeq,

          partNum:
            row.PartNumEnsamble ??
            null,

          descripcion:
            row.Ensamble ??
            null,

          plano:
            row.PlanoEnsamble ??
            null,

          operaciones:
            new Map(),
        }
      );
    }

    const ensamble =
      ot.ensambles.get(
        assemblySeq
      )!;

    // ======================================================
    // OPERACIÓN
    // ======================================================

    const oprSeq =
      Number(
        row.OprSeq
      );

    if (
      !ensamble.operaciones.has(
        oprSeq
      )
    ) {
      ensamble.operaciones.set(
        oprSeq,
        {
          oprSeq,

          opCode:
            row.OpCode ??
            null,

          opDesc:
            row.OpDesc ??
            null,

          detallesOperacion:
            new Set(),

          maquinas:
            new Set(),

          areas:
            new Map(),

          cantidadProgramada:
            toNumber(
              row.CantidadProgramada
            ),

          cantidadProducida:
            toNumber(
              row.CantidadProducida
            ),

          cantidadFaltante:
            toNumber(
              row.CantidadFaltante
            ),

          tiempoEstimadoHoras:
            toNumber(
              row.TiempoEstimadoHoras
            ),

          tiempoUnitarioHoras:
            toNumber(
              row.TiempoUnitarioHoras
            ),

          tiempoProducidoHoras:
            toNumber(
              row.TiempoProducidoHoras
            ),
        }
      );
    }

    const operacion =
      ensamble.operaciones.get(
        oprSeq
      )!;

    // ======================================================
    // DETALLE OPERACIÓN
    // ======================================================

    if (
      row.OpDtlDesc &&
      row.OpDtlDesc.trim() !== ""
    ) {
      operacion.detallesOperacion.add(
        row.OpDtlDesc.trim()
      );
    }

    // ======================================================
    // MÁQUINA
    // ======================================================

    if (
      row.Maquina &&
      row.Maquina.trim() !== ""
    ) {
      operacion.maquinas.add(
        row.Maquina.trim()
      );
    }

    // ======================================================
    // ÁREA
    // ======================================================

    if (
      row.AreaID ||
      row.Area
    ) {
      const areaKey =
        `${
          row.AreaID ?? ""
        }::${
          row.Area ?? ""
        }`;

      if (
        !operacion.areas.has(
          areaKey
        )
      ) {
        operacion.areas.set(
          areaKey,
          {
            areaId:
              row.AreaID ??
              null,

            area:
              row.Area ??
              null,
          }
        );
      }
    }
  }

  // ========================================================
  // CONVERTIR MAP A JSON
  // ========================================================

  const items =
    Array.from(
      otsMap.values()
    )
      .sort(
        (a, b) =>
          b.ot.localeCompare(
            a.ot
          )
      )
      .map(
        (ot) => {
          // =================================================
          // OVs
          // =================================================

          const ovs =
            Array.from(
              ot.ovs.values()
            ).sort(
              (a, b) =>
                a.ov - b.ov
            );

          // =================================================
          // ENSAMBLES
          // =================================================

          const ensambles =
            Array.from(
              ot.ensambles.values()
            )
              .sort(
                (a, b) =>
                  a.assemblySeq -
                  b.assemblySeq
              )
              .map(
                (ensamble) => {
                  const operaciones =
                    Array.from(
                      ensamble.operaciones.values()
                    )
                      .sort(
                        (a, b) =>
                          a.oprSeq -
                          b.oprSeq
                      )
                      .map(
                        (
                          operacion
                        ) => {
                          const maquinas =
                            Array.from(
                              operacion.maquinas
                            );

                          const detallesOperacion =
                            Array.from(
                              operacion.detallesOperacion
                            );

                          const areas =
                            Array.from(
                              operacion.areas.values()
                            );

                          // ===============================
                          // PROGRESO OPERACIÓN
                          // ===============================

                          const progresoOperacion =
                            operacion
                              .cantidadProgramada >
                            0
                              ? Math.min(
                                  100,
                                  Number(
                                    (
                                      (
                                        operacion
                                          .cantidadProducida *
                                        100
                                      ) /
                                      operacion
                                        .cantidadProgramada
                                    ).toFixed(
                                      2
                                    )
                                  )
                                )
                              : 0;

                          return {
                            oprSeq:
                              operacion.oprSeq,

                            opCode:
                              operacion.opCode,

                            opDesc:
                              operacion.opDesc,

                            // =============================
                            // DETALLE DE OPERACIÓN
                            // =============================

                            opDtlDesc:
                              detallesOperacion[0] ??
                              null,

                            detallesOperacion,

                            // =============================
                            // MÁQUINAS
                            // =============================

                            maquina:
                              maquinas.join(
                                " / "
                              ) ||
                              null,

                            maquinas,

                            // =============================
                            // ÁREAS
                            // =============================

                            area:
                              areas[0]
                                ?.area ??
                              null,

                            areaId:
                              areas[0]
                                ?.areaId ??
                              null,

                            areas,

                            // =============================
                            // CANTIDADES
                            // =============================

                            cantidadProgramada:
                              operacion
                                .cantidadProgramada,

                            cantidadProducida:
                              operacion
                                .cantidadProducida,

                            cantidadFaltante:
                              operacion
                                .cantidadFaltante,

                            progreso:
                              progresoOperacion,

                            // =============================
                            // TIEMPOS
                            // =============================

                            tiempoEstimadoHoras:
                              operacion
                                .tiempoEstimadoHoras,

                            tiempoUnitarioHoras:
                              operacion
                                .tiempoUnitarioHoras,

                            tiempoProducidoHoras:
                              operacion
                                .tiempoProducidoHoras,
                          };
                        }
                      );

                  return {
                    assemblySeq:
                      ensamble.assemblySeq,

                    partNum:
                      ensamble.partNum,

                    descripcion:
                      ensamble.descripcion,

                    plano:
                      ensamble.plano,

                    operaciones,
                  };
                }
              );

          // =================================================
          // CALCULAR PROGRESO GENERAL DE LA OT
          // =================================================

          let totalProgramado = 0;

          let totalProducido = 0;

          for (
            const ensamble of
              ensambles
          ) {
            for (
              const operacion of
                ensamble.operaciones
            ) {
              const programado =
                Math.max(
                  Number(
                    operacion.cantidadProgramada
                  ),
                  0
                );

              const producido =
                Math.min(
                  Math.max(
                    Number(
                      operacion.cantidadProducida
                    ),
                    0
                  ),
                  programado
                );

              totalProgramado +=
                programado;

              totalProducido +=
                producido;
            }
          }

          const progreso =
            totalProgramado > 0
              ? Number(
                  (
                    (
                      totalProducido *
                      100
                    ) /
                    totalProgramado
                  ).toFixed(2)
                )
              : 0;

          // =================================================
          // OPERACIÓN ACTUAL
          //
          // Primera operación que todavía tiene
          // cantidad pendiente.
          // =================================================

          const operacionesPlanas =
            ensambles.flatMap(
              (ensamble) =>
                ensamble.operaciones.map(
                  (operacion) => ({
                    assemblySeq:
                      ensamble.assemblySeq,

                    ...operacion,
                  })
                )
            );

          const operacionActual =
            operacionesPlanas.find(
              (operacion) =>
                operacion.cantidadProgramada >
                  0 &&
                operacion.cantidadProducida <
                  operacion.cantidadProgramada
            ) ?? null;

          // =================================================
          // PRIMERA OV PARA LA TARJETA
          //
          // Todas siguen disponibles en ovs[]
          // =================================================

          const primeraOv =
            ovs[0] ?? null;

          // =================================================
          // ESTADO EPICOR
          // =================================================

          let estadoEpicor =
            "Pendiente";

          if (ot.jobComplete) {
            estadoEpicor =
              "Completada";
          } else if (ot.jobClosed) {
            estadoEpicor =
              "Cerrada";
          } else if (
            ot.jobReleased
          ) {
            estadoEpicor =
              "Liberada";
          }

          // =================================================
          // RESPUESTA DE LA OT
          //
          // LOS CAMPOS INICIALES SON COMPATIBLES
          // CON TU FRONTEND ACTUAL.
          // =================================================

          return {
            // ===============================================
            // CABECERA
            // ===============================================

            company:
              ot.company,

            ot:
              ot.ot,

            // ===============================================
            // OV / CLIENTE PARA VISTA PRINCIPAL
            // ===============================================

            ov:
              primeraOv?.ov ??
              null,

            cliente:
              primeraOv?.cliente ??
              null,

            // ===============================================
            // TODAS LAS OV
            // ===============================================

            ovs,

            // ===============================================
            // PROYECTO / PARTE
            // ===============================================

            proyecto:
              ot.proyecto,

            partNum:
              ot.partNum,

            partDescription:
              ot.partDescription,

            plano:
              ot.plano,

            prodCode:
              ot.prodCode,

            // ===============================================
            // ESTADO
            // ===============================================

            jobReleased:
              ot.jobReleased,

            jobClosed:
              ot.jobClosed,

            jobComplete:
              ot.jobComplete,

            estadoEpicor,

            // ===============================================
            // CANTIDAD DE LA OT
            // ===============================================

            cantidadOT:
              ot.cantidadOT,

            // ===============================================
            // PROGRESO GENERAL
            // ===============================================

            progreso,

            // ===============================================
            // OPERACIÓN ACTUAL
            //
            // Compatibilidad con tu frontend actual.
            // ===============================================

            assemblySeq:
              operacionActual
                ?.assemblySeq ??
              null,

            oprSeq:
              operacionActual
                ?.oprSeq ??
              null,

            opCode:
              operacionActual
                ?.opCode ??
              null,

            operacionActual:
              operacionActual
                ?.opDesc ??
              null,

            cantidadProgramada:
              operacionActual
                ?.cantidadProgramada ??
              0,

            cantidadProducida:
              operacionActual
                ?.cantidadProducida ??
              0,

            cantidadFaltante:
              operacionActual
                ?.cantidadFaltante ??
              0,

            // ===============================================
            // TODA LA INFORMACIÓN
            // ===============================================

            ensambles,
          };
        }
      );

  // ========================================================
  // RESPUESTA FINAL
  // ========================================================

  return {
    items,

    pagination: {
      page:
        safePage,

      pageSize:
        safePageSize,

      total,

      totalPages:
        Math.ceil(
          total /
            safePageSize
        ),
    },
  };
};

// ==========================================================
// CICLO DE VIDA DE UNA OT EN EPICOR
//
// Esta consulta lee JobHead SIN aplicar los filtros productivos
// de getOtsFromEpicor(). Su objetivo es diferenciar entre:
// - OT inexistente.
// - OT no liberada.
// - OT cerrada.
// - OT completa.
// - OT con ProdQty = 0.
// - OT realmente activa.
//
// REGLA OPERATIVA DE JOB ACTIVO:
//   JobReleased = 1
//   JobClosed   = 0
//   JobComplete = 0
//   ProdQty     > 0
//
// Esta lectura previa es la que usa controlProduccionService para
// decidir si debe hacer la sincronización detallada de operaciones.
//
// También devuelve las OVs asociadas por Company para poder
// desambiguar un mismo JobNum existente en varias compañías.
// ==========================================================

export type EpicorJobLifecycle = {
  company: string;
  ot: string;
  prodQty: number;
  jobReleased: boolean;
  jobClosed: boolean;
  jobComplete: boolean;
  ovs: number[];
};

type EpicorJobLifecycleRow = {
  Company: string;
  JobNum: string;
  ProdQty: number | string | null;
  JobReleased: boolean | number | null;
  JobClosed: boolean | number | null;
  JobComplete: boolean | number | null;
  OV: number | string | null;
};

export const getJobLifecycleFromEpicor = async (
  jobNum: string,
): Promise<EpicorJobLifecycle[]> => {
  const normalizedJobNum = jobNum.trim();

  if (!normalizedJobNum) {
    return [];
  }

  const pool = await getEpicorPool();
  const request = pool.request();

  request.input(
    "JobNum",
    sql.NVarChar(50),
    normalizedJobNum,
  );

  const result = await request.query<EpicorJobLifecycleRow>(`
    SELECT
      JH.Company,
      JH.JobNum,
      JH.ProdQty,
      JH.JobReleased,
      JH.JobClosed,
      JH.JobComplete,
      CASE
        WHEN ISNULL(JP.OrderNum, 0) = 0 THEN NULL
        ELSE JP.OrderNum
      END AS OV
    FROM ERP10.Erp.JobHead AS JH
    LEFT OUTER JOIN ERP10.Erp.JobProd AS JP
      ON JP.Company = JH.Company
      AND JP.JobNum = JH.JobNum
    WHERE
      LTRIM(RTRIM(JH.JobNum)) = @JobNum
    ORDER BY
      JH.Company,
      JP.OrderNum;
  `);

  const grouped = new Map<string, EpicorJobLifecycle>();

  for (const row of result.recordset) {
    const company = String(row.Company ?? "").trim();
    const ot = String(row.JobNum ?? "").trim();
    const key = `${company.toUpperCase()}::${ot.toUpperCase()}`;

    let lifecycle = grouped.get(key);

    if (!lifecycle) {
      const parsedProdQty = Number(row.ProdQty ?? 0);

      lifecycle = {
        company,
        ot,
        prodQty: Number.isFinite(parsedProdQty)
          ? Math.max(parsedProdQty, 0)
          : 0,
        jobReleased: Boolean(row.JobReleased),
        jobClosed: Boolean(row.JobClosed),
        jobComplete: Boolean(row.JobComplete),
        ovs: [],
      };

      grouped.set(key, lifecycle);
    }

    const ov = Number(row.OV ?? 0);

    if (
      Number.isSafeInteger(ov) &&
      ov > 0 &&
      !lifecycle.ovs.includes(ov)
    ) {
      lifecycle.ovs.push(ov);
    }
  }

  return Array.from(grouped.values()).map((item) => ({
    ...item,
    ovs: [...item.ovs].sort((a, b) => a - b),
  }));
};

