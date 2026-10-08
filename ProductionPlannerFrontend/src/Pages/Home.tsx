import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useNavigate } from "react-router";

import { API_BASE } from "../config/api";


/* =========================================================
   TIPOS
========================================================= */

type ProductionStatus =
  | "En proceso"
  | "Atrasada"
  | "Completada"
  | "Liberada";

type CompletionFilter =
  | "Pendientes"
  | "Completados"
  | "Todos";

type ProductionRow = {
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

  // Tiempo total de Ingenieria y tiempo proporcional que aun falta.
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

  // Prioridad efectiva heredada de la OV.
  prioridadTrabajo: number | null;
};

{/*
  type KpiData = {
    label: string;
  value: string;
  accent: string;
};
*/}

type ControlKpis = {
  liberadas: number;
  enProceso: number;
  atrasadas: number;
  completadas: number;
  eficiencia: number;
};

type EpicorSyncInfo = {
  ok: boolean;
  synchronizedAt: string;
  otsConsultadas: number;
  procesosActualizados: number;
  procesosConError: number;
  mensaje: string | null;
};

type ControlApiData = {
  rows: ProductionRow[];
  kpis: ControlKpis;
  sync: EpicorSyncInfo;
};

type ControlApiResponse = {
  success: boolean;
  message?: string;
  data: ControlApiData;
};

const EXCLUDED_OPERATION = "INSPECCION FINAL PRODUCTO";

/* =========================================================
   DATOS DESDE POSTGRESQL
========================================================= */

const EMPTY_KPIS: ControlKpis = {
  liberadas: 0,
  enProceso: 0,
  atrasadas: 0,
  completadas: 0,
  eficiencia: 0,
};

{/*
const buildKpiData = (
  kpis: ControlKpis,
): KpiData[] => [
  {
    label: "Liberadas",
    value: String(kpis.liberadas),
    accent: "#8E1A32",
  },
  {
    label: "En proceso",
    value: String(kpis.enProceso),
    accent: "#C3B880",
  },
  {
    label: "Atrasadas",
    value: String(kpis.atrasadas),
    accent: "#D63A52",
  },
  {
    label: "Completadas",
    value: String(kpis.completadas),
    accent: "#16866C",
  },
  {
    label: "Eficiencia",
    value: `${kpis.eficiencia}%`,
    accent: "#014638",
  },
];
*/}
/* =========================================================
   GRID

   minmax:
   - evita que las columnas se vuelvan demasiado pequeñas.
   - fr hace que la tabla ocupe todo el ancho disponible.
========================================================= */

const TABLE_GRID = `
  minmax(82px, 0.55fr)
  minmax(140px, 1.10fr)
  minmax(175px, 1.45fr)
  minmax(65px, 0.48fr)
  minmax(65px, 0.48fr)
  minmax(70px, 0.52fr)
  minmax(130px, 1.00fr)
  minmax(110px, 0.85fr)
  minmax(85px, 0.66fr)
  minmax(140px, 1.05fr)
  minmax(132px, 0.95fr)
  minmax(68px, 0.50fr)
  minmax(72px, 0.52fr)
  minmax(100px, 0.76fr)
`;

const tableGridStyle: CSSProperties = {
  gridTemplateColumns: TABLE_GRID,
};

/* =========================================================
   HOME
========================================================= */

