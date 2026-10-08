import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router";

import Sidebar from "../Components/Sidebar";

import { API_BASE } from "../config/api";

// ==========================================================
// CONFIGURACION API
// ==========================================================
//
// En Vite puedes crear un .env con:
// VITE_API_BASE=http://localhost:3000
//
// Si no existe la variable, se conserva localhost:3000.
// ==========================================================

//const API_BASE = (
//  (import.meta.env.VITE_API_BASE as string | undefined) ??
//  "http://localhost:3000"
//).replace(/\/+$/, "");

const AUTO_REFRESH_MS = 15_000;

// ==========================================================
// TIPOS
// ==========================================================

type ProcesoOv = {
  numeroOv: number;
  cliente: string | null;
};

type ProcesoResponsable = {
  id: number;
  nombre: string;
};

type CompletionFilter =
  | "PENDIENTES"
  | "COMPLETADOS"
  | "TODOS";

type Proceso = {
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

  ultimaSincronizacionEpicor: string | null;
  sincronizacionEpicorOk: boolean;
  errorSincronizacionEpicor: string | null;

  ovs: ProcesoOv[];
};

type Area = {
  id: number;
  area: string;
};

type ResponsablePlantaCatalogo = {
  id: number;
  nombre: string;
  procesosAsignados: number;
  fechaCreacion: string;
  fechaActualizacion: string;
};

type EquipoArea = {
  area: Area;
  lideresSugeridos: string[];
  responsablesSugeridos: string[];
};

type Resumen = {
  otsConProcesos: number;
  totalProcesos: number;
  procesosAsignados: number;
  procesosSinAsignar: number;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ProcesosPayload = {
  items: Proceso[];
  pagination: Pagination;
};

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

type Kpi = {
  title: string;
  value: string;
  helper: string;
  accentClass: string;
};

// ==========================================================
// API HELPER
// ==========================================================

const apiRequest = async <T,>(
  path: string,
  init?: RequestInit
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    throw new Error(
      `No se pudo conectar con el backend en ${API_BASE}. ` +
        "Verifica que el servidor de Node/Express este iniciado y escuchando en ese puerto."
    );
  }

  const text = await response.text();
  let result: ApiResponse<T> | null = null;

  if (text) {
    try {
      result = JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new Error(
        `El backend respondio con un contenido no JSON. HTTP ${response.status}.`
      );
    }
  }

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.message ??
        `Error HTTP ${response.status} consultando ${path}.`
    );
  }

  if (result.data === undefined) {
    throw new Error(
      `La respuesta de ${path} no contiene el campo data.`
    );
  }

  return result.data;
};

// ==========================================================
// HELPERS
// ==========================================================

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 2,
  }).format(value);

const getProgress = (proceso: Proceso): number => {
  if (proceso.cantidadProgramada <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (proceso.cantidadProducida /
          proceso.cantidadProgramada) *
          100
      )
    )
  );
};

const getClientes = (proceso: Proceso): string => {
  const clientes = proceso.ovs
    .map((item) => item.cliente?.trim())
    .filter((item): item is string => Boolean(item));

  const unique = Array.from(new Set(clientes));

  return unique.length > 0
    ? unique.join(" · ")
    : "Sin cliente";
};

const getOvs = (proceso: Proceso): string => {
  if (proceso.ovs.length === 0) {
    return "Sin OV";
  }

  return proceso.ovs
    .map((item) => String(item.numeroOv))
    .join(" · ");
};

const getStatusClass = (status: string): string => {
  switch (status.toLowerCase()) {
    case "programada":
      return "bg-[#E8DCE0] text-[#8E1A32]";
    case "en proceso":
      return "bg-[#DDEEEA] text-[#01634F]";
    case "finalizada":
      return "bg-[#E1F0EC] text-[#08715B]";
    case "cancelada":
      return "bg-[#F6DDE2] text-[#A8293F]";
    default:
      return "bg-[#F2ECD4] text-[#82763D]";
  }
};

const normalizeNameKey = (value: string): string =>
  value
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase("es");

const formatSyncDate = (value: string | null): string => {
  if (!value) {
    return "Sin sincronizar";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
};

// ==========================================================
// NOTIFICACIONES VISUALES
// ==========================================================

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
    progress: string;
  }
