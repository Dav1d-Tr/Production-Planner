import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Sidebar from "../Components/Sidebar";
import { API_BASE } from "../config/api";

// ==========================================================
// CONFIGURACIÓN
// ==========================================================

// const API_BASE = "http://localhost:3000";

// ==========================================================
// TIPOS
// ==========================================================

type Filter =
  | "Todos"
  | "Pendiente"
  | "Programada"
  | "Liberada";

type OrderStatus = Exclude<
  Filter,
  "Todos"
>;

type BackendOv = {
  ov: number;
  cliente: string | null;
};

type BackendOperacion = {
  oprSeq: number;
  opCode: string | null;
  opDesc: string | null;
  opDtlDesc?: string | null;
  maquina: string | null;
  area: string | null;
  cantidadProgramada: number;
  cantidadProducida: number;
  cantidadFaltante: number;
  progreso?: number;
  tiempoEstimadoHoras: number;
  tiempoUnitarioHoras: number;
  tiempoProducidoHoras: number;
};

type BackendEnsamble = {
  assemblySeq: number;

  partNum: string | null;

  descripcion: string | null;

  plano: string | null;

  operaciones?: BackendOperacion[];
};

type BackendOt = {
  company: string;

  ot: string;

  ov: number | null;

  cliente: string | null;

  ovs?: BackendOv[];

  proyecto: string | null;

  partNum: string | null;

  partDescription: string | null;

  plano: string | null;

  prodCode: string | null;

  jobReleased: boolean;

  jobClosed: boolean;

  estadoEpicor?: string;

  cantidadOT: number;

  progreso: number;

  assemblySeq: number | null;

  oprSeq: number | null;

  opCode: string | null;

  operacionActual: string | null;

  cantidadProgramada: number;

  cantidadProducida: number;

  cantidadFaltante: number;

  ensambles: BackendEnsamble[];
};

type OtsResponse = {
  success: boolean;

  data: BackendOt[];

  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type ProgramacionResultData = {
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

type ProgramacionBatchItem =
  | {
      success: true;
      ot: string;
      message: string;
      data: ProgramacionResultData;
    }
  | {
      success: false;
      ot: string;
      message: string;
    };

type ProgramacionBatchData = {
  totalSolicitadas: number;
  exitosas: number;
  fallidas: number;
  resultados: ProgramacionBatchItem[];
};

type ProgramacionApiResponse = {
  success: boolean;
  partial?: boolean;
  message?: string;
  error?: string | null;
  code?: string | null;
  detail?: string | null;
  constraint?: string | null;
  data?: ProgramacionResultData | ProgramacionBatchData;
};

const isBatchProgramacionData = (
  data: ProgramacionApiResponse["data"]
): data is ProgramacionBatchData => {
  return Boolean(
    data &&
      typeof data === "object" &&
      "resultados" in data &&
      Array.isArray((data as ProgramacionBatchData).resultados)
  );
};

// ==========================================================
// TIPOS DE INTERFAZ
// ==========================================================

type Operation = {
  oprSeq: number;
  opCode: string | null;
  opDesc: string | null;
  opDtlDesc: string | null;
  maquina: string | null;
  area: string | null;
  cantidadProgramada: number;
  cantidadProducida: number;
  cantidadFaltante: number;
  progreso: number;
  tiempoEstimadoHoras: number;
  tiempoUnitarioHoras: number;
  tiempoProducidoHoras: number;
};

type Assembly = {
  assemblySeq: number;

  partNum: string | null;

  description: string;

  plano: string | null;

  operations: Operation[];
};

type WorkOrder = {
  id: string;

  ot: string;

  company: string;

  ov: number | null;

  ovs: BackendOv[];

  client: string;

  project: string;

  partNum: string | null;

  partDescription: string | null;

  plano: string | null;

  operation: string;

  quantity: number;

  progress: number;

  status: OrderStatus;

  jobReleased: boolean;

  jobClosed: boolean;

  assemblies: Assembly[];
};

{/* 
  type Kpi = {
    title: string;
    
    value: string;
    
    helper: string;
    
    accentClass: string;
  };
*/}

// ==========================================================
// ESTILOS
// ==========================================================

const statusClasses: Record<
  OrderStatus,
  string
> = {
  Pendiente:
    "bg-[#F2ECD4] text-[#82763D]",

  Programada:
    "bg-[#E8DCE0] text-[#8E1A32]",

  Liberada:
    "bg-[#DDEEEA] text-[#01634F]",
};

// ==========================================================
// UTILIDADES
// ==========================================================

const getAssemblyId = (
  ot: string,
  assemblySeq: number
): string => {
  return `${ot}::${assemblySeq}`;
};

const formatNumber = (
  value: number
): string => {
  return new Intl.NumberFormat(
    "es-CO",
    {
      maximumFractionDigits: 2,
    }
  ).format(value);
};

{/*
  const formatHours = (value: number): string => {
    const safeHours = Math.max(Number(value) || 0, 0);
    const totalMinutes = Math.round(safeHours * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  };
*/}

{/*
type OperationVisual = {
  label: "Completado" | "En proceso" | "Pendiente";
  cardClass: string;
  badgeClass: string;
  barClass: string;
};
*/}

{/*
const getOperationVisual = (operation: Operation): OperationVisual => {
  const completed =
    operation.cantidadProgramada > 0 &&
    operation.cantidadFaltante <= 0;

  if (completed) {
    return {
      label: "Completado",
      cardClass: "border-[#A9D7CA] bg-[#F1F8F6]",
      badgeClass: "bg-[#DDEEEA] text-[#01634F]",
      barClass: "bg-[#08715B]",
    };
  }

  if (operation.cantidadProducida > 0) {
    return {
      label: "En proceso",
      cardClass: "border-[#D8CFA4] bg-[#FCFAF0]",
      badgeClass: "bg-[#F2ECD4] text-[#82763D]",
      barClass: "bg-[#9B8D4F]",
    };
  }

  return {
    label: "Pendiente",
    cardClass: "border-[#DDE1DF] bg-white",
    badgeClass: "bg-[#EEF1EF] text-[#61706B]",
    barClass: "bg-[#8E1A32]",
  };
};
*/}

type ToastVariant = "success" | "error" | "warning" | "info";

type ToastMessage = {
  id: number;
  variant: ToastVariant;
  title: string;
  message: string;
};

const toastStyles: Record<
  ToastVariant,
  {
    wrapper: string;
    icon: string;
    title: string;
  }
> = {
  success: {
    wrapper: "border-[#A9D7CA] bg-[#F1F8F6]",
    icon: "bg-[#DDEEEA] text-[#01634F]",
    title: "text-[#01634F]",
  },
  error: {
    wrapper: "border-[#E4A7B1] bg-[#FFF5F6]",
    icon: "bg-[#F6DDE2] text-[#A8293F]",
    title: "text-[#8E1A32]",
  },
  warning: {
    wrapper: "border-[#D8CFA4] bg-[#FCFAF0]",
    icon: "bg-[#F2ECD4] text-[#82763D]",
    title: "text-[#6F642D]",
  },
  info: {
    wrapper: "border-[#BFD8D2] bg-[#F3F8F7]",
    icon: "bg-[#DDEEEA] text-[#01634F]",
    title: "text-[#014638]",
  },
};

function ToastNotification({
  toast,
  onClose,
}: {
  toast: ToastMessage;
  onClose: () => void;
}) {
  const style = toastStyles[toast.variant];

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`fixed right-4 top-4 z-100 w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border shadow-[0_18px_50px_rgba(17,24,22,0.18)] sm:right-6 sm:top-6 ${style.wrapper}`}
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.icon}`}
          aria-hidden="true"
        >
          {toast.variant === "success" ? (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="m5 12.5 4.2 4.2L19 7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : toast.variant === "error" ? (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M8 8l8 8M16 8l-8 8"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M12 8v5m0 3.5v.1"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${style.title}`}>
            {toast.title}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-5 text-[#53615C]">
            {toast.message}
          </p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#89938F]">
            Se cerrará automáticamente en 5 segundos
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar notificación"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#71807B] transition-colors hover:bg-black/5 hover:text-[#26302D]"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path
              d="M7 7l10 10M17 7 7 17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="h-1 bg-black/5">
        <div className="h-full w-full bg-current opacity-20" />
      </div>
    </div>
  );
}