const Home = () => {
  const navigate = useNavigate();

  const [currentTime, setCurrentTime] = useState(
    new Date(),
  );

  const [productionData, setProductionData] =
    useState<ProductionRow[]>([]);

  
  const [, setControlKpis] =
    useState<ControlKpis>(EMPTY_KPIS);

  const [isLoadingData, setIsLoadingData] =
    useState(true);

  const [loadError, setLoadError] =
    useState<string | null>(null);

  const [dbOnline, setDbOnline] =
    useState(false);

  const [epicorSync, setEpicorSync] =
    useState<EpicorSyncInfo | null>(null);

  const [isFullscreen, setIsFullscreen] =
    useState(false);

  const [selectedJob, setSelectedJob] =
    useState("");

  const [selectedOperation, setSelectedOperation] =
    useState("");

  const [selectedArea, setSelectedArea] =
    useState("");

  const [selectedResponsable, setSelectedResponsable] =
    useState("");

  const [selectedPriority, setSelectedPriority] =
    useState("");

  const [completionFilter, setCompletionFilter] =
    useState<CompletionFilter>("Pendientes");

  /* =======================================================
     DATOS DESDE POSTGRESQL
  ======================================================= */

  useEffect(() => {
    let active = true;
    let requestInProgress = false;

    const loadControl = async () => {
      // Evita solapar dos sincronizaciones si Epicor tarda mas
      // que el intervalo de refresco.
      if (requestInProgress) {
        return;
      }

      requestInProgress = true;

      try {
        const response = await fetch(
          `${API_BASE}/control-produccion`,
          {
            headers: {
              Accept: "application/json",
            },
            cache: "no-store",
          },
        );

        const responseText = await response.text();

        let result: ControlApiResponse | null = null;

        try {
          result = responseText
            ? (JSON.parse(responseText) as ControlApiResponse)
            : null;
        } catch {
          result = null;
        }

        if (
          !response.ok ||
          !result?.success
        ) {
          throw new Error(
            result?.message ??
              responseText ??
              `Error ${response.status} consultando el control de produccion.`,
          );
        }

        if (!active) {
          return;
        }

        setProductionData(
          result.data.rows ?? [],
        );

        setControlKpis(
          result.data.kpis ?? EMPTY_KPIS,
        );

        setEpicorSync(
          result.data.sync ?? null,
        );

        setLoadError(null);
        setDbOnline(true);
      } catch (error) {
        if (!active) {
          return;
        }

        console.error(
          "Error cargando control de produccion:",
          error,
        );

        setDbOnline(false);

        setLoadError(
          error instanceof Error
            ? error.message
            : "No fue posible cargar el control de produccion.",
        );
      } finally {
        requestInProgress = false;

        if (active) {
          setIsLoadingData(false);
        }
      }
    };

    // Primera carga inmediata.
    void loadControl();

    // Cada 15 segundos el frontend pide una nueva lectura.
    // El backend sincroniza Epicor antes de responder.
    const refreshTimer =
      window.setInterval(() => {
        void loadControl();
      }, 15000);

    return () => {
      active = false;

      window.clearInterval(
        refreshTimer,
      );
    };
  }, []);

  {/*
    const KPI_DATA =
    buildKpiData(
      controlKpis,
    );
  */}

  /* =======================================================
     ATAJO CTRL + I
  ======================================================= */

  useEffect(() => {
    const handleShortcut = (
      event: KeyboardEvent,
    ) => {
      const target =
        event.target as HTMLElement;

      /*
       * Evita ejecutar el atajo si en el futuro
       * agregas inputs o formularios.
       */
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (
        event.ctrlKey &&
        event.key.toLowerCase() === "i"
      ) {
        event.preventDefault();

        navigate("/coordinador");
      }
    };

    window.addEventListener(
      "keydown",
      handleShortcut,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleShortcut,
      );
    };
  }, [navigate]);

  /* =======================================================
     RELOJ
  ======================================================= */

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  /* =======================================================
     FULLSCREEN
  ======================================================= */

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        Boolean(
          document.fullscreenElement,
        ),
      );
    };

    handleFullscreenChange();

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange,
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange,
      );
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error(
        "No fue posible cambiar a pantalla completa.",
        error,
      );
    }
  };

  const availableProductionData = productionData.filter(
    (production) =>
      production.operacion?.trim().toLocaleUpperCase("es-CO") !==
      EXCLUDED_OPERATION,
  );

  const statusFilteredProductionData =
    availableProductionData.filter((production) => {
      if (completionFilter === "Completados") {
        return production.estado === "Completada";
      }

      if (completionFilter === "Pendientes") {
        return production.estado !== "Completada";
      }

      return true;
    });

  const jobOptions = Array.from(
    new Set(
      statusFilteredProductionData
        .map((production) => production.ot?.trim())
        .filter((job): job is string => Boolean(job)),
    ),
  ).sort((a, b) =>
    a.localeCompare(b, "es", {
      numeric: true,
      sensitivity: "base",
    }),
  );

  const operationOptions = Array.from(
    new Set(
      statusFilteredProductionData
        .map((production) => production.operacion?.trim())
        .filter((operation): operation is string => Boolean(operation)),
    ),
  ).sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );

  const areaOptions = Array.from(
    new Set(
      statusFilteredProductionData
        .map((production) => production.areaPrimera?.trim())
        .filter((area): area is string => Boolean(area)),
    ),
  ).sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );

  const responsableOptions = Array.from(
    new Set(
      statusFilteredProductionData.flatMap((production) =>
        getResponsableMembers(production.responsable)
          .map(getResponsableDisplayName)
          .filter(Boolean),
      ),
    ),
  ).sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );

  const priorityOptions = Array.from(
    new Set(
      statusFilteredProductionData
        .map((production) => production.prioridadTrabajo)
        .filter(
          (priority): priority is number =>
            priority !== null &&
            Number.isSafeInteger(priority) &&
            priority > 0,
        ),
    ),
  ).sort((a, b) => a - b);

  const hasUnprioritized = statusFilteredProductionData.some(
    (production) =>
      production.prioridadTrabajo == null ||
      production.prioridadTrabajo <= 0,
  );

  const filteredProductionData =
    statusFilteredProductionData.filter((production) => {
      const normalizedJobSearch = selectedJob
        .trim()
        .toLocaleUpperCase("es-CO");

      const productionJob = stripPrefix(
        production.ot?.trim() ?? "",
        "OT-",
      ).toLocaleUpperCase("es-CO");

      const matchesJob =
        !normalizedJobSearch ||
        productionJob.includes(normalizedJobSearch);

      const matchesOperation =
        !selectedOperation ||
        production.operacion?.trim() === selectedOperation;

      const matchesArea =
        !selectedArea ||
        production.areaPrimera?.trim() === selectedArea;

      const productionResponsables = getResponsableMembers(
        production.responsable,
      ).map(getResponsableDisplayName);

      const matchesResponsable =
        !selectedResponsable ||
        productionResponsables.includes(selectedResponsable);

      const matchesPriority =
        !selectedPriority ||
        (selectedPriority === "SIN_PRIORIDAD"
          ? production.prioridadTrabajo == null ||
            production.prioridadTrabajo <= 0
          : production.prioridadTrabajo === Number(selectedPriority));

      return (
        matchesJob &&
        matchesOperation &&
        matchesArea &&
        matchesResponsable &&
        matchesPriority
      );
    });

  const hasActiveFilters = Boolean(
    selectedJob ||
      selectedOperation ||
      selectedArea ||
      selectedResponsable ||
      selectedPriority,
  );

  const clearFilters = () => {
    setSelectedJob("");
    setSelectedOperation("");
    setSelectedArea("");
    setSelectedResponsable("");
    setSelectedPriority("");
  };

  const visibleCountLabel =
    completionFilter === "Completados"
      ? "completados"
      : completionFilter === "Pendientes"
        ? "pendientes"
        : "procesos";

  // =======================================================
  // RESUMEN DE CARGA DE LA VISTA
  //
  // Se calcula DESPUES de los filtros, por eso siempre representa
  // exactamente lo que el usuario esta viendo en pantalla.
  // =======================================================
  const visibleTimeSummary = useMemo(() => {
    const totalProgramadoHoras = filteredProductionData.reduce(
      (total, production) => total + Math.max(production.tiempoTotalHoras || 0, 0),
      0,
    );

    const totalRestanteHoras = filteredProductionData.reduce(
      (total, production) => total + Math.max(production.tiempoRestanteHoras || 0, 0),
      0,
    );

    return {
      totalProgramadoHoras,
      totalRestanteHoras,
    };
  }, [filteredProductionData]);

  return (
    <div
      className="
        min-h-dvh
        bg-[#F4F6F5]
        text-[#111815]
      "
    >
      {/* ===================================================
          HEADER
      =================================================== */}

      <header
        className="
          sticky top-0 z-50

          flex
          h-[clamp(68px,4vw,110px)]

          items-center
          justify-between

          border-b
          border-[#DCE2DF]

          bg-white

          px-[clamp(16px,1.35vw,52px)]
        "
      >
        {/* LOGO / TÍTULO */}

        <div
          className="
            flex
            items-center
            gap-[clamp(10px,0.8vw,22px)]
          "
        >
          <div
            className="
              h-[clamp(34px,2.4vw,64px)]
              w-1.25

              rounded-full

              bg-[#8E1A32]
            "
          />

          <div>
            <div
              className="
                flex
                items-center
                gap-3
              "
            >
              <h1
                className="
                  text-[clamp(20px,1.35vw,44px)]

                  font-black
                  leading-none
                  tracking-tight
                "
              >
                CONTROL
              </h1>

              
            </div>

            <p
              className="
                mt-1

                text-[clamp(10px,0.58vw,18px)]

                text-[#73807B]
              "
            >
              Production Planner · PostgreSQL
            </p>
          </div>
        </div>

        {/* ESTADISTICAS DE HORAS EN EL HEADER */}

        <div
          className="
            hidden
            min-w-0
            flex-1
            items-center
            justify-center
            gap-[clamp(8px,0.6vw,18px)]
            px-[clamp(10px,1vw,30px)]
            lg:flex
          "
        >
          <div
            className="
              min-w-[clamp(150px,11vw,250px)]
              rounded-xl
              border
              border-[#D8DFDC]
              bg-[#F7FAF9]
              px-[clamp(10px,0.75vw,20px)]
              py-[clamp(6px,0.42vw,11px)]
            "
          >
            <p className="text-[clamp(8px,0.42vw,13px)] font-bold uppercase tracking-wider text-[#68756F]">
              Tiempo total asignado
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <strong className="whitespace-nowrap text-[clamp(16px,1.05vw,30px)] font-black leading-none tabular-nums text-[#014638]">
                {formatDurationHours(visibleTimeSummary.totalProgramadoHoras)}
              </strong>
              <span className="whitespace-nowrap text-[clamp(8px,0.4vw,12px)] font-semibold text-[#82908A]">
                {filteredProductionData.length} {visibleCountLabel}
              </span>
            </div>
          </div>

          <div
            className="
              min-w-[clamp(150px,11vw,250px)]
              rounded-xl
              border
              border-[#E3C5CC]
              bg-[#FFF8F9]
              px-[clamp(10px,0.75vw,20px)]
              py-[clamp(6px,0.42vw,11px)]
            "
          >
            <p className="text-[clamp(8px,0.42vw,13px)] font-bold uppercase tracking-wider text-[#78646A]">
              Tiempo restante
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <strong className="whitespace-nowrap text-[clamp(16px,1.05vw,30px)] font-black leading-none tabular-nums text-[#8E1A32]">
                {formatDurationHours(visibleTimeSummary.totalRestanteHoras)}
              </strong>
              <span className="whitespace-nowrap text-[clamp(8px,0.4vw,12px)] font-semibold text-[#927A80]">
                carga pendiente
              </span>
            </div>
          </div>
        </div>

        {/* ACCIONES */}

        <div
          className="
            flex
            shrink-0
            items-center

            gap-[clamp(10px,0.8vw,24px)]
          "
        >
          {/* EPICOR */}

          <div
            className="
              hidden

              items-center
              gap-2

              font-semibold

              text-[#51605A]

              lg:flex

              text-[clamp(10px,0.55vw,18px)]
            "
          >
            <span
              className={`
                h-[clamp(7px,0.45vw,14px)]
                w-[clamp(7px,0.45vw,14px)]

                rounded-full

                ${
                  !dbOnline
                    ? "bg-red-500"
                    : epicorSync?.ok
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                }
              `}
            />

            {!dbOnline
              ? "SERVICIO OFFLINE"
              : epicorSync?.ok
                ? "EPICOR SINCRONIZADO"
                : "EPICOR CON NOVEDADES"}
          </div>

          {/* PRIORIZACION 

          <button
            type="button"
            onClick={() => navigate("/prioridades")}
            className="
              hidden
              items-center
              gap-2
              rounded-lg
              border
              border-[#E3C5CC]
              bg-[#FFF7F8]
              px-[clamp(10px,0.65vw,20px)]
              py-[clamp(6px,0.4vw,12px)]
              text-[clamp(10px,0.52vw,17px)]
              font-bold
              text-[#8E1A32]
              transition-all
              hover:border-[#8E1A32]
              hover:bg-[#FBECEF]
              md:flex
            "
          >
            Prioridades
          </button>
*/}
          {/* FULLSCREEN */}

          {document.fullscreenEnabled && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="
                hidden

                items-center

                rounded-lg

                border
                border-[#D6DDDA]

                bg-white

                px-[clamp(10px,0.65vw,20px)]
                py-[clamp(6px,0.4vw,12px)]

                text-[clamp(10px,0.52vw,17px)]

                font-semibold

                text-[#51605A]

                transition-all

                hover:border-[#014638]
                hover:bg-[#F1F7F5]
                hover:text-[#014638]

                md:flex
              "
            >
              {isFullscreen
                ? "Salir pantalla completa"
                : "Pantalla completa"}
            </button>
          )}

          {/* RELOJ */}

          <div className="text-right">
            <strong
              className="
                block
                whitespace-nowrap

                text-[clamp(18px,1.3vw,42px)]

                font-black
                leading-none

                tabular-nums
              "
            >
              {currentTime.toLocaleTimeString(
                "es-CO",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                },
              )}
            </strong>

            <span
              className="
                mt-1
                hidden

                text-[clamp(9px,0.45vw,15px)]

                capitalize

                text-[#82908A]

                xl:block
              "
            >
              {currentTime.toLocaleDateString(
                "es-CO",
                {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                },
              )}
            </span>
          </div>
        </div>
      </header>

      {/* ===================================================
          MAIN
      =================================================== */}

      <main
        className="
          w-full

          p-[clamp(12px,1.15vw,38px)]
        "
      >
        {/* =================================================
            MATRIZ OPERATIVA
        ================================================= */}

        <section
          className="
            mt-[clamp(12px,1vw,30px)]

            w-full

            overflow-hidden

            rounded-[clamp(10px,0.7vw,20px)]

            border
            border-[#D8DFDC]

            bg-white

            shadow-[0_2px_8px_rgba(12,35,27,0.04)]
          "
        >
          {/* HEADER MATRIZ */}

          <div
            className="
              flex
              flex-wrap
              items-center
              justify-between
              gap-[clamp(10px,0.8vw,22px)]

              border-b
              border-[#E1E6E3]

              px-[clamp(14px,1vw,30px)]
              py-[clamp(10px,0.7vw,22px)]
            "
          >
            <div>
              <h2
                className="
                  text-[clamp(16px,1vw,30px)]

                  font-bold
                  leading-tight
                "
              >
                Matriz operativa
              </h2>

              <p
                className="
                  mt-1

                  text-[clamp(9px,0.5vw,16px)]

                  text-[#79857F]
                "
              >
                Seguimiento de órdenes en tiempo real
              </p>
            </div>

            <div
              className="
                flex
                flex-wrap
                items-center
                justify-end
                gap-[clamp(8px,0.65vw,18px)]
              "
            >
              <label
                className="
                  flex
                  items-center
                  gap-2

                  text-[clamp(9px,0.5vw,16px)]
                  font-semibold
                  text-[#51605A]
                "
              >
                <span className="hidden lg:inline">
                  Estado
                </span>

                <select
                  value={completionFilter}
                  onChange={(event) => {
                    setCompletionFilter(
                      event.target.value as CompletionFilter,
                    );

                    // Limpia los demás filtros porque sus opciones
                    // dependen del estado seleccionado.
                    setSelectedJob("");
                    setSelectedOperation("");
                    setSelectedArea("");
                    setSelectedResponsable("");
                    setSelectedPriority("");
                  }}
                  aria-label="Filtrar por estado de finalización"
                  className="
                    min-w-[clamp(150px,11vw,230px)]
                    rounded-lg
                    border
                    border-[#D6DDDA]
                    bg-white
                    px-[clamp(9px,0.6vw,16px)]
                    py-[clamp(6px,0.4vw,10px)]
                    text-[clamp(10px,0.55vw,17px)]
                    font-semibold
                    text-[#31413B]
                    outline-none
                    transition-colors
                    hover:border-[#9FACA6]
                    focus:border-[#014638]
                    focus:ring-2
                    focus:ring-[#014638]/10
                  "
                >
                  <option value="Pendientes">
                    Solo pendientes
                  </option>

                  <option value="Completados">
                    Solo completados
                  </option>

                  <option value="Todos">
                    Todos
                  </option>
                </select>
              </label>

              <label
                className="
                  flex
                  items-center
                  gap-2

                  text-[clamp(9px,0.5vw,16px)]
                  font-semibold
                  text-[#51605A]
                "
              >
                <span className="hidden lg:inline">
                  Prioridad
                </span>

                <select
                  value={selectedPriority}
                  onChange={(event) =>
                    setSelectedPriority(event.target.value)
                  }
                  aria-label="Filtrar por prioridad"
                  className="
                    min-w-[clamp(135px,9vw,190px)]
                    rounded-lg
                    border
                    border-[#D6DDDA]
                    bg-white
                    px-[clamp(9px,0.6vw,16px)]
                    py-[clamp(6px,0.4vw,10px)]
                    text-[clamp(10px,0.55vw,17px)]
                    font-semibold
                    text-[#31413B]
                    outline-none
                    transition-colors
                    hover:border-[#9FACA6]
                    focus:border-[#8E1A32]
                    focus:ring-2
                    focus:ring-[#8E1A32]/10
                  "
                >
                  <option value="">
                    Todas las prioridades
                  </option>

                  {priorityOptions.map((priority) => (
                    <option
                      key={priority}
                      value={String(priority)}
                    >
                      P{priority}
                    </option>
                  ))}

                  {hasUnprioritized && (
                    <option value="SIN_PRIORIDAD">
                      Sin prioridad
                    </option>
                  )}
                </select>
              </label>

              <label
                className="
                  flex
                  items-center
                  gap-2

                  text-[clamp(9px,0.5vw,16px)]
                  font-semibold
                  text-[#51605A]
                "
              >
                <span className="hidden lg:inline">
                  Job
                </span>

                <div className="relative">
                  <input
                    type="search"
                    list="production-job-options"
                    value={selectedJob}
                    onChange={(event) =>
                      setSelectedJob(event.target.value)
                    }
                    placeholder="Buscar Job..."
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Buscar o filtrar por Job"
                    className="
                      min-w-[clamp(150px,11vw,240px)]
                      rounded-lg
                      border
                      border-[#D6DDDA]
                      bg-white
                      px-[clamp(9px,0.6vw,16px)]
                      py-[clamp(6px,0.4vw,10px)]
                      text-[clamp(10px,0.55vw,17px)]
                      font-semibold
                      text-[#31413B]
                      outline-none
                      transition-colors
                      placeholder:font-medium
                      placeholder:text-[#97A29D]
                      hover:border-[#9FACA6]
                      focus:border-[#014638]
                      focus:ring-2
                      focus:ring-[#014638]/10
                    "
                  />

                  <datalist id="production-job-options">
                    {jobOptions.map((job) => (
                      <option
                        key={job}
                        value={stripPrefix(job, "OT-")}
                      />
                    ))}
                  </datalist>
                </div>
              </label>

              <label
                className="
                  flex
                  items-center
                  gap-2

                  text-[clamp(9px,0.5vw,16px)]
                  font-semibold
                  text-[#51605A]
                "
              >
                <span className="hidden lg:inline">
                  Operación
                </span>

                <select
                  value={selectedOperation}
                  onChange={(event) =>
                    setSelectedOperation(event.target.value)
                  }
                  aria-label="Filtrar por operación"
                  className="
                    min-w-[clamp(150px,12vw,260px)]
                    rounded-lg
                    border
                    border-[#D6DDDA]
                    bg-white
                    px-[clamp(9px,0.6vw,16px)]
                    py-[clamp(6px,0.4vw,10px)]
                    text-[clamp(10px,0.55vw,17px)]
                    font-semibold
                    text-[#31413B]
                    outline-none
                    transition-colors
                    hover:border-[#9FACA6]
                    focus:border-[#014638]
                    focus:ring-2
                    focus:ring-[#014638]/10
                  "
                >
                  <option value="">
                    Todas las operaciones
                  </option>

                  {operationOptions.map((operation) => (
                    <option
                      key={operation}
                      value={operation}
                    >
                      {operation}
                    </option>
                  ))}
                </select>
              </label>

              <label
                className="
                  flex
                  items-center
                  gap-2

                  text-[clamp(9px,0.5vw,16px)]
                  font-semibold
                  text-[#51605A]
                "
              >
                <span className="hidden lg:inline">
                  Área
                </span>

                <select
                  value={selectedArea}
                  onChange={(event) =>
                    setSelectedArea(event.target.value)
                  }
                  aria-label="Filtrar por área"
                  className="
                    min-w-[clamp(140px,10vw,220px)]
                    rounded-lg
                    border
                    border-[#D6DDDA]
                    bg-white
                    px-[clamp(9px,0.6vw,16px)]
                    py-[clamp(6px,0.4vw,10px)]
                    text-[clamp(10px,0.55vw,17px)]
                    font-semibold
                    text-[#31413B]
                    outline-none
                    transition-colors
                    hover:border-[#9FACA6]
                    focus:border-[#014638]
                    focus:ring-2
                    focus:ring-[#014638]/10
                  "
                >
                  <option value="">
                    Todas las áreas
                  </option>

                  {areaOptions.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </label>

              <label
                className="
                  flex
                  items-center
                  gap-2

                  text-[clamp(9px,0.5vw,16px)]
                  font-semibold
                  text-[#51605A]
                "
              >
                <span className="hidden lg:inline">
                  Responsable
                </span>

                <select
                  value={selectedResponsable}
                  onChange={(event) =>
                    setSelectedResponsable(event.target.value)
                  }
                  aria-label="Filtrar por responsable"
                  className="
                    min-w-[clamp(170px,13vw,290px)]
                    rounded-lg
                    border
                    border-[#D6DDDA]
                    bg-white
                    px-[clamp(9px,0.6vw,16px)]
                    py-[clamp(6px,0.4vw,10px)]
                    text-[clamp(10px,0.55vw,17px)]
                    font-semibold
                    text-[#31413B]
                    outline-none
                    transition-colors
                    hover:border-[#9FACA6]
                    focus:border-[#014638]
                    focus:ring-2
                    focus:ring-[#014638]/10
                  "
                >
                  <option value="">
                    Todos los responsables
                  </option>

                  {responsableOptions.map((responsable) => (
                    <option
                      key={responsable}
                      value={responsable}
                    >
                      {responsable}
                    </option>
                  ))}
                </select>
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="
                    rounded-lg
                    border
                    border-[#D6DDDA]
                    bg-[#F7F9F8]
                    px-[clamp(10px,0.7vw,18px)]
                    py-[clamp(6px,0.4vw,10px)]
                    text-[clamp(10px,0.52vw,16px)]
                    font-semibold
                    text-[#51605A]
                    transition-colors
                    hover:border-[#8E1A32]
                    hover:bg-[#FFF5F7]
                    hover:text-[#8E1A32]
                  "
                >
                  Limpiar filtros
                </button>
              )}

              <div
                className="
                  flex
                  items-center
                  gap-2

                  text-[clamp(10px,0.55vw,18px)]
                  font-semibold
                  text-[#08715B]
                "
              >
                <span
                  className="
                    h-2
                    w-2
                    rounded-full
                    bg-emerald-500
                  "
                />

                {filteredProductionData.length} {visibleCountLabel}
              </div>
            </div>
          </div>

          {/* =================================================
              TABLA
          ================================================= */}

          <div
            className="
              max-h-[calc(100dvh-260px)]

              overflow-auto

              overscroll-contain

              [scrollbar-color:#AAB2AE_transparent]
              [scrollbar-thin]
            "
          >
            {/*
              1360px:
              - en pantallas pequeñas aparece scroll horizontal.
              - en Full HD / TV ocupa 100%.
            */}

            <div
              className="
                min-w-[1580px]
                w-full
              "
            >
              {/* HEADER DE COLUMNAS */}

              <div
                style={tableGridStyle}
                className="
                  sticky
                  top-0
                  z-30

                  grid

                  border-b
                  border-[#D8DFDC]

                  bg-[#EEF2F0]

                  shadow-[0_1px_0_rgba(0,0,0,0.03)]
                "
              >
                <HeaderCell center>
                  Prioridad
                </HeaderCell>

                <HeaderCell>
                  Cliente
                </HeaderCell>

                <HeaderCell>
                  Proyecto
                </HeaderCell>

                <HeaderCell center>
                  OV
                </HeaderCell>

                <HeaderCell center>
                  OT
                </HeaderCell>

                <HeaderCell center>
                  Plano
                </HeaderCell>

                <HeaderCell>
                  Operación
                </HeaderCell>

                <HeaderCell>
                  Máquina
                </HeaderCell>

                <HeaderCell center>
                  Ensamble
                </HeaderCell>

                <HeaderCell>
                  Responsable
                </HeaderCell>

                <HeaderCell center>
                  Tiempo restante
                </HeaderCell>

                <HeaderCell center>
                  Cant. Prod.
                </HeaderCell>

                <HeaderCell center>
                  Cant. Fal.
                </HeaderCell>

                <HeaderCell>
                  Área
                </HeaderCell>

                {/*
                <HeaderCell center>
                  Estado
                </HeaderCell>
                */}
              </div>

              {/* FILAS */}

              {isLoadingData &&
                productionData.length === 0 && (
                  <div
                    className="
                      flex min-h-28 items-center
                      justify-center
                      border-b border-[#E7ECE9]
                      bg-white
                      text-[clamp(10px,0.6vw,21px)]
                      font-semibold text-[#73807B]
                    "
                  >
                    Cargando procesos asignados...
                  </div>
                )}

              {!isLoadingData &&
                loadError &&
                productionData.length === 0 && (
                  <div
                    className="
                      flex min-h-28 items-center
                      justify-center
                      border-b border-[#E7ECE9]
                      bg-red-50
                      px-6 text-center
                      text-[clamp(10px,0.6vw,21px)]
                      font-semibold text-red-700
                    "
                  >
                    {loadError}
                  </div>
                )}

              {!isLoadingData &&
                !loadError &&
                availableProductionData.length === 0 && (
                  <div
                    className="
                      flex min-h-28 items-center
                      justify-center
                      border-b border-[#E7ECE9]
                      bg-white
                      text-[clamp(10px,0.6vw,21px)]
                      font-semibold text-[#73807B]
                    "
                  >
                    No hay procesos asignados a personal.
                  </div>
                )}

              {!isLoadingData &&
                !loadError &&
                availableProductionData.length > 0 &&
                filteredProductionData.length === 0 && (
                  <div
                    className="
                      flex min-h-28 items-center
                      justify-center
                      border-b border-[#E7ECE9]
                      bg-white
                      px-6 text-center
                      text-[clamp(10px,0.6vw,21px)]
                      font-semibold text-[#73807B]
                    "
                  >
                    {hasActiveFilters
                      ? "No hay procesos que coincidan con los filtros seleccionados."
                      : completionFilter === "Completados"
                        ? "No hay procesos completados."
                        : completionFilter === "Pendientes"
                          ? "No hay procesos pendientes."
                          : "No hay procesos para mostrar."}
                  </div>
                )}

              {filteredProductionData.map(
                (production) => (
                  <ProductionTableRow
                    key={production.id}
                    production={production}
                  />
                ),
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

/* =========================================================
   PRIORIDAD
========================================================= */

const PriorityBadge = ({
  priority,
}: {
  priority: number | null;
}) => {
  if (priority == null || priority <= 0) {
    return (
      <span className="inline-flex rounded-full bg-[#EEF1EF] px-2.5 py-1 text-[0.82em] font-bold text-[#7A8782]">
        Sin prioridad
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-9 justify-center rounded-full bg-[#F6E8EB] px-2.5 py-1 font-black tabular-nums text-[#8E1A32]">
      P{priority}
    </span>
  );
};


/* =========================================================
   TIEMPO RESTANTE
========================================================= */

const RemainingTimeCell = ({
  production,
}: {
  production: ProductionRow;
}) => {
  if (production.tiempoSinDefinir) {
    return (
      <div
        className="flex flex-col items-center gap-1"
        title="Ingenieria dejo el tiempo estimado total en 0. No se calcula un tiempo artificial."
      >
        <strong className="tabular-nums text-[#A8293F]">
          0h 00m
        </strong>
        <span className="rounded-full bg-[#FFF1F3] px-2 py-0.5 text-[0.72em] font-bold text-[#A8293F]">
          Sin estándar
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-1"
      title={`Tiempo restante = ${production.tiempoTotal} × (${formatNumber(production.cantFal)} / ${formatNumber(production.cantProg)})`}
    >
      <strong className="font-bold tabular-nums text-[#014638]">
        {production.tiempoRestante}
      </strong>
      <span className="text-[0.76em] font-semibold tabular-nums text-[#7A8782]">
        de {production.tiempoTotal}
      </span>
    </div>
  );
};

/* =========================================================
   KPI CARD
========================================================= */
{/*
type KpiCardProps = {
  label: string;
  value: string;
  accent: string;
};

const KpiCard = ({
  label,
  value,
  accent,
}: KpiCardProps) => {
  return (
    <article
      className="
        relative

        overflow-hidden

        rounded-[clamp(10px,0.7vw,20px)]

        border
        border-[#D8DFDC]

        bg-white

        px-[clamp(14px,1vw,28px)]
        py-[clamp(12px,0.8vw,24px)]

        shadow-[0_1px_4px_rgba(12,35,27,0.03)]

        transition-transform

        hover:-translate-y-px
      "
    >

      <span
        className="
          absolute

          bottom-[10%]
          right-[3%]
          top-[10%]

          w-[clamp(3px,0.18vw,7px)]

          rounded-full
        "
        style={{
          backgroundColor: accent,
        }}
      />

      <p
        className="
          text-[clamp(9px,0.48vw,16px)]

          font-bold

          uppercase

          tracking-[0.08em]

          text-[#68756F]
        "
      >
        {label}
      </p>

      <strong
        className="
          mt-[clamp(6px,0.45vw,14px)]

          block

          text-[clamp(32px,2.5vw,72px)]

          font-black

          leading-none

          tabular-nums
        "
      >
        {value}
      </strong>
    </article>
  );
};
*/}
/* =========================================================
   FILA DE LA TABLA
========================================================= */

const ProductionTableRow = ({
  production,
}: {
  production: ProductionRow;
}) => {
  const accent =
    getStatusAccent(production.estado);

  return (
    <div
      style={{
        ...tableGridStyle,

        boxShadow: `inset 3px 0 0 ${accent}`,
      }}
      className="
        grid

        border-b
        border-[#E7ECE9]

        bg-white

        transition-colors

        last:border-b-0

        hover:bg-[#F4F8F6]
      "
    >
      {/* PRIORIDAD GLOBAL DE LA OT */}

      <TableCell center>
        <PriorityBadge priority={production.prioridadTrabajo} />
      </TableCell>

      {/* CLIENTE */}

      <TableCell strong>
        {production.cliente}
      </TableCell>

      {/* PROYECTO */}

      <TableCell>
        {production.proyecto}
      </TableCell>

      {/* OV */}

      <TableCell center>
        {stripPrefix(
          production.ov,
          "OV-",
        )}
      </TableCell>

      {/* OT */}

      <TableCell center>
        <span
          className="
            font-bold

            text-[#8E1A32]
          "
        >
          {stripPrefix(
            production.ot,
            "OT-",
          )}
        </span>
      </TableCell>


      {/* PLANO */}

      <TableCell center>
        {stripPrefix(
          production.plano,
          "PL-",
        )}
      </TableCell>

      {/* OPERACIÓN */}

      <TableCell>
        {production.operacion}
      </TableCell>

      {/* MÁQUINA */}

      <TableCell>
        <span
          className="
            inline-flex

            max-w-full

            truncate

            rounded-md

            bg-[#E4F0EC]

            px-[clamp(6px,0.4vw,12px)]

            py-[clamp(3px,0.22vw,7px)]

            font-semibold

            text-[#014638]
          "
        >
          {production.maquina}
        </span>
      </TableCell>

      {/* ENSAMBLE */}

      <TableCell center>
        {production.ensamble}
      </TableCell>

      {/* RESPONSABLE */}

      <TableCell wrap>
        <ResponsableList value={production.responsable} />
      </TableCell>

      {/* TIEMPO RESTANTE PROPORCIONAL */}

      <TableCell center>
        <RemainingTimeCell production={production} />
      </TableCell>

      {/* CANTIDAD PRODUCIDA - EPICOR */}

      <TableCell center>
        <strong className="tabular-nums">
          {production.cantProd}
        </strong>
      </TableCell>

      {/* CANTIDAD FALTANTE */}

      <TableCell center>
        <div className="flex flex-col items-center gap-1">
          <QuantityBadge
            value={production.cantFal}
          />
          <span className="text-[0.78em] font-semibold text-[#8A9691]">
            de {formatNumber(production.cantProg)}
          </span>
        </div>
      </TableCell>

      {/* ÁREA */}

      <TableCell>
        {production.areaPrimera}
      </TableCell>

      {/* ESTADO 

      <TableCell center>
        <StatusBadge
          estado={production.estado}
        />
      </TableCell>
      */}
    </div>
  );
};

/* =========================================================
   HEADER CELL
========================================================= */

type CellProps = {
  children: ReactNode;
  center?: boolean;
  strong?: boolean;
  wrap?: boolean;
};

const HeaderCell = ({
  children,
  center = false,
}: CellProps) => {
  return (
    <div
      className={`
        flex

        min-h-[clamp(38px,2.7vw,64px)]

        min-w-0

        items-center

        border-r
        border-[#D8DFDC]

        px-[clamp(7px,0.48vw,15px)]

        text-[clamp(8px,0.44vw,15px)]

        font-bold

        uppercase

        tracking-[0.045em]

        text-[#64716B]

        last:border-r-0

        ${
          center
            ? "justify-center text-center"
            : ""
        }
      `}
    >
      {children}
    </div>
  );
};

/* =========================================================
   TABLE CELL
========================================================= */

const TableCell = ({
  children,
  center = false,
  strong = false,
  wrap = false,
}: CellProps) => {
  return (
    <div
      className={`
        flex

        min-h-[clamp(54px,3.6vw,92px)]

        min-w-0

        items-center

        border-r
        border-[#E7ECE9]

        px-[clamp(7px,0.52vw,17px)]

        text-[clamp(10px,0.6vw,21px)]

        text-[#56635E]

        last:border-r-0

        ${
          center
            ? "justify-center text-center"
            : ""
        }

        ${
          strong
            ? "font-semibold text-[#17201D]"
            : ""
        }
      `}
    >
      <div
        className={`
          w-full

          min-w-0

          ${
            wrap
              ? "whitespace-normal wrap-break-words"
              : "truncate"
          }
        `}
      >
        {children}
      </div>
    </div>
  );
};

/* =========================================================
   STATUS BADGE
========================================================= */


{/*
const StatusBadge = ({
  estado,
}: {
  estado: ProductionStatus;
}) => {
  const styles: Record<
    ProductionStatus,
    string
  > = {
    "En proceso":
      "bg-amber-50 text-amber-700",

    Atrasada:
      "bg-red-50 text-red-700",

    Completada:
      "bg-emerald-50 text-emerald-700",

    Liberada:
      "bg-sky-50 text-sky-700",
  };

  return (
    <span
      className={`
        inline-flex

        whitespace-nowrap

        rounded-full

        px-[clamp(7px,0.5vw,16px)]

        py-[clamp(3px,0.22vw,7px)]

        text-[clamp(8px,0.42vw,15px)]

        font-bold

        uppercase

        ${styles[estado]}
      `}
    >
      {estado}
    </span>
  );
};
*/}
/* =========================================================
   QUANTITY BADGE
========================================================= */

const QuantityBadge = ({
  value,
}: {
  value: number;
}) => {
  let styles =
    "bg-emerald-50 text-emerald-700";

  if (value >= 120) {
    styles =
      "bg-red-50 text-red-700";
  } else if (value >= 80) {
    styles =
      "bg-amber-50 text-amber-700";
  }

  return (
    <span
      className={`
        inline-flex

        rounded-full

        px-[clamp(7px,0.4vw,13px)]

        py-[clamp(3px,0.18vw,6px)]

        font-bold

        tabular-nums

        ${styles}
      `}
    >
      {value}
    </span>
  );
};

/* =========================================================
   LISTA DE RESPONSABLES

   REGLA DE VISUALIZACION:
   - Si existen responsables NO lideres, se muestran solamente ellos.
   - Si NO existe ningun responsable no lider, se muestra el lider
     como respaldo visual y se identifica con la etiqueta "Lider".
   - El filtro de responsables continua usando solo responsables
     no lideres, para no cambiar el comportamiento solicitado antes.
========================================================= */

const LEADER_SUFFIX_REGEX = /\s*\(l[ií]der\)\s*$/i;

const getResponsableDisplayName = (member: string): string => {
  return member
    .replace(LEADER_SUFFIX_REGEX, "")
    .trim();
};

const normalizePersonName = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("es-CO");

const getAllResponsableMembers = (value: string): string[] => {
  const normalized = value.trim();

  if (!normalized || normalized === "Sin responsable") {
    return [];
  }

  return normalized
    .split(/\s*\/\s*/)
    .map((member) => member.trim())
    .filter(Boolean);
};

const getLeaderMembers = (value: string): string[] => {
  const leaders = getAllResponsableMembers(value)
    .filter((member) => LEADER_SUFFIX_REGEX.test(member));

  return Array.from(
    new Map(
      leaders.map((member) => [
        normalizePersonName(getResponsableDisplayName(member)),
        member,
      ]),
    ).values(),
  );
};

const getResponsableMembers = (value: string): string[] => {
  const allMembers = getAllResponsableMembers(value);

  if (allMembers.length === 0) {
    return [];
  }

  // Detecta el/los nombres que vienen marcados como lider.
  const leaderNames = new Set(
    allMembers
      .filter((member) => LEADER_SUFFIX_REGEX.test(member))
      .map((member) =>
        normalizePersonName(getResponsableDisplayName(member)),
      ),
  );

  // Conserva unicamente responsables que NO sean lideres.
  // Tambien elimina una eventual copia del lider sin la etiqueta
  // "(Lider)" si el backend llegara a enviarla duplicada.
  const nonLeaderMembers = allMembers.filter((member) => {
    if (LEADER_SUFFIX_REGEX.test(member)) {
      return false;
    }

    const displayName = getResponsableDisplayName(member);

    return !leaderNames.has(normalizePersonName(displayName));
  });

  return Array.from(
    new Map(
      nonLeaderMembers.map((member) => [
        normalizePersonName(getResponsableDisplayName(member)),
        member,
      ]),
    ).values(),
  );
};

const ResponsableList = ({
  value,
}: {
  value: string;
}) => {
  const responsibleMembers = getResponsableMembers(value);
  const leaderMembers = getLeaderMembers(value);

  const usingLeaderFallback =
    responsibleMembers.length === 0 && leaderMembers.length > 0;

  const members = usingLeaderFallback
    ? leaderMembers
    : responsibleMembers;

  if (members.length === 0) {
    return (
      <span className="text-[#87928D]">
        Sin responsable
      </span>
    );
  }

  return (
    <ul
      className="
        flex
        flex-col
        gap-[clamp(3px,0.22vw,7px)]
        py-[clamp(2px,0.15vw,5px)]
        whitespace-normal
      "
    >
      {members.map((member, index) => {
        const displayName =
          getResponsableDisplayName(member);

        return (
          <li
            key={`${member}-${index}`}
            className="flex min-w-0 items-center gap-2"
            title={
              usingLeaderFallback
                ? `${displayName || member} (Lider)`
                : displayName || member
            }
          >
            <span
              aria-hidden="true"
              className={`
                h-[clamp(5px,0.3vw,9px)]
                w-[clamp(5px,0.3vw,9px)]
                shrink-0
                rounded-full
                ${
                  usingLeaderFallback
                    ? "bg-[#C3B880]"
                    : "bg-[#AAB4AF]"
                }
              `}
            />

            <span
              className={`
                min-w-0
                wrap-break-words
                leading-tight
                font-medium
                ${
                  usingLeaderFallback
                    ? "text-[#6F642D]"
                    : "text-[#56635E]"
                }
              `}
            >
              {displayName || member}
            </span>

            {usingLeaderFallback && (
              <span className="shrink-0 rounded-full bg-[#F2ECD4] px-2 py-0.5 text-[0.68em] font-bold uppercase tracking-[0.04em] text-[#82763D]">
                Lider
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

/* =========================================================
   UTILIDADES
========================================================= */

const formatDurationHours = (hours: number): string => {
  const safeHours = Math.max(Number(hours) || 0, 0);
  const totalMinutes = Math.round(safeHours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${wholeHours}h ${String(minutes).padStart(2, "0")}m`;
};

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const stripPrefix = (
  value: string,
  prefix: string,
) => {
  return value.startsWith(prefix)
    ? value.slice(prefix.length)
    : value;
};

const getStatusAccent = (
  estado: ProductionStatus,
) => {
  const accents: Record<
    ProductionStatus,
    string
  > = {
    "En proceso": "#C3B880",
    Atrasada: "#D63A52",
    Completada: "#16866C",
    Liberada: "#4C9AC2",
  };

  return accents[estado];
};

export default Home;