> = {
  success: {
    wrapper: "border-[#A9D7CA] bg-[#F1F8F6]",
    icon: "bg-[#DDEEEA] text-[#01634F]",
    title: "text-[#01634F]",
    progress: "bg-[#08715B]",
  },
  error: {
    wrapper: "border-[#E4A7B1] bg-[#FFF5F6]",
    icon: "bg-[#F6DDE2] text-[#A8293F]",
    title: "text-[#8E1A32]",
    progress: "bg-[#A8293F]",
  },
  warning: {
    wrapper: "border-[#D8CFA4] bg-[#FCFAF0]",
    icon: "bg-[#F2ECD4] text-[#82763D]",
    title: "text-[#6F642D]",
    progress: "bg-[#9B8D4F]",
  },
  info: {
    wrapper: "border-[#BFD8D2] bg-[#F3F8F7]",
    icon: "bg-[#DDEEEA] text-[#01634F]",
    title: "text-[#014638]",
    progress: "bg-[#014638]",
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
      className={`fixed right-4 top-4 z-100 w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border shadow-[0_18px_50px_rgba(17,24,22,0.18)] sm:right-6 sm:top-6 min-[3840px]:right-12 min-[3840px]:top-12 min-[3840px]:max-w-2xl ${style.wrapper}`}
    >
      <div className="flex items-start gap-3 p-4 sm:p-5 min-[3840px]:gap-5 min-[3840px]:p-8">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full min-[3840px]:h-16 min-[3840px]:w-16 ${style.icon}`}
          aria-hidden="true"
        >
          {toast.variant === "success" ? (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 min-[3840px]:h-9 min-[3840px]:w-9">
              <path
                d="m5 12.5 4.2 4.2L19 7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : toast.variant === "error" ? (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 min-[3840px]:h-9 min-[3840px]:w-9">
              <path
                d="M8 8l8 8M16 8l-8 8"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 min-[3840px]:h-9 min-[3840px]:w-9">
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
          <p className={`text-sm font-bold min-[3840px]:text-2xl ${style.title}`}>
            {toast.title}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-5 text-[#53615C] min-[3840px]:mt-2 min-[3840px]:text-xl min-[3840px]:leading-8">
            {toast.message}
          </p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#89938F] min-[3840px]:mt-3 min-[3840px]:text-lg">
            Se cerrará automáticamente en 5 segundos
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar notificación"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#71807B] transition-colors hover:bg-black/5 hover:text-[#26302D] min-[3840px]:h-12 min-[3840px]:w-12"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 min-[3840px]:h-7 min-[3840px]:w-7">
            <path
              d="M7 7l10 10M17 7 7 17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="h-1 bg-black/5 min-[3840px]:h-2">
        <div className={`h-full w-full ${style.progress}`} />
      </div>
    </div>
  );
}

// ==========================================================
// COMPONENTES
// ==========================================================

function KpiCard({
  title,
  value,
  helper,
  accentClass,
}: Kpi) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-[#D8DEDB] bg-white px-6 py-5 shadow-sm min-[3840px]:rounded-3xl min-[3840px]:px-10 min-[3840px]:py-8">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1.5 ${accentClass}`}
      />

      <p className="text-sm font-semibold text-[#61706B] min-[3840px]:text-2xl">
        {title}
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-3">
        <strong className="text-4xl leading-none text-[#111816] min-[3840px]:text-7xl">
          {value}
        </strong>

        <span className="rounded-full bg-[#E1F0EC] px-3 py-1 text-xs font-semibold text-[#08715B] min-[3840px]:px-5 min-[3840px]:py-2 min-[3840px]:text-xl">
          {helper}
        </span>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold min-[3840px]:px-5 min-[3840px]:py-2.5 min-[3840px]:text-xl ${getStatusClass(
        status
      )}`}
    >
      {status}
    </span>
  );
}

// ==========================================================
// VISTA
// ==========================================================

export default function Coordinator() {
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [processFilter, setProcessFilter] = useState("");
  const [completionFilter, setCompletionFilter] =
    useState<CompletionFilter>("PENDIENTES");

  const [processTypes, setProcessTypes] = useState<string[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [responsablesPlanta, setResponsablesPlanta] = useState<
    ResponsablePlantaCatalogo[]
  >([]);
  const [procesos, setProcesos] = useState<Proceso[]>([]);

  const [resumen, setResumen] = useState<Resumen>({
    otsConProcesos: 0,
    totalProcesos: 0,
    procesosAsignados: 0,
    procesosSinAsignar: 0,
  });

  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProcesses, setSelectedProcesses] = useState<Set<number>>(
    () => new Set()
  );

  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [equipo, setEquipo] = useState<EquipoArea | null>(null);

  // Nuevo modelo: nombres textuales, no IDs de usuario.
  const [selectedLeader, setSelectedLeader] = useState("");
  const [selectedResponsibles, setSelectedResponsibles] = useState<string[]>([]);
  const [responsibleDraft, setResponsibleDraft] = useState("");

  const [loadingTeam, setLoadingTeam] = useState(false);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<ToastMessage | null>(null);

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
  // DEBOUNCE
  // ========================================================

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  // ========================================================
  // CATALOGOS
  // ========================================================

  useEffect(() => {
    const controller = new AbortController();

    const loadCatalogs = async () => {
      try {
        const [tipos, areasData, responsablesData] = await Promise.all([
          apiRequest<string[]>("/procesos/tipos", {
            signal: controller.signal,
          }),
          apiRequest<Area[]>("/procesos/areas", {
            signal: controller.signal,
          }),
          apiRequest<ResponsablePlantaCatalogo[]>("/responsables-planta", {
            signal: controller.signal,
          }),
        ]);

        setProcessTypes(tipos ?? []);
        setAreas(areasData ?? []);
        setResponsablesPlanta(responsablesData ?? []);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        console.error("Error cargando catalogos:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No fue posible cargar los catalogos."
        );
      }
    };

    void loadCatalogs();

    return () => controller.abort();
  }, []);

  // ========================================================
  // RESUMEN
  // ========================================================

  const loadResumen = useCallback(async () => {
    try {
      const data = await apiRequest<Resumen>(
        "/procesos/resumen"
      );

      setResumen(data);
    } catch (loadError) {
      console.error("Error cargando resumen:", loadError);
    }
  }, []);

  useEffect(() => {
    void loadResumen();
  }, [loadResumen]);

  // ========================================================
  // PROCESOS
  // ========================================================

  const loadProcesses = useCallback(
    async (
      page = 1,
      signal?: AbortSignal,
      silent = false
    ) => {
      if (!silent) {
        setLoading(true);
      }

      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "50",
        });

        if (debouncedSearch) {
          params.set("search", debouncedSearch);
        }

        if (processFilter) {
          params.set("opDesc", processFilter);
        }

        params.set("estadoCantidad", completionFilter);

        const data = await apiRequest<ProcesosPayload>(
          `/procesos?${params.toString()}`,
          { signal }
        );

        setProcesos(data.items ?? []);
        setPagination(data.pagination);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        console.error("Error cargando procesos:", loadError);

        setError(
          loadError instanceof Error
            ? loadError.message
            : "No fue posible cargar los procesos."
        );
      } finally {
        if (!silent && !signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [debouncedSearch, processFilter, completionFilter]
  );

  useEffect(() => {
    const controller = new AbortController();

    setSelectedProcesses(new Set());
    void loadProcesses(1, controller.signal);

    return () => controller.abort();
  }, [loadProcesses]);

  // ========================================================
  // AUTO REFRESH SIN RECARGAR LA PAGINA
  // ========================================================

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadProcesses(pagination.page, undefined, true);
      void loadResumen();
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [loadProcesses, loadResumen, pagination.page]);

  // ========================================================
  // SUGERENCIAS DEL AREA
  // ========================================================

  useEffect(() => {
    // Solo actualizamos las sugerencias del area.
    // No limpiamos lider/responsables aqui porque, al seleccionar
    // un proceso ya asignado, necesitamos conservar y mostrar
    // su asignacion actual para poder editarla.
    setEquipo(null);

    if (!selectedAreaId) {
      setLoadingTeam(false);
      return;
    }

    const controller = new AbortController();

    const loadTeam = async () => {
      setLoadingTeam(true);

      try {
        const data = await apiRequest<EquipoArea>(
          `/procesos/areas/${selectedAreaId}/equipo`,
          { signal: controller.signal }
        );

        setEquipo(data);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        console.error("Error cargando sugerencias:", loadError);

        // El usuario puede escribir nombres aunque no existan sugerencias.
        setEquipo(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingTeam(false);
        }
      }
    };

    void loadTeam();

    return () => controller.abort();
  }, [selectedAreaId]);

  const isProcesoCompleted = (proceso: Proceso): boolean => {
    return (
      proceso.jobClosed ||
      (proceso.cantidadProgramada > 0 &&
        proceso.cantidadFaltante <= 0)
    );
  };

  // ========================================================
  // FORMULARIO DE ASIGNACION / EDICION
  // ========================================================

  const getNonLeaderResponsibles = (proceso: Proceso): string[] => {
    const leaderKey = normalizeNameKey(proceso.lider ?? "");
    const unique = new Map<string, string>();

    proceso.responsables.forEach((responsable) => {
      const name = responsable.nombre?.trim();

      if (!name) {
        return;
      }

      const key = normalizeNameKey(name);

      // La persona que figura como lider nunca se carga tambien
      // como responsable operativo.
      if (leaderKey && key === leaderKey) {
        return;
      }

      if (!unique.has(key)) {
        unique.set(key, name);
      }
    });

    return Array.from(unique.values());
  };

  const resetAssignmentForm = () => {
    setSelectedAreaId("");
    setEquipo(null);
    setSelectedLeader("");
    setSelectedResponsibles([]);
    setResponsibleDraft("");
  };

  const loadAssignmentFromProcess = (proceso: Proceso) => {
    setSelectedAreaId(
      proceso.idArea !== null && proceso.idArea !== undefined
        ? String(proceso.idArea)
        : ""
    );
    setSelectedLeader(proceso.lider?.trim() ?? "");
    setSelectedResponsibles(getNonLeaderResponsibles(proceso));
    setResponsibleDraft("");
  };

  const getAssignmentSignature = (proceso: Proceso): string => {
    const responsables = getNonLeaderResponsibles(proceso)
      .map(normalizeNameKey)
      .sort();

    return JSON.stringify({
      idArea: proceso.idArea ?? null,
      lider: normalizeNameKey(proceso.lider ?? ""),
      responsables,
    });
  };

  const syncAssignmentFormWithSelection = (ids: Set<number>) => {
    if (ids.size === 0) {
      resetAssignmentForm();
      return;
    }

    const selected = procesos.filter((proceso) => ids.has(proceso.id));

    // Para una sola seleccion siempre traemos la asignacion actual,
    // incluso si esta vacia. Eso permite editar directamente.
    if (ids.size === 1 && selected.length === 1) {
      loadAssignmentFromProcess(selected[0]);
      return;
    }

    // En seleccion multiple solo precargamos cuando TODOS los procesos
    // visibles seleccionados comparten exactamente la misma asignacion.
    // Si son diferentes, dejamos el formulario vacio para evitar copiar
    // accidentalmente la asignacion de un proceso sobre los demas.
    if (selected.length === ids.size && selected.length > 1) {
      const firstSignature = getAssignmentSignature(selected[0]);
      const allSame = selected.every(
        (proceso) => getAssignmentSignature(proceso) === firstSignature
      );

      if (allSame) {
        loadAssignmentFromProcess(selected[0]);
        return;
      }
    }

    resetAssignmentForm();
  };

  const handleAreaChange = (value: string) => {
    // Si el coordinador cambia manualmente el area, la asignacion
    // anterior deja de ser valida para el nuevo contexto.
    setSelectedAreaId(value);
    setSelectedLeader("");
    setSelectedResponsibles([]);
    setResponsibleDraft("");
  };

  // ========================================================
  // SELECCION DE PROCESOS
  // ========================================================

  const toggleProcess = (id: number) => {
    const proceso = procesos.find((item) => item.id === id);

    if (!proceso || isProcesoCompleted(proceso)) {
      return;
    }

    const next = new Set(selectedProcesses);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    setSelectedProcesses(next);
    syncAssignmentFormWithSelection(next);
  };

  const toggleVisibleProcesses = () => {
    const visibleIds = procesos
      .filter((proceso) => !isProcesoCompleted(proceso))
      .map((proceso) => proceso.id);

    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedProcesses.has(id));

    const next = new Set(selectedProcesses);

    visibleIds.forEach((id) => {
      if (allSelected) {
        next.delete(id);
      } else {
        next.add(id);
      }
    });

    setSelectedProcesses(next);
    syncAssignmentFormWithSelection(next);
  };

  // ========================================================
  // RESPONSABLES TEXTUALES
  // ========================================================

  const addResponsible = (rawValue = responsibleDraft) => {
    const requestedName = rawValue.trim();

    if (!requestedName) {
      return;
    }

    const catalogItem = responsablesPlanta.find(
      (item) =>
        normalizeNameKey(item.nombre) ===
        normalizeNameKey(requestedName)
    );

    if (!catalogItem) {
      showToast(
        "warning",
        "Responsable no registrado",
        "Selecciona un nombre existente en Miembros de planta. Puedes crear nuevos miembros desde el boton del encabezado."
      );
      return;
    }

    const name = catalogItem.nombre;

    if (normalizeNameKey(name) === normalizeNameKey(selectedLeader)) {
      showToast(
        "warning",
        "Nombre repetido",
        "El líder no puede repetirse dentro de los responsables."
      );
      return;
    }

    const exists = selectedResponsibles.some(
      (item) => normalizeNameKey(item) === normalizeNameKey(name)
    );

    if (!exists) {
      setSelectedResponsibles((current) => [...current, name]);
    }

    setResponsibleDraft("");
  };

  const isResponsibleInCatalog = (name: string): boolean =>
    responsablesPlanta.some(
      (item) =>
        normalizeNameKey(item.nombre) === normalizeNameKey(name)
    );

  const removeResponsible = (name: string) => {
    const key = normalizeNameKey(name);

    setSelectedResponsibles((current) =>
      current.filter((item) => normalizeNameKey(item) !== key)
    );
  };

  // ========================================================
  // GUARDAR ASIGNACION
  // ========================================================

  const handleAssign = async () => {
    const procesosIds = Array.from(selectedProcesses);
    const lider = selectedLeader.trim();

    if (procesosIds.length === 0) {
      showToast(
        "warning",
        "Falta seleccionar procesos",
        "Selecciona al menos un proceso para continuar con la asignación."
      );
      return;
    }

    if (!selectedAreaId) {
      showToast(
        "warning",
        "Área requerida",
        "Selecciona el área a la que deseas asignar los procesos."
      );
      return;
    }

    if (!lider) {
      showToast(
        "warning",
        "Líder requerido",
        "Ingresa el nombre del líder responsable de los procesos seleccionados."
      );
      return;
    }

    if (selectedResponsibles.length === 0) {
      showToast(
        "warning",
        "Responsable requerido",
        "Debes asignar al menos un responsable operativo distinto del líder."
      );
      return;
    }

    if (
      selectedResponsibles.some(
        (item) =>
          normalizeNameKey(item) === normalizeNameKey(lider)
      )
    ) {
      showToast(
        "warning",
        "Nombre repetido",
        "El líder no puede repetirse dentro de los responsables."
      );
      return;
    }

    setSaving(true);

    try {
      const data = await apiRequest<{
        procesosActualizados: number;
      }>("/procesos/asignacion", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          procesosIds,
          idArea: Number(selectedAreaId),
          lider,
          responsables: selectedResponsibles,
        }),
      });

      showToast(
        "success",
        "Asignación guardada",
        `${data.procesosActualizados} proceso(s) asignado(s) correctamente.`
      );

      setSelectedProcesses(new Set());
      resetAssignmentForm();

      await Promise.all([
        loadProcesses(pagination.page),
        loadResumen(),
      ]);
    } catch (saveError) {
      console.error("Error guardando asignacion:", saveError);

      showToast(
        "error",
        "No fue posible guardar la asignación",
        saveError instanceof Error
          ? saveError.message
          : "No fue posible guardar la asignación."
      );
    } finally {
      setSaving(false);
    }
  };

  // ========================================================
  // KPIs
  // ========================================================

  const kpis = useMemo<Kpi[]>(
    () => [
      {
        title: "OTs con procesos",
        value: String(resumen.otsConProcesos),
        helper: "Programacion interna",
        accentClass: "bg-[#8E1A32]",
      },
      {
        title: "Procesos",
        value: String(resumen.totalProcesos),
        helper: "Total guardados",
        accentClass: "bg-[#014638]",
      },
      {
        title: "Asignados",
        value: String(resumen.procesosAsignados),
        helper: "Con area y lider",
        accentClass: "bg-[#9B8D4F]",
      },
      {
        title: "Sin asignar",
        value: String(resumen.procesosSinAsignar),
        helper: "Requieren atencion",
        accentClass: "bg-[#C63A50]",
      },
    ],
    [resumen]
  );

  const selectableProcesses = procesos.filter(
    (proceso) => !isProcesoCompleted(proceso)
  );

  const selectedProcessItems = procesos.filter((proceso) =>
    selectedProcesses.has(proceso.id)
  );

  const selectedSingleProcess =
    selectedProcesses.size === 1 && selectedProcessItems.length === 1
      ? selectedProcessItems[0]
      : null;

  const editingExistingAssignment = Boolean(
    selectedSingleProcess &&
      (selectedSingleProcess.idArea !== null ||
        selectedSingleProcess.lider?.trim() ||
        selectedSingleProcess.responsables.length > 0)
  );

  const leaderRepeatedAsResponsible = selectedResponsibles.some(
    (item) =>
      normalizeNameKey(item) === normalizeNameKey(selectedLeader)
  );

  const hasNonLeaderResponsible =
    selectedResponsibles.length > 0 && !leaderRepeatedAsResponsible;

  const canSaveAssignment =
    !saving &&
    selectedProcesses.size > 0 &&
    Boolean(selectedAreaId) &&
    Boolean(selectedLeader.trim()) &&
    hasNonLeaderResponsible;

  const visibleAllSelected =
    selectableProcesses.length > 0 &&
    selectableProcesses.every((proceso) =>
      selectedProcesses.has(proceso.id)
    );

  // ========================================================
  // RENDER
  // ========================================================

  return (
    <div className="min-h-screen bg-[#F6F5F1] md:flex">
      {toast && (
        <ToastNotification
          key={toast.id}
          toast={toast}
          onClose={() => setToast(null)}
        />
      )}

      <Sidebar activePage="programacion" />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-[#E8E9E6] bg-white/95 backdrop-blur">
          <div className="flex min-h-20 items-center justify-between gap-4 px-4 pl-20 sm:px-6 sm:pl-20 md:px-8 md:pl-8 min-[3840px]:min-h-32 min-[3840px]:px-16">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-[#111816] sm:text-2xl lg:text-3xl min-[3840px]:text-5xl">
                Coordinador de Produccion
              </h1>

              <p className="mt-1 hidden text-sm text-[#71807B] sm:block min-[3840px]:text-2xl">
                PostgreSQL · Pendientes / completados / todos · Actualizacion cada 15 s
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate("/responsables-planta")}
              className="min-h-11 shrink-0 rounded-xl border border-[#BDD0CA] bg-[#F1F8F6] px-4 text-sm font-bold text-[#01634F] transition-colors hover:border-[#014638] hover:bg-[#E2F0ED] min-[3840px]:min-h-16 min-[3840px]:px-7 min-[3840px]:text-2xl"
            >
              Miembros de planta
            </button>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 min-[3840px]:px-16 min-[3840px]:py-12">
          <section
            aria-label="Indicadores de coordinacion"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 min-[3840px]:gap-8"
          >
            {kpis.map((kpi) => (
              <KpiCard key={kpi.title} {...kpi} />
            ))}
          </section>

          <section className="mt-7 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px_260px] min-[3840px]:mt-12 min-[3840px]:gap-6">
            <label className="flex min-h-14 items-center gap-3 rounded-xl border border-[#D5DBD8] bg-white px-4 focus-within:border-[#8E1A32] min-[3840px]:min-h-20 min-[3840px]:rounded-2xl min-[3840px]:px-7">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="h-6 w-6 shrink-0 text-[#6A7974] min-[3840px]:h-9 min-[3840px]:w-9"
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
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(event.target.value)
                }
                placeholder="Buscar OT, OV, cliente, proyecto, proceso, lider o responsable"
                className="min-w-0 flex-1 bg-transparent text-sm text-[#18201E] outline-none placeholder:text-[#89938F] min-[3840px]:text-2xl"
              />
            </label>

            <select
              value={processFilter}
              onChange={(event) =>
                setProcessFilter(event.target.value)
              }
              className="min-h-14 rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm font-semibold text-[#26302D] outline-none focus:border-[#8E1A32] min-[3840px]:min-h-20 min-[3840px]:rounded-2xl min-[3840px]:px-7 min-[3840px]:text-2xl"
            >
              <option value="">Todos los procesos</option>
              {processTypes.map((processType) => (
                <option key={processType} value={processType}>
                  {processType}
                </option>
              ))}
            </select>

            <select
              value={completionFilter}
              onChange={(event) =>
                setCompletionFilter(
                  event.target.value as CompletionFilter
                )
              }
              aria-label="Filtrar por estado de finalizacion"
              className="min-h-14 rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm font-semibold text-[#26302D] outline-none focus:border-[#8E1A32] min-[3840px]:min-h-20 min-[3840px]:rounded-2xl min-[3840px]:px-7 min-[3840px]:text-2xl"
            >
              <option value="PENDIENTES">Solo pendientes</option>
              <option value="COMPLETADOS">Solo completados</option>
              <option value="TODOS">Todos</option>
            </select>
          </section>

          <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_430px] min-[3840px]:mt-12 min-[3840px]:grid-cols-[minmax(0,1fr)_650px] min-[3840px]:gap-10">
            <section className="min-w-0">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[#111816] min-[3840px]:text-4xl">
                    Procesos programados
                  </h2>
                  <p className="mt-1 text-sm text-[#71807B] min-[3840px]:text-2xl">
                    {completionFilter === "PENDIENTES"
                      ? "Procesos que aun tienen trabajo pendiente."
                      : completionFilter === "COMPLETADOS"
                        ? "Procesos completados; disponibles solo para consulta."
                        : "Todos los procesos, pendientes y completados."}
                  </p>
                </div>

                {selectableProcesses.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleVisibleProcesses}
                    className="min-h-11 rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm font-semibold text-[#26302D] hover:border-[#8E1A32]"
                  >
                    {visibleAllSelected
                      ? "Quitar seleccion"
                      : "Seleccionar pagina"}
                  </button>
                )}
              </div>

              {loading && (
                <div className="rounded-xl border border-[#D5DBD8] bg-white px-6 py-12 text-center text-[#71807B]">
                  Cargando procesos...
                </div>
              )}

              {!loading && error && (
                <div className="rounded-xl border border-[#E5B6BF] bg-[#FFF6F7] px-6 py-10 text-center font-semibold text-[#8E1A32]">
                  {error}
                </div>
              )}

              {!loading && !error && (
                <div className="space-y-3 min-[3840px]:space-y-6">
                  {procesos.map((proceso) => {
                    const checked = selectedProcesses.has(
                      proceso.id
                    );
                    const progress = getProgress(proceso);

                    return (
                      <article
                        key={proceso.id}
                        className={`overflow-hidden rounded-xl border bg-white transition-colors min-[3840px]:rounded-2xl ${
                          checked
                            ? "border-[#8E1A32] ring-1 ring-[#8E1A32]/20"
                            : "border-[#D5DBD8]"
                        }`}
                      >
                        <div className="flex items-start gap-4 px-4 py-4 min-[3840px]:gap-7 min-[3840px]:px-8 min-[3840px]:py-7">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isProcesoCompleted(proceso)}
                            onChange={() =>
                              toggleProcess(proceso.id)
                            }
                            aria-label={`Seleccionar proceso ${proceso.id}`}
                            className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[#8E1A32] disabled:cursor-not-allowed disabled:opacity-40 min-[3840px]:h-8 min-[3840px]:w-8"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-bold text-[#17201D] min-[3840px]:text-2xl">
                                  {proceso.opDesc ??
                                    proceso.opCode ??
                                    "Proceso sin descripcion"}
                                </p>
                                <p className="mt-1 text-xs text-[#71807B] min-[3840px]:text-xl">
                                  OprSeq {proceso.oprSeq} · Ensamble {proceso.assemblySeq} · {proceso.ensamble}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-[#E8DCE0] px-3 py-1.5 text-xs font-bold text-[#8E1A32] min-[3840px]:px-5 min-[3840px]:py-2.5 min-[3840px]:text-xl">
                                  OT {proceso.ot}
                                </span>
                                <StatusBadge
                                  status={
                                    isProcesoCompleted(proceso)
                                      ? "Finalizada"
                                      : proceso.estado
                                  }
                                />
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 min-[3840px]:mt-7 min-[3840px]:gap-6">
                              <div>
                                <p className="text-xs text-[#71807B] min-[3840px]:text-xl">Cliente</p>
                                <p className="mt-0.5 truncate text-sm font-semibold text-[#26302D] min-[3840px]:text-2xl">
                                  {getClientes(proceso)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-[#71807B] min-[3840px]:text-xl">OV</p>
                                <p className="mt-0.5 truncate text-sm font-semibold text-[#26302D] min-[3840px]:text-2xl">
                                  {getOvs(proceso)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-[#71807B] min-[3840px]:text-xl">Proyecto</p>
                                <p className="mt-0.5 truncate text-sm font-semibold text-[#26302D] min-[3840px]:text-2xl">
                                  {proceso.proyecto ?? "Sin proyecto"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-[#71807B] min-[3840px]:text-xl">Maquina</p>
                                <p className="mt-0.5 truncate text-sm font-semibold text-[#26302D] min-[3840px]:text-2xl">
                                  {proceso.maquina ?? "Sin maquina"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-[#E3E7E5] bg-white p-3">
                              <div className="grid gap-3 sm:grid-cols-3">
                                <div>
                                  <p className="text-xs text-[#71807B]">Programada</p>
                                  <p className="font-bold text-[#26302D]">
                                    {formatNumber(proceso.cantidadProgramada)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-[#71807B]">Producida</p>
                                  <p className="font-bold text-[#08715B]">
                                    {formatNumber(proceso.cantidadProducida)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-[#71807B]">Faltante</p>
                                  <p className="font-bold text-[#8E1A32]">
                                    {formatNumber(proceso.cantidadFaltante)}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ECEFED]">
                                <div
                                  className="h-full bg-[#08715B] transition-[width] duration-300"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>

                              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[#71807B]">
                                <span>{progress}% producido</span>
                                <span>
                                  Epicor: {formatSyncDate(proceso.ultimaSincronizacionEpicor)}
                                </span>
                              </div>

                              {proceso.errorSincronizacionEpicor && (
                                <p className="mt-2 text-xs font-semibold text-[#A8293F]">
                                  {proceso.errorSincronizacionEpicor}
                                </p>
                              )}
                            </div>

                            <div className="mt-4 rounded-xl bg-[#F8F8F5] p-3 text-xs text-[#61706B] min-[3840px]:mt-7 min-[3840px]:p-5 min-[3840px]:text-xl">
                              <div className="grid gap-2 md:grid-cols-3">
                                <p>
                                  <strong className="text-[#26302D]">Area:</strong>{" "}
                                  {proceso.area ?? "Sin asignar"}
                                </p>
                                <p>
                                  <strong className="text-[#26302D]">Lider:</strong>{" "}
                                  {proceso.lider ?? "Sin asignar"}
                                </p>
                                <p>
                                  <strong className="text-[#26302D]">Responsables:</strong>{" "}
                                  {proceso.responsables.length > 0
                                    ? proceso.responsables
                                        .map((item) => item.nombre)
                                        .join(", ")
                                    : "Sin asignar"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}

                  {procesos.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[#C9D0CC] bg-white px-6 py-12 text-center text-[#71807B]">
                      {completionFilter === "PENDIENTES"
                        ? "No se encontraron procesos pendientes con los filtros seleccionados."
                        : completionFilter === "COMPLETADOS"
                          ? "No se encontraron procesos completados con los filtros seleccionados."
                          : "No se encontraron procesos con los filtros seleccionados."}
                    </div>
                  )}
                </div>
              )}

              {!loading &&
                !error &&
                pagination.totalPages > 1 && (
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={pagination.page <= 1}
                      onClick={() =>
                        void loadProcesses(
                          pagination.page - 1
                        )
                      }
                      className="min-h-11 rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm font-semibold text-[#26302D] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Anterior
                    </button>

                    <span className="text-sm text-[#71807B]">
                      Pagina {pagination.page} de {pagination.totalPages} · {pagination.total} procesos
                    </span>

                    <button
                      type="button"
                      disabled={
                        pagination.page >= pagination.totalPages
                      }
                      onClick={() =>
                        void loadProcesses(
                          pagination.page + 1
                        )
                      }
                      className="min-h-11 rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm font-semibold text-[#26302D] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
            </section>

            <aside className="rounded-2xl border border-[#D5DBD8] bg-white p-5 xl:sticky xl:top-28 xl:flex xl:max-h-[calc(100dvh-8rem)] xl:flex-col xl:overflow-hidden min-[3840px]:top-40 min-[3840px]:rounded-3xl min-[3840px]:p-9">
              <div className="shrink-0 border-b border-[#DDE1DF] pb-4">
                <h2 className="text-xl font-bold text-[#111816] min-[3840px]:text-4xl">
                  Asignacion de responsables
                </h2>
                <p className="mt-2 text-sm text-[#71807B] min-[3840px]:text-2xl">
                  {selectedProcesses.size} proceso(s) seleccionado(s)
                </p>

                {editingExistingAssignment && (
                  <p className="mt-2 rounded-lg bg-[#E2F0ED] px-3 py-2 text-xs font-semibold text-[#01634F] min-[3840px]:text-xl">
                    Asignacion actual cargada. Puedes editar el area, lider o responsables y guardar los cambios.
                  </p>
                )}
              </div>

              <div className="mt-5 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col min-[3840px]:mt-8">
                <div className="space-y-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:[scrollbar-none] xl:[-ms-overflow-style:none] xl:[&::-webkit-scrollbar]:hidden min-[3840px]:space-y-8">
                  <label className="block">
                    <span className="text-sm font-semibold text-[#61706B] min-[3840px]:text-2xl">
                      Area
                    </span>
                    <select
                      value={selectedAreaId}
                      onChange={(event) =>
                        handleAreaChange(event.target.value)
                      }
                      className="mt-2 min-h-14 w-full rounded-xl border border-[#D5DBD8] bg-[#F9F8F5] px-4 font-semibold text-[#18201E] outline-none focus:border-[#8E1A32] min-[3840px]:min-h-20 min-[3840px]:rounded-2xl min-[3840px]:px-6 min-[3840px]:text-2xl"
                    >
                      <option value="">Selecciona un area</option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.area}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-[#61706B] min-[3840px]:text-2xl">
                      Lider
                    </span>

                    <input
                      type="text"
                      list="lider-sugerencias"
                      value={selectedLeader}
                      onChange={(event) =>
                        setSelectedLeader(event.target.value)
                      }
                      disabled={!selectedAreaId}
                      maxLength={150}
                      placeholder="Escribe el nombre del lider"
                      className="mt-2 min-h-14 w-full rounded-xl border border-[#D5DBD8] bg-[#F9F8F5] px-4 font-semibold text-[#18201E] outline-none focus:border-[#8E1A32] disabled:cursor-not-allowed disabled:opacity-50 min-[3840px]:min-h-20 min-[3840px]:rounded-2xl min-[3840px]:px-6 min-[3840px]:text-2xl"
                    />

                    <datalist id="lider-sugerencias">
                      {(equipo?.lideresSugeridos ?? []).map(
                        (name) => (
                          <option key={name} value={name} />
                        )
                      )}
                    </datalist>

                    {selectedAreaId && (
                      <p className="mt-2 text-xs text-[#89938F]">
                        {loadingTeam
                          ? "Cargando sugerencias..."
                          : "Puedes escribir cualquier nombre; las sugerencias son solo historicas."}
                      </p>
                    )}
                  </label>

                  <section>
                    <h3 className="text-sm font-semibold text-[#61706B] min-[3840px]:text-2xl">
                      Responsables
                    </h3>
                    <p className="mt-1 text-xs text-[#89938F]">
                      Debes agregar al menos un responsable operativo distinto del lider.
                    </p>

                    <div className="mt-2 rounded-xl border border-[#D5DBD8] bg-[#F9F8F5] p-3">
                      <div className="flex gap-2">
                        <select
                          value={responsibleDraft}
                          onChange={(event) =>
                            setResponsibleDraft(event.target.value)
                          }
                          disabled={!selectedAreaId}
                          className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#D5DBD8] bg-white px-3 text-sm font-semibold text-[#26302D] outline-none focus:border-[#8E1A32] disabled:opacity-50"
                        >
                          <option value="">
                            Selecciona un miembro de planta
                          </option>

                          {responsablesPlanta
                            .filter(
                              (item) =>
                                normalizeNameKey(item.nombre) !==
                                  normalizeNameKey(selectedLeader) &&
                                !selectedResponsibles.some(
                                  (selected) =>
                                    normalizeNameKey(selected) ===
                                    normalizeNameKey(item.nombre)
                                )
                            )
                            .map((item) => (
                              <option key={item.id} value={item.nombre}>
                                {item.nombre}
                              </option>
                            ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => addResponsible()}
                          disabled={
                            !selectedAreaId ||
                            !responsibleDraft.trim()
                          }
                          className="rounded-lg bg-[#014638] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Agregar
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#89938F]">
                        <span>
                          Los nuevos responsables se seleccionan del catalogo de miembros de planta.
                        </span>
                        <button
                          type="button"
                          onClick={() => navigate("/responsables-planta")}
                          className="shrink-0 font-bold text-[#01634F] hover:underline"
                        >
                          Administrar
                        </button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {selectedResponsibles.map((name) => (
                          <div
                            key={normalizeNameKey(name)}
                            className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="min-w-0 truncate text-sm font-semibold text-[#26302D]">
                                {name}
                              </span>

                              {!isResponsibleInCatalog(name) && (
                                <span className="shrink-0 rounded-full bg-[#F2ECD4] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#82763D]">
                                  Historico
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                removeResponsible(name)
                              }
                              className="shrink-0 text-xs font-bold text-[#8E1A32]"
                            >
                              Quitar
                            </button>
                          </div>
                        ))}

                        {selectedAreaId &&
                          selectedResponsibles.length === 0 && (
                            <p className="py-4 text-center text-sm font-semibold text-[#8E1A32]">
                              Agrega al menos un responsable no lider para habilitar el guardado.
                            </p>
                          )}

                        {!selectedAreaId && (
                          <p className="py-4 text-center text-sm text-[#71807B]">
                            Selecciona primero un area.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold text-[#61706B] min-[3840px]:text-2xl">
                      Resumen
                    </h3>

                    <div className="mt-2 rounded-2xl bg-[#E2F0ED] p-5 min-[3840px]:rounded-3xl min-[3840px]:p-8">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-[#61706B]">
                            Procesos
                          </p>
                          <p className="mt-1 text-2xl font-bold text-[#17201D] min-[3840px]:text-4xl">
                            {selectedProcesses.size}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-[#61706B]">
                            Responsables
                          </p>
                          <p className="mt-1 text-2xl font-bold text-[#17201D] min-[3840px]:text-4xl">
                            {selectedResponsibles.length}
                          </p>
                        </div>
                      </div>

                      <p className="mt-4 text-xs text-[#61706B]">
                        La asignacion reemplazara el area, lider y responsables actuales de los procesos seleccionados.
                      </p>
                    </div>
                  </section>
                </div>

                <div className="mt-5 shrink-0 border-t border-[#DDE1DF] bg-white pt-4 min-[3840px]:mt-8 min-[3840px]:pt-6">
                  <button
                    type="button"
                    onClick={() => void handleAssign()}
                    disabled={!canSaveAssignment}
                    className="min-h-14 w-full rounded-xl bg-[#8E1A32] px-5 font-semibold text-white transition-colors hover:bg-[#741429] disabled:cursor-not-allowed disabled:bg-[#B9BFBC] min-[3840px]:min-h-20 min-[3840px]:rounded-2xl min-[3840px]:text-2xl"
                  >
                    {saving
                      ? "Guardando..."
                      : editingExistingAssignment
                        ? "Actualizar asignacion"
                        : `Asignar ${selectedProcesses.size} proceso(s)`}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