// ==========================================================
// COMPONENTE KPI
// ==========================================================

{/*
function KpiCard({
  title,
  value,
  helper,
  accentClass,
}: Kpi) {
  return (
    <article
      className="
        relative
        overflow-hidden

        rounded-2xl

        border
        border-[#D8DEDB]

        bg-white

        px-6
        py-5

        shadow-sm

        min-[3840px]:rounded-3xl
        min-[3840px]:px-10
        min-[3840px]:py-8
      "
    >
      <span
        aria-hidden="true"
        className={`
          absolute
          inset-y-0
          left-0

          w-1.5

          ${accentClass}
        `}
      />

      <p
        className="
          text-sm
          font-semibold
          text-[#61706B]

          min-[3840px]:text-2xl
        "
      >
        {title}
      </p>

      <div
        className="
          mt-2

          flex
          flex-wrap
          items-end

          gap-3
        "
      >
        <strong
          className="
            text-4xl
            leading-none
            text-[#111816]

            min-[3840px]:text-7xl
          "
        >
          {value}
        </strong>

        <span
          className="
            rounded-full

            bg-[#E1F0EC]

            px-3
            py-1

            text-xs
            font-semibold
            text-[#08715B]

            min-[3840px]:px-5
            min-[3840px]:py-2
            min-[3840px]:text-xl
          "
        >
          {helper}
        </span>
      </div>
    </article>
  );
}
*/}

// ==========================================================
// BADGE ESTADO
// ==========================================================

function StatusBadge({
  status,
}: {
  status: OrderStatus;
}) {
  return (
    <span
      className={`
        inline-flex
        shrink-0
        items-center

        rounded-full

        px-3
        py-1.5

        text-xs
        font-semibold

        min-[3840px]:px-5
        min-[3840px]:py-2.5
        min-[3840px]:text-xl

        ${statusClasses[status]}
      `}
    >
      {status}
    </span>
  );
}

// ==========================================================
// COMPONENTE PRINCIPAL
// ==========================================================

export default function Planning() {
  // ========================================================
  // ESTADOS
  // ========================================================

  const [
    activeFilter,
    ,
  ] = useState<Filter>(
    "Todos"
  );

  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    debouncedSearch,
    setDebouncedSearch,
  ] = useState("");

  const [
    workOrders,
    setWorkOrders,
  ] = useState<WorkOrder[]>(
    []
  );

  const [
    loadingOrders,
    setLoadingOrders,
  ] = useState(true);

  const [
    ordersError,
    setOrdersError,
  ] = useState<
    string | null
  >(null);

  const [
    ,
    setTotalOrders,
  ] = useState(0);

  const [
    expandedOrderId,
    setExpandedOrderId,
  ] = useState("");

  const [
    selectedOrderId,
    setSelectedOrderId,
  ] = useState("");

  const [
    selectedAssemblies,
    setSelectedAssemblies,
  ] = useState<Set<string>>(
    () => new Set()
  );

  const getTodayLocal = (): string => {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const [
    scheduleDate,
    setScheduleDate,
  ] = useState<string>(() => getTodayLocal());

  const [
    savingProgramming,
    setSavingProgramming,
  ] = useState(false);

  const [
    projectConfigByOrder,
    setProjectConfigByOrder,
  ] = useState<
    Record<
      string,
      {
        keepEpicorProject: boolean;
        projectName: string;
      }
    >
  >({});

  const [
    toast,
    setToast,
  ] = useState<ToastMessage | null>(null);

  const showToast = (
    variant: ToastVariant,
    title: string,
    message: string
  ): void => {
    setToast({
      id: Date.now(),
      variant,
      title,
      message,
    });
  };

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 5_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  // ========================================================
  // DEBOUNCE BUSCADOR
  // ========================================================

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          setDebouncedSearch(
            searchTerm.trim()
          );
        },
        350
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [searchTerm]);

  // ========================================================
  // CARGAR OTs
  // ========================================================

  useEffect(() => {
    const controller =
      new AbortController();

    const loadOrders =
      async () => {
        try {
          setLoadingOrders(
            true
          );

          setOrdersError(
            null
          );

          const params =
            new URLSearchParams(
              {
                page: "1",
                pageSize: "1000",
              }
            );

          if (
            debouncedSearch
          ) {
            params.set(
              "search",
              debouncedSearch
            );
          }

          const response =
            await fetch(
              `${ API_BASE}/ots?${params.toString()}`,
              {
                method: "GET",

                signal:
                  controller.signal,

                headers: {
                  Accept:
                    "application/json",
                },
              }
            );

          if (
            !response.ok
          ) {
            throw new Error(
              `Error ${response.status} consultando las OTs`
            );
          }

          const result:
            OtsResponse =
            await response.json();

          if (
            !result.success
          ) {
            throw new Error(
              "El backend no pudo obtener las OTs"
            );
          }

          // ================================================
          // MAPEAR DATOS BACKEND -> FRONTEND
          // ================================================

          const mappedOrders:
            WorkOrder[] =
            result.data.map(
              (
                ot
              ): WorkOrder => {
                let status:
                  OrderStatus =
                  "Pendiente";

                if (
                  ot.jobReleased
                ) {
                  status =
                    "Liberada";
                }

                const assemblies:
                  Assembly[] =
                  (
                    ot.ensambles ??
                    []
                  ).map(
                    (
                      assembly
                    ) => ({
                      assemblySeq:
                        Number(
                          assembly.assemblySeq
                        ),

                      partNum:
                        assembly.partNum ??
                        null,

                      description:
                        assembly.descripcion?.trim() ||
                        `Ensamble ${assembly.assemblySeq}`,

                      plano:
                        assembly.plano ??
                        null,

                      operations:
                        (assembly.operaciones ?? []).map(
                          (operation): Operation => {
                            const cantidadProgramada = Math.max(
                              Number(operation.cantidadProgramada ?? 0),
                              0
                            );
                            const cantidadProducida = Math.max(
                              Number(operation.cantidadProducida ?? 0),
                              0
                            );
                            const cantidadFaltante = Math.max(
                              Number(operation.cantidadFaltante ?? 0),
                              0
                            );

                            const calculatedProgress =
                              cantidadProgramada > 0
                                ? Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    (cantidadProducida * 100) /
                                    cantidadProgramada
                                  )
                                )
                                : 0;

                            return {
                              oprSeq: Number(operation.oprSeq ?? 0),
                              opCode: operation.opCode ?? null,
                              opDesc: operation.opDesc ?? null,
                              opDtlDesc: operation.opDtlDesc ?? null,
                              maquina: operation.maquina ?? null,
                              area: operation.area ?? null,
                              cantidadProgramada,
                              cantidadProducida,
                              cantidadFaltante,
                              progreso: Math.min(
                                100,
                                Math.max(
                                  0,
                                  Number(
                                    operation.progreso ??
                                    calculatedProgress
                                  )
                                )
                              ),
                              tiempoEstimadoHoras: Math.max(
                                Number(operation.tiempoEstimadoHoras ?? 0),
                                0
                              ),
                              tiempoUnitarioHoras: Math.max(
                                Number(operation.tiempoUnitarioHoras ?? 0),
                                0
                              ),
                              tiempoProducidoHoras: Math.max(
                                Number(operation.tiempoProducidoHoras ?? 0),
                                0
                              ),
                            };
                          }
                        ),
                    })
                  );

                return {
                  id:
                    ot.ot,

                  ot:
                    ot.ot,

                  company:
                    ot.company,

                  ov:
                    ot.ov,

                  ovs:
                    ot.ovs ??
                    [],

                  client:
                    ot.cliente?.trim() ||
                    "Sin cliente",

                  project:
                    ot.proyecto?.trim() ||
                    "",

                  partNum:
                    ot.partNum ??
                    null,

                  partDescription:
                    ot.partDescription ??
                    null,

                  plano:
                    ot.plano ??
                    null,

                  operation:
                    ot.operacionActual?.trim() ||
                    "Sin operación pendiente",

                  quantity:
                    Number(
                      ot.cantidadOT ??
                      0
                    ),

                  progress:
                    Math.min(
                      100,
                      Math.max(
                        0,
                        Number(
                          ot.progreso ??
                          0
                        )
                      )
                    ),

                  status,

                  jobReleased:
                    Boolean(
                      ot.jobReleased
                    ),

                  jobClosed:
                    Boolean(
                      ot.jobClosed
                    ),

                  assemblies,
                };
              }
            );

          setWorkOrders(
            mappedOrders
          );

          setTotalOrders(
            result.pagination
              .total
          );
        } catch (error) {
          if (
            error instanceof
            DOMException &&
            error.name ===
            "AbortError"
          ) {
            return;
          }

          console.error(
            "Error cargando OTs:",
            error
          );

          setOrdersError(
            error instanceof Error
              ? error.message
              : "No fue posible cargar las OTs"
          );
        } finally {
          if (
            !controller.signal
              .aborted
          ) {
            setLoadingOrders(
              false
            );
          }
        }
      };

    loadOrders();

    return () => {
      controller.abort();
    };
  }, [debouncedSearch]);

  // ========================================================
  // FILTROS
  // ========================================================

  const filteredOrders =
    useMemo(() => {
      return workOrders.filter(
        (order) => {
          return (
            activeFilter ===
            "Todos" ||
            order.status ===
            activeFilter
          );
        }
      );
    }, [
      activeFilter,
      workOrders,
    ]);

  // ========================================================
  // ENSAMBLES / OTs SELECCIONADOS
  // ========================================================

  const selectedProgrammingOrders =
    useMemo(() => {
      return workOrders
        .map((order) => {
          const assemblies = order.assemblies.filter(
            (assembly) =>
              selectedAssemblies.has(
                getAssemblyId(
                  order.ot,
                  assembly.assemblySeq
                )
              )
          );

          return assemblies.length > 0
            ? { order, assemblies }
            : null;
        })
        .filter(
          (item): item is {
            order: WorkOrder;
            assemblies: Assembly[];
          } => Boolean(item)
        );
    }, [workOrders, selectedAssemblies]);

  const selectedOrderCount =
    selectedProgrammingOrders.length;

  const selectedAssemblyCount =
    selectedProgrammingOrders.reduce(
      (total, item) =>
        total + item.assemblies.length,
      0
    );

  const focusedProgrammingItem =
    selectedProgrammingOrders.find(
      ({ order }) => order.id === selectedOrderId
    ) ??
    selectedProgrammingOrders[0] ??
    null;

  const focusedOrder =
    focusedProgrammingItem?.order ?? null;

  const selectedProjectConfig = focusedOrder
    ? projectConfigByOrder[focusedOrder.id] ?? {
        keepEpicorProject: true,
        projectName: focusedOrder.project,
      }
    : null;

  const getProjectToSave = (order: WorkOrder): string | null => {
    const config = projectConfigByOrder[order.id];

    const value =
      config?.keepEpicorProject === false
        ? config.projectName
        : order.project;

    return value.trim() || null;
  };

  const updateProjectConfig = (
    order: WorkOrder,
    changes: Partial<{
      keepEpicorProject: boolean;
      projectName: string;
    }>
  ) => {
    setProjectConfigByOrder((current) => {
      const previous = current[order.id] ?? {
        keepEpicorProject: true,
        projectName: order.project,
      };

      return {
        ...current,
        [order.id]: {
          ...previous,
          ...changes,
        },
      };
    });
  };

  const visibleAssemblyIds = useMemo(
    () =>
      filteredOrders.flatMap((order) =>
        order.assemblies.map((assembly) =>
          getAssemblyId(
            order.ot,
            assembly.assemblySeq
          )
        )
      ),
    [filteredOrders]
  );

  const allVisibleAssembliesSelected =
    visibleAssemblyIds.length > 0 &&
    visibleAssemblyIds.every((id) =>
      selectedAssemblies.has(id)
    );

  // ========================================================
  // KPI
  // ========================================================

  {/* 
  const kpis =
    useMemo<Kpi[]>(() => {
      const liberadas =
        workOrders.filter(
          (order) =>
            order.status ===
            "Liberada"
        ).length;

      const enProceso =
        workOrders.filter(
          (order) =>
            order.progress >
              0 &&
            order.progress <
              100
        ).length;

      const completadas =
        workOrders.filter(
          (order) =>
            order.progress >=
            100
        ).length;

      return [
        {
          title:
            "OTs disponibles",

          value:
            totalOrders.toString(),

          helper:
            `${workOrders.length} cargadas`,

          accentClass:
            "bg-[#8E1A32]",
        },

        {
          title:
            "En proceso",

          value:
            enProceso.toString(),

          helper:
            "Según Epicor",

          accentClass:
            "bg-[#014638]",
        },

        {
          title:
            "Completadas",

          value:
            completadas.toString(),

          helper:
            "100% avance",

          accentClass:
            "bg-[#9B8D4F]",
        },

        {
          title:
            "Liberadas",

          value:
            liberadas.toString(),

          helper:
            "JobReleased",

          accentClass:
            "bg-[#C63A50]",
        },
      ];
    }, [
      workOrders,
      totalOrders,
    ]);
  */}


  // ========================================================
  // EXPANDIR OT
  // ========================================================

  const toggleOrderExpansion = (
    order: WorkOrder
  ) => {
    const isCurrentlyOpen =
      expandedOrderId === order.id;

    setSelectedOrderId(order.id);

    if (isCurrentlyOpen) {
      setExpandedOrderId("");
      return;
    }

    setExpandedOrderId(order.id);
  };

  // ========================================================
  // SELECCIONAR / DESELECCIONAR ENSAMBLE
  // ========================================================

  const toggleAssembly = (
    order: WorkOrder,
    assemblySeq: number
  ) => {
    const id = getAssemblyId(
      order.ot,
      assemblySeq
    );

    setSelectedOrderId(order.id);
    setExpandedOrderId(order.id);

    setSelectedAssemblies((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  // ========================================================
  // SELECCIONAR TODOS LOS ENSAMBLES DE UNA OT
  // ========================================================

  const toggleAllAssemblies = (
    order: WorkOrder
  ) => {
    const ids = order.assemblies.map(
      (assembly) =>
        getAssemblyId(
          order.ot,
          assembly.assemblySeq
        )
    );

    if (ids.length === 0) {
      return;
    }

    setSelectedOrderId(order.id);

    const allSelected = ids.every((id) =>
      selectedAssemblies.has(id)
    );

    setSelectedAssemblies((current) => {
      const next = new Set(current);

      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }

      return next;
    });
  };

  // ========================================================
  // SELECCIONAR / QUITAR TODAS LAS OTs VISIBLES
  // ========================================================

  const toggleAllVisibleOrders = () => {
    if (visibleAssemblyIds.length === 0) {
      return;
    }

    setSelectedAssemblies((current) => {
      const next = new Set(current);

      if (allVisibleAssembliesSelected) {
        visibleAssemblyIds.forEach((id) =>
          next.delete(id)
        );
      } else {
        visibleAssemblyIds.forEach((id) =>
          next.add(id)
        );
      }

      return next;
    });

    if (!allVisibleAssembliesSelected) {
      const firstOrder = filteredOrders.find(
        (order) => order.assemblies.length > 0
      );

      if (firstOrder) {
        setSelectedOrderId(firstOrder.id);
      }
    }
  };

  const clearProgrammingSelection = () => {
    setSelectedAssemblies(new Set());
    setSelectedOrderId("");
    setExpandedOrderId("");
  };

  // ========================================================
  // CONFIRMAR PROGRAMACIÓN MASIVA
  // ========================================================

  const handleConfirmProgramming = async () => {
    if (selectedProgrammingOrders.length === 0) {
      showToast(
        "warning",
        "Falta seleccionar OTs",
        "Selecciona al menos un ensamble de una o varias OTs para continuar."
      );
      return;
    }

    if (!scheduleDate) {
      showToast(
        "warning",
        "Fecha requerida",
        "Selecciona la fecha inicial de la programación."
      );
      return;
    }

    if (savingProgramming) {
      return;
    }

    const payload = {
      programaciones: selectedProgrammingOrders.map(
        ({ order, assemblies }) => ({
          ot: order.ot,
          company: order.company,
          ov: order.ov,
          fecha: scheduleDate,
          proyecto: getProjectToSave(order),
          ensambles: assemblies.map((assembly) => ({
            assemblySeq: assembly.assemblySeq,
          })),
        })
      ),
    };

    setSavingProgramming(true);

    try {
      const response = await fetch(
        `${API_BASE}/programacion`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const responseText = await response.text();

      let result: ProgramacionApiResponse | null = null;

      if (responseText) {
        try {
          result = JSON.parse(
            responseText
          ) as ProgramacionApiResponse;
        } catch {
          result = null;
        }
      }

      const batchData =
        result && isBatchProgramacionData(result.data)
          ? result.data
          : null;

      if (
        !response.ok ||
        !result?.success ||
        !batchData
      ) {
        console.error(
          "Error POST /api/programacion lote:",
          {
            status: response.status,
            statusText: response.statusText,
            payload,
            response: result ?? responseText,
          }
        );

        const failedMessages =
          batchData?.resultados
            .filter((item) => !item.success)
            .map((item) =>
              `${item.ot}: ${item.message}`
            ) ?? [];

        const technicalDetail = [
          result?.error,
          result?.detail,
          result?.code
            ? `Código PostgreSQL: ${result.code}`
            : null,
          result?.constraint
            ? `Restricción: ${result.constraint}`
            : null,
        ]
          .filter(
            (item): item is string => Boolean(item)
          )
          .join("\n");

        const baseMessage =
          failedMessages.length > 0
            ? failedMessages.join("\n")
            : result?.message ??
              `Error ${response.status} guardando la programación.`;

        throw new Error(
          technicalDetail
            ? `${baseMessage}\n${technicalDetail}`
            : baseMessage
        );
      }

      const successfulItems =
  batchData.resultados.filter(
    (
      item
    ): item is Extract<
      ProgramacionBatchItem,
      { success: true }
    > => item.success === true
  );

const failedItems =
  batchData.resultados.filter(
    (
      item
    ): item is Extract<
      ProgramacionBatchItem,
      { success: false }
    > => item.success === false
  );

const successfulOts = new Set(
  successfulItems.map(
    (item) => item.ot
  )
);

const ensamblesGuardados =
  successfulItems.reduce(
    (total, item) =>
      total +
      item.data.ensamblesGuardados,
    0
  );

const procesosGuardados =
  successfulItems.reduce(
    (total, item) =>
      total +
      item.data.procesosGuardados,
    0
  );

      // Quitamos de la selección solo las OTs que sí se guardaron.
      // Las que fallaron quedan seleccionadas para poder reintentarlas.
      setSelectedAssemblies((current) => {
        const next = new Set<string>();

        current.forEach((id) => {
          const belongsToSuccessfulOt =
            Array.from(successfulOts).some((ot) =>
              id.startsWith(`${ot}::`)
            );

          if (!belongsToSuccessfulOt) {
            next.add(id);
          }
        });

        return next;
      });

      setProjectConfigByOrder((current) => {
        const next = { ...current };

        workOrders.forEach((order) => {
          if (successfulOts.has(order.ot)) {
            delete next[order.id];
          }
        });

        return next;
      });

      if (failedItems.length === 0) {
        showToast(
          "success",
          "Programación masiva guardada",
          `${batchData.exitosas} OT(s), ${ensamblesGuardados} ensamble(s) y ${procesosGuardados} proceso(s) guardados correctamente.`
        );

        clearProgrammingSelection();
        setScheduleDate(getTodayLocal());
      } else {
        const detail = failedItems
          .slice(0, 5)
          .map((item) => `${item.ot}: ${item.message}`)
          .join("\n");

        showToast(
          "warning",
          "Programación parcial",
          `${batchData.exitosas} OT(s) programada(s) y ${batchData.fallidas} con error.\n${detail}${failedItems.length > 5 ? "\n..." : ""}`
        );

        const firstFailed = selectedProgrammingOrders.find(
          ({ order }) =>
            failedItems.some(
              (item) => item.ot === order.ot
            )
        );

        setSelectedOrderId(
          firstFailed?.order.id ?? ""
        );
        setExpandedOrderId(
          firstFailed?.order.id ?? ""
        );
      }
    } catch (error) {
      console.error(
        "Error guardando programación masiva:",
        error
      );

      showToast(
        "error",
        "No fue posible programar las OTs",
        error instanceof Error
          ? error.message
          : "No fue posible guardar la programación."
      );
    } finally {
      setSavingProgramming(false);
    }
  };

  // ========================================================
  // RENDER
  // ========================================================

  return (
    <div
      className="
        min-h-screen
        bg-[#F6F5F1]

        md:flex
      "
    >
      {toast && (
        <ToastNotification
          key={toast.id}
          toast={toast}
          onClose={() => setToast(null)}
        />
      )}

      <Sidebar
        activePage="programacion"
      />

      <div
        className="
          min-w-0
          flex-1
        "
      >
        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <header
          className="
            sticky
            top-0
            z-30

            border-b
            border-[#E8E9E6]

            bg-white/95

            backdrop-blur
          "
        >
          <div
            className="
              flex
              min-h-20
              items-center
              justify-between

              gap-4

              px-4
              pl-20

              sm:px-6
              sm:pl-20

              md:px-8
              md:pl-8

              min-[3840px]:min-h-32
              min-[3840px]:px-16
            "
          >
            <div
              className="
                min-w-0
              "
            >
              <h1
                className="
                  truncate

                  text-xl
                  font-bold
                  text-[#111816]

                  sm:text-2xl

                  lg:text-3xl

                  min-[3840px]:text-5xl
                "
              >
                Programación de OTs
              </h1>

              <p
                className="
                  mt-1

                  hidden

                  text-sm
                  text-[#71807B]

                  sm:block

                  min-[3840px]:text-2xl
                "
              >
                Programación de OTs · Epicor
              </p>
            </div>

            {/*
            <div
              className="
                hidden

                h-11
                w-11

                items-center
                justify-center

                rounded-full

                bg-[#014638]

                text-sm
                font-bold
                text-white

                sm:flex
              "
            >
              DR
            </div>
            */}
          </div>
        </header>

        <main
          className="
            px-4
            py-6

            sm:px-6

            lg:px-8

            min-[3840px]:px-16
            min-[3840px]:py-12
          "
        >
          {/* ================================================= */}
          {/* KPIs */}
          {/* ================================================= 

          <section
            className="
              grid
              grid-cols-1

              gap-4

              sm:grid-cols-2

              xl:grid-cols-4

              min-[3840px]:gap-8
            "
          >
            {kpis.map(
              (kpi) => (
                <KpiCard
                  key={
                    kpi.title
                  }
                  {...kpi}
                />
              )
            )}
          </section>

          */}

          {/* ================================================= */}
          {/* BUSCADOR + FILTROS */}
          {/* ================================================= */}

          <section
            className="
              mt-7

              grid

              gap-3

              xl:grid-cols-[minmax(0,1fr)_auto]
            "
          >
            <label
              className="
                flex
                min-h-14
                items-center

                gap-3

                rounded-xl

                border
                border-[#D5DBD8]

                bg-white

                px-4

                focus-within:border-[#8E1A32]
              "
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="
                  h-6
                  w-6

                  shrink-0

                  text-[#6A7974]
                "
              >
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="2"
                />

                <path
                  d="M16.5 16.5L21 21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>

              <input
                type="search"

                value={
                  searchTerm
                }

                onChange={(
                  event
                ) => {
                  setSearchTerm(
                    event.target.value
                  );
                }}

                placeholder="Buscar OT, OV, cliente o proyecto"

                className="
                  min-w-0

                  flex-1

                  bg-transparent

                  text-sm
                  text-[#18201E]

                  outline-none

                  placeholder:text-[#89938F]
                "
              />
            </label>
            {/* 
            <div
              className="
                flex

                gap-2

                overflow-x-auto
              "
            >
              {(
                [
                  "Todos",
                  "Pendiente",
                  "Programada",
                  "Liberada",
                ] as Filter[]
              ).map(
                (filter) => (
                  <button
                    key={
                      filter
                    }

                    type="button"

                    onClick={() => {
                      setActiveFilter(
                        filter
                      );
                    }}

                    className={`
                      min-h-12

                      shrink-0

                      rounded-xl

                      border

                      px-5

                      text-sm
                      font-semibold

                      transition-colors

                      ${activeFilter ===
                        filter
                        ? "border-[#8E1A32] bg-[#8E1A32] text-white"
                        : "border-[#D5DBD8] bg-white text-[#1F2926] hover:border-[#8E1A32]"
                      }
                    `}
                  >
                    {filter}
                  </button>
                )
              )}
            </div>
            */}
          </section>

          {/* ================================================= */}
          {/* CONTENIDO */}
          {/* ================================================= */}

          <div
            className="
              mt-7

              grid
              items-start

              gap-6

              xl:grid-cols-[minmax(0,1fr)_380px]

              min-[3840px]:grid-cols-[minmax(0,1fr)_620px]
            "
          >
            {/* =============================================== */}
            {/* LISTADO OTs */}
            {/* =============================================== */}

            <section
              className="
                min-w-0
              "
            >
              <div
                className="
                  mb-5
                "
              >
                <div
                  className="
                    flex
                    items-end
                    justify-between

                    gap-4
                  "
                >
                  <div>
                    <h2
                      className="
                        text-xl
                        font-bold
                        text-[#111816]

                        min-[3840px]:text-4xl
                      "
                    >
                      Órdenes disponibles
                    </h2>

                    <p
                      className="
                        mt-1

                        text-sm
                        text-[#71807B]

                        min-[3840px]:text-2xl
                      "
                    >
                      Despliega una OT y selecciona los ensambles que deseas programar.
                    </p>
                  </div>

                  {!loadingOrders &&
                    !ordersError && (
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs font-semibold text-[#71807B]">
                          {filteredOrders.length} resultados
                        </span>

                        {visibleAssemblyIds.length > 0 && (
                          <button
                            type="button"
                            onClick={toggleAllVisibleOrders}
                            className="rounded-lg border border-[#D5DBD8] bg-white px-3 py-2 text-xs font-semibold text-[#8E1A32] transition-colors hover:border-[#8E1A32] hover:bg-[#F8EFF2]"
                          >
                            {allVisibleAssembliesSelected
                              ? "Quitar selección visible"
                              : "Seleccionar todas visibles"}
                          </button>
                        )}
                      </div>
                    )}
                </div>
              </div>

              <div
                className="
                  space-y-3

                  min-[3840px]:space-y-6
                "
              >
                {/* LOADING */}

                {loadingOrders && (
                  <div
                    className="
                      rounded-xl

                      border
                      border-[#D5DBD8]

                      bg-white

                      px-6
                      py-14

                      text-center
                      text-[#71807B]
                    "
                  >
                    <div
                      className="
                        mx-auto
                        mb-4

                        h-8
                        w-8

                        animate-spin

                        rounded-full

                        border-4
                        border-[#DDE1DF]
                        border-t-[#8E1A32]
                      "
                    />

                    <p
                      className="
                        font-semibold
                      "
                    >
                      Cargando OTs desde Epicor...
                    </p>
                  </div>
                )}

                {/* ERROR */}

                {!loadingOrders &&
                  ordersError && (
                    <div
                      className="
                        rounded-xl

                        border
                        border-[#E4A7B1]

                        bg-[#FFF5F6]

                        px-6
                        py-10

                        text-center
                      "
                    >
                      <p
                        className="
                          font-bold
                          text-[#8E1A32]
                        "
                      >
                        No fue posible cargar las OTs
                      </p>

                      <p
                        className="
                          mt-2

                          text-sm
                          text-[#71807B]
                        "
                      >
                        {
                          ordersError
                        }
                      </p>
                    </div>
                  )}

                {/* OTs */}

                {!loadingOrders &&
                  !ordersError &&
                  filteredOrders.map(
                    (order) => {
                      const expanded =
                        expandedOrderId ===
                        order.id;

                      const orderIsFocused =
                        selectedOrderId ===
                        order.id;

                      const assemblyIds =
                        order.assemblies.map(
                          (assembly) =>
                            getAssemblyId(
                              order.ot,
                              assembly.assemblySeq
                            )
                        );

                      const allAssembliesSelected =
                        assemblyIds.length > 0 &&
                        assemblyIds.every((id) =>
                          selectedAssemblies.has(id)
                        );

                      const selectedCount =
                        order.assemblies.filter(
                          (assembly) =>
                            selectedAssemblies.has(
                              getAssemblyId(
                                order.ot,
                                assembly.assemblySeq
                              )
                            )
                        ).length;

                      return (
                        <article
                          key={
                            order.id
                          }

                          className={`
                            overflow-hidden

                            rounded-xl

                            border

                            bg-white

                            transition-colors

                            ${selectedCount > 0
                              ? "border-[#8E1A32]"
                              : "border-[#D5DBD8]"
                            }
                            ${orderIsFocused
                              ? "ring-1 ring-[#8E1A32]/10"
                              : ""
                            }
                          `}
                        >
                          {/* CABECERA OT */}

                          <div
                            className="
                              flex
                              flex-wrap
                              items-center

                              gap-3

                              px-4
                              py-4

                              min-[3840px]:gap-6
                              min-[3840px]:px-8
                              min-[3840px]:py-7
                            "
                          >
                            {/* CHECKBOX TODOS LOS ENSAMBLES */}

                            <input
                              type="checkbox"

                              checked={
                                allAssembliesSelected
                              }

                              disabled={
                                order.assemblies.length ===
                                0
                              }

                              onChange={() => {
                                toggleAllAssemblies(
                                  order
                                );
                              }}

                              aria-label={`Seleccionar todos los ensambles de ${order.ot}`}

                              className="
                                h-5
                                w-5

                                shrink-0

                                cursor-pointer

                                accent-[#8E1A32]

                                disabled:cursor-not-allowed
                                disabled:opacity-40

                                min-[3840px]:h-8
                                min-[3840px]:w-8
                              "
                            />

                            {/* EXPANDIR OT */}

                            <button
                              type="button"

                              aria-expanded={
                                expanded
                              }

                              aria-label={
                                expanded
                                  ? `Contraer ${order.ot}`
                                  : `Ver ensambles de ${order.ot}`
                              }

                              onClick={() => {
                                toggleOrderExpansion(
                                  order
                                );
                              }}

                              className="
                                flex

                                h-8
                                w-8

                                shrink-0

                                items-center
                                justify-center

                                rounded-lg

                                text-2xl
                                text-[#61706B]

                                hover:bg-[#EEF1EF]

                                min-[3840px]:h-12
                                min-[3840px]:w-12
                                min-[3840px]:text-4xl
                              "
                            >
                              <span
                                className={`
                                  transition-transform

                                  ${expanded
                                    ? "rotate-90"
                                    : ""
                                  }
                                `}
                              >
                                ›
                              </span>
                            </button>

                            {/* INFORMACIÓN OT */}

                            <div
                              className="
                                min-w-45

                                flex-1
                              "
                            >
                              <p
                                className="
                                  font-bold
                                  text-[#17201D]

                                  min-[3840px]:text-2xl
                                "
                              >
                                {
                                  order.ot
                                }
                              </p>

                              <p
                                className="
                                  mt-0.5

                                  truncate

                                  text-xs
                                  text-[#71807B]

                                  min-[3840px]:text-xl
                                "
                              >
                                {
                                  order.client
                                }
                              </p>

                              <p
                                className="
                                  mt-0.5

                                  truncate

                                  text-xs
                                  text-[#89938F]

                                  min-[3840px]:text-xl
                                "
                              >
                                {order.ov
                                  ? `OV ${order.ov} · ${order.project || "Sin proyecto"}`
                                  : order.project || "Sin proyecto"}
                              </p>

                              {selectedCount >
                                0 && (
                                  <p
                                    className="
                                    mt-1

                                    text-xs
                                    font-semibold
                                    text-[#8E1A32]
                                  "
                                  >
                                    {
                                      selectedCount
                                    }{" "}
                                    ensamble
                                    {selectedCount ===
                                      1
                                      ? ""
                                      : "s"}{" "}
                                    seleccionado
                                    {selectedCount ===
                                      1
                                      ? ""
                                      : "s"}
                                  </p>
                                )}
                            </div>

                            {/* OPERACIÓN ACTUAL */}

                            <div
                              className="
                                hidden

                                min-w-40

                                sm:block
                              "
                            >
                              <p
                                className="
                                  text-sm
                                  font-semibold
                                  text-[#26302D]

                                  min-[3840px]:text-2xl
                                "
                              >
                                {
                                  order.operation
                                }
                              </p>

                              <p
                                className="
                                  mt-0.5

                                  text-xs
                                  text-[#71807B]

                                  min-[3840px]:text-xl
                                "
                              >
                                {formatNumber(
                                  order.quantity
                                )}{" "}
                                pzs
                              </p>
                            </div>

                            {/* PROGRESO */}

                            <div
                              className="
                                order-last

                                flex
                                w-full
                                items-center

                                gap-3

                                sm:order-0
                                sm:w-44

                                lg:w-52

                                min-[3840px]:w-80
                              "
                            >
                              <div
                                className="
                                  h-2

                                  flex-1

                                  overflow-hidden

                                  rounded-full

                                  bg-[#E4E9E7]

                                  min-[3840px]:h-4
                                "
                              >
                                <div
                                  className="
                                    h-full
                                    rounded-full
                                    bg-[#08715B]
                                  "

                                  style={{
                                    width:
                                      `${order.progress}%`,
                                  }}
                                />
                              </div>

                              <span
                                className="
                                  w-12

                                  text-right

                                  text-sm
                                  font-bold
                                  text-[#1B2421]

                                  min-[3840px]:text-2xl
                                "
                              >
                                {Math.round(
                                  order.progress
                                )}
                                %
                              </span>
                            </div>

                            <StatusBadge
                              status={
                                order.status
                              }
                            />
                          </div>

                          {/* ================================= */}
                          {/* ENSAMBLES */}
                          {/* ================================= */}

                          {expanded && (
                            <div
                              className="
                                border-t
                                border-[#DDE1DF]

                                bg-[#FBFAF7]

                                px-4
                                py-4

                                sm:px-6

                                min-[3840px]:px-10
                                min-[3840px]:py-7
                              "
                            >
                              {order.assemblies
                                .length ===
                                0 ? (
                                <div
                                  className="
                                    rounded-xl

                                    border
                                    border-dashed
                                    border-[#D5DBD8]

                                    bg-white

                                    px-5
                                    py-6

                                    text-center
                                    text-sm
                                    text-[#71807B]
                                  "
                                >
                                  Esta OT no tiene ensambles registrados.
                                </div>
                              ) : (
                                <div
                                  className="
                                    space-y-2

                                    min-[3840px]:space-y-4
                                  "
                                >
                                  {order.assemblies.map(
                                    (
                                      assembly
                                    ) => {
                                      const assemblyId =
                                        getAssemblyId(
                                          order.ot,
                                          assembly.assemblySeq
                                        );

                                      const checked =
                                        selectedAssemblies.has(
                                          assemblyId
                                        );

                                      return (
                                        <div
                                          key={assemblyId}
                                          className={`
                                            overflow-hidden
                                            rounded-xl
                                            border
                                            transition-colors

                                            ${checked
                                              ? "border-[#8E1A32] bg-[#F8EFF2] ring-1 ring-[#8E1A32]/10"
                                              : "border-[#DDE1DF] bg-white hover:border-[#B8C2BE]"
                                            }
                                          `}
                                        >
                                          {/* CABECERA DEL ENSAMBLE */}
                                          <label className="flex cursor-pointer items-center gap-4 px-4 py-4 sm:px-5 min-[3840px]:gap-7 min-[3840px]:px-8 min-[3840px]:py-6">
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => {
                                                toggleAssembly(
                                                  order,
                                                  assembly.assemblySeq
                                                );
                                              }}
                                              aria-label={`Seleccionar ensamble ${assembly.assemblySeq} de ${order.ot}`}
                                              className="h-5 w-5 shrink-0 cursor-pointer accent-[#8E1A32] min-[3840px]:h-8 min-[3840px]:w-8"
                                            />

                                            <div className="flex h-10 min-w-12 shrink-0 items-center justify-center rounded-lg bg-[#EEF1EF] px-3 text-sm font-bold text-[#26302D] min-[3840px]:h-14 min-[3840px]:min-w-20 min-[3840px]:text-2xl">
                                              {assembly.assemblySeq}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                              <p className="truncate text-sm font-bold text-[#17201D] min-[3840px]:text-2xl">
                                                {assembly.description ||
                                                  `Ensamble ${assembly.assemblySeq}`}
                                              </p>

                                              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#71807B] min-[3840px]:text-xl">
                                                <span>
                                                  Parte:{" "}
                                                  <strong className="text-[#303A37]">
                                                    {assembly.partNum ?? "Sin parte"}
                                                  </strong>
                                                </span>

                                                <span>
                                                  Plano:{" "}
                                                  <strong className="text-[#303A37]">
                                                    {assembly.plano ?? "Sin plano"}
                                                  </strong>
                                                </span>

                                                <span>
                                                  Procesos:{" "}
                                                  <strong className="text-[#303A37]">
                                                    {assembly.operations.length}
                                                  </strong>
                                                </span>
                                              </div>
                                            </div>

                                            {checked && (
                                              <span className="shrink-0 rounded-full bg-[#E8DCE0] px-3 py-1.5 text-xs font-semibold text-[#8E1A32] min-[3840px]:text-xl">
                                                Seleccionado
                                              </span>
                                            )}
                                          </label>

                                          
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    }
                  )}

                {/* SIN RESULTADOS */}

                {!loadingOrders &&
                  !ordersError &&
                  filteredOrders.length ===
                  0 && (
                    <div
                      className="
                        rounded-xl

                        border
                        border-dashed
                        border-[#C9D0CC]

                        bg-white

                        px-6
                        py-12

                        text-center
                        text-[#71807B]
                      "
                    >
                      No se encontraron órdenes.
                    </div>
                  )}
              </div>
            </section>

            {/* =============================================== */}
            {/* PANEL PROGRAMACIÓN */}
            {/* =============================================== */}

            <aside
              className="
                rounded-2xl
                border
                border-[#D5DBD8]
                bg-white
                p-5

                xl:sticky
                xl:top-28
                xl:flex
                xl:max-h-[calc(100dvh-8rem)]
                xl:flex-col
                xl:overflow-hidden

                min-[3840px]:rounded-3xl
                min-[3840px]:p-9
              "
            >
              <div className="shrink-0 border-b border-[#DDE1DF] pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-[#111816] min-[3840px]:text-4xl">
                      Programar liberación
                    </h2>

                    <p className="mt-2 text-sm text-[#71807B] min-[3840px]:text-2xl">
                      {selectedOrderCount > 0
                        ? `${selectedOrderCount} OT${selectedOrderCount === 1 ? "" : "s"} · ${selectedAssemblyCount} ensamble${selectedAssemblyCount === 1 ? "" : "s"}`
                        : "Selecciona una o varias OTs"}
                    </p>
                  </div>

                  {selectedOrderCount > 0 && (
                    <button
                      type="button"
                      onClick={clearProgrammingSelection}
                      className="shrink-0 text-xs font-semibold text-[#8E1A32] hover:underline min-[3840px]:text-xl"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              {selectedProgrammingOrders.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#71807B]">
                  Marca el checkbox de varias OTs para seleccionar todos sus ensambles,
                  o despliega una OT para escoger ensambles específicos.
                </div>
              ) : (
                <div className="mt-5 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col min-[3840px]:mt-8">
                  <div className="space-y-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:[scrollbar-none] xl:[-ms-overflow-style:none] xl:[&::-webkit-scrollbar]:hidden min-[3840px]:space-y-8">
                    {/* FECHA COMÚN PARA EL LOTE */}
                    <label className="block">
                      <span className="text-sm font-semibold text-[#61706B] min-[3840px]:text-2xl">
                        Fecha de programación
                      </span>

                      <input
                        type="date"
                        value={scheduleDate}
                        min={getTodayLocal()}
                        onChange={(event) =>
                          setScheduleDate(event.target.value)
                        }
                        className="mt-2 min-h-14 w-full rounded-xl border border-[#D5DBD8] bg-[#F9F8F5] px-4 font-semibold text-[#18201E] outline-none focus:border-[#8E1A32] min-[3840px]:min-h-20 min-[3840px]:text-2xl"
                      />
                    </label>

                    {/* PROYECTO DE LA OT EN FOCO */}
                    {focusedOrder && selectedProjectConfig && (
                      <section className="rounded-2xl border border-[#DDE1DF] bg-[#FBFAF7] p-4 min-[3840px]:p-7">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-[#61706B] min-[3840px]:text-2xl">
                              Proyecto · {focusedOrder.ot}
                            </p>
                            <p className="mt-1 text-xs text-[#89938F] min-[3840px]:text-xl">
                              Este ajuste se guarda solo para esta OT. Las demás conservan su proyecto de Epicor salvo que las edites.
                            </p>
                          </div>

                          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-[#26302D] min-[3840px]:text-xl">
                            <input
                              type="checkbox"
                              checked={
                                selectedProjectConfig.keepEpicorProject
                              }
                              onChange={(event) => {
                                updateProjectConfig(
                                  focusedOrder,
                                  {
                                    keepEpicorProject:
                                      event.target.checked,
                                    ...(event.target.checked
                                      ? {
                                          projectName:
                                            focusedOrder.project,
                                        }
                                      : {}),
                                  }
                                );
                              }}
                              className="h-4 w-4 accent-[#8E1A32] min-[3840px]:h-7 min-[3840px]:w-7"
                            />
                            Mantener Epicor
                          </label>
                        </div>

                        <input
                          type="text"
                          value={
                            selectedProjectConfig.keepEpicorProject
                              ? focusedOrder.project
                              : selectedProjectConfig.projectName
                          }
                          onChange={(event) =>
                            updateProjectConfig(
                              focusedOrder,
                              { projectName: event.target.value }
                            )
                          }
                          disabled={
                            selectedProjectConfig.keepEpicorProject
                          }
                          placeholder="Sin proyecto"
                          className="mt-3 min-h-12 w-full rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm font-semibold text-[#18201E] outline-none transition-colors focus:border-[#8E1A32] disabled:cursor-not-allowed disabled:bg-[#EEF1EF] disabled:text-[#71807B] min-[3840px]:min-h-20 min-[3840px]:text-2xl"
                        />

                        {!selectedProjectConfig.keepEpicorProject && (
                          <p className="mt-2 text-xs font-semibold text-[#8E1A32] min-[3840px]:text-xl">
                            Se guardará: {
                              selectedProjectConfig.projectName.trim() ||
                              "Sin proyecto"
                            }
                          </p>
                        )}
                      </section>
                    )}

                    {/* RESUMEN GENERAL */}
                    <section>
                      <h3 className="text-sm font-semibold text-[#61706B] min-[3840px]:text-2xl">
                        Resumen del lote
                      </h3>

                      <div className="mt-2 grid grid-cols-2 gap-3 rounded-2xl bg-[#E2F0ED] p-5 min-[3840px]:p-8">
                        <div>
                          <p className="text-xs text-[#61706B]">OTs</p>
                          <p className="mt-1 text-2xl font-bold text-[#17201D]">
                            {selectedOrderCount}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-[#61706B]">Ensambles</p>
                          <p className="mt-1 text-2xl font-bold text-[#17201D]">
                            {selectedAssemblyCount}
                          </p>
                        </div>
                      </div>
                    </section>

                    {/* OTs SELECCIONADAS */}
                    <section>
                      <p className="mb-2 text-sm font-semibold text-[#61706B] min-[3840px]:text-2xl">
                        OTs a programar
                      </p>

                      <div className="space-y-2">
                        {selectedProgrammingOrders.map(
                          ({ order, assemblies }) => (
                            <button
                              key={order.id}
                              type="button"
                              onClick={() => {
                                setSelectedOrderId(order.id);
                                setExpandedOrderId(order.id);
                              }}
                              className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                                focusedOrder?.id === order.id
                                  ? "border-[#8E1A32] bg-[#F8EFF2]"
                                  : "border-[#DDE1DF] bg-[#FBFAF7] hover:border-[#B8C2BE]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-[#26302D]">
                                    {order.ot} · {order.client}
                                  </p>
                                  <p className="mt-1 text-xs text-[#71807B]">
                                    {assemblies.length} ensamble{
                                      assemblies.length === 1 ? "" : "s"
                                    } · {
                                      getProjectToSave(order) ||
                                      "Sin proyecto"
                                    }
                                  </p>
                                </div>

                                <span className="shrink-0 rounded-full bg-[#E8DCE0] px-2.5 py-1 text-xs font-semibold text-[#8E1A32]">
                                  {assemblies.length}
                                </span>
                              </div>
                            </button>
                          )
                        )}
                      </div>
                    </section>
                  </div>

                  <div className="mt-5 shrink-0 border-t border-[#DDE1DF] bg-white pt-4 min-[3840px]:mt-8 min-[3840px]:pt-6">
                    <button
                      type="button"
                      disabled={
                        savingProgramming ||
                        selectedProgrammingOrders.length === 0 ||
                        !scheduleDate
                      }
                      onClick={handleConfirmProgramming}
                      className="min-h-14 w-full rounded-xl bg-[#8E1A32] px-5 font-semibold text-white transition-colors hover:bg-[#741429] disabled:cursor-not-allowed disabled:bg-[#B9BFBC] min-[3840px]:min-h-20 min-[3840px]:rounded-2xl min-[3840px]:text-2xl"
                    >
                      {savingProgramming
                        ? `Programando ${selectedOrderCount} OT${selectedOrderCount === 1 ? "" : "s"}...`
                        : `Programar ${selectedOrderCount} OT${selectedOrderCount === 1 ? "" : "s"}`}
                    </button>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}