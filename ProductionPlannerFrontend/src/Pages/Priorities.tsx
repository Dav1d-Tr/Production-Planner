import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Sidebar from "../Components/Sidebar";
import { API_BASE } from "../config/api";

const AUTO_REFRESH_MS = 15_000;
const PAGE_SIZE = 50;
const APPEND_PRIORITY = 2_147_483_647;

type OvPrioridad = {
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

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type OvsPrioridadPayload = {
  items: OvPrioridad[];
  pagination: Pagination;
};

type AsignarPrioridadResult = {
  numeroOv: number;
  prioridad: number;
};

type QuitarPrioridadResult = {
  numeroOv: number;
  prioridad: null;
};

type SyncExcelResult = {
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

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

type Toast = {
  variant: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
};

const apiRequest = async <T,>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    throw new Error(
      `No se pudo conectar con el backend en ${API_BASE}.`,
    );
  }

  const text = await response.text();
  let result: ApiResponse<T> | null = null;

  if (text) {
    try {
      result = JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new Error(
        `El backend respondio con contenido no JSON. HTTP ${response.status}.`,
      );
    }
  }

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.message ??
        `Error HTTP ${response.status} consultando ${path}.`,
    );
  }

  if (result.data === undefined) {
    throw new Error(
      `La respuesta de ${path} no contiene data.`,
    );
  }

  return result.data;
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return "Sin fecha";
  }

  const [year, month, day] = value
    .slice(0, 10)
    .split("-")
    .map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
};

const formatList = (
  values: string[],
  emptyLabel: string,
): string =>
  values.length > 0
    ? values.join(" · ")
    : emptyLabel;

const normalizeProgress = (value: number): number =>
  Math.min(100, Math.max(0, Number(value) || 0));

function ToastNotification({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: () => void;
}) {
  const styles = {
    success:
      "border-[#A9D7CA] bg-[#F1F8F6] text-[#01634F]",
    error:
      "border-[#E4A7B1] bg-[#FFF5F6] text-[#8E1A32]",
    warning:
      "border-[#D8CFA4] bg-[#FCFAF0] text-[#6F642D]",
    info:
      "border-[#BFD8D2] bg-[#F3F8F7] text-[#014638]",
  }[toast.variant];

  return (
    <div
      className={`fixed right-4 top-4 z-100 w-[calc(100%-2rem)] max-w-md rounded-2xl border p-4 shadow-xl ${styles}`}
      role={toast.variant === "error" ? "alert" : "status"}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-bold">{toast.title}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-5 text-[#53615C]">
            {toast.message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 font-bold text-[#71807B] hover:bg-black/5"
        >
          x
        </button>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  helper,
  accentClass,
}: {
  title: string;
  value: string;
  helper: string;
  accentClass: string;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-[#D8DEDB] bg-white px-6 py-5 shadow-sm">
      <span
        className={`absolute inset-y-0 left-0 w-1.5 ${accentClass}`}
      />
      <p className="text-sm font-semibold text-[#61706B]">
        {title}
      </p>
      <div className="mt-2 flex items-end gap-3">
        <strong className="text-4xl leading-none text-[#111816]">
          {value}
        </strong>
        <span className="rounded-full bg-[#EEF2F0] px-3 py-1 text-xs font-semibold text-[#61706B]">
          {helper}
        </span>
      </div>
    </article>
  );
}

function OvCard({
  item,
  priorityDraft,
  saving,
  onPriorityDraftChange,
  onAssign,
  onMove,
  onAppend,
  onRemove,
}: {
  item: OvPrioridad;
  priorityDraft: string;
  saving: boolean;
  onPriorityDraftChange: (value: string) => void;
  onAssign: () => void;
  onMove: (delta: -1 | 1) => void;
  onAppend: () => void;
  onRemove: () => void;
}) {
  const progress = normalizeProgress(item.progresoPorcentaje);
  const isPrioritized = item.prioridad !== null;

  const clientText =
    item.clienteExcel?.trim() ||
    formatList(item.clientesDb, "Sin cliente");

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
        isPrioritized
          ? "border-[#C9D7D2]"
          : "border-[#E0E3E1]"
      }`}
    >
      <div className="grid gap-5 p-5 lg:grid-cols-[110px_minmax(0,1fr)_330px] lg:items-center">
        <div className="flex items-center gap-3 lg:flex-col lg:items-start">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#7A8782]">
            Prioridad
          </span>

          {isPrioritized ? (
            <div className="flex h-14 min-w-14 items-center justify-center rounded-2xl bg-[#014638] px-4 text-2xl font-black text-white">
              {item.prioridad}
            </div>
          ) : (
            <span className="rounded-full bg-[#F2ECD4] px-3 py-1.5 text-xs font-bold text-[#82763D]">
              Sin prioridad
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black text-[#111816]">
                  OV {item.numeroOv}
                </h2>

                {item.linea && (
                  <span className="rounded-full bg-[#EEF2F0] px-3 py-1 text-xs font-bold text-[#53615C]">
                    {item.linea}
                  </span>
                )}

                {item.fuente && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      item.fuente === "EXCEL_ONEDRIVE"
                        ? "bg-[#DDEEEA] text-[#01634F]"
                        : "bg-[#F2ECD4] text-[#82763D]"
                    }`}
                  >
                    {item.fuente === "EXCEL_ONEDRIVE"
                      ? "Excel OneDrive"
                      : "Manual"}
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm font-semibold text-[#53615C]">
                {item.detalle?.trim() || "Sin detalle en Excel"}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#8A9591]">
                Fecha requerimiento
              </p>
              <p className="mt-1 text-sm font-bold text-[#26302D]">
                {formatDate(item.fechaRequerimiento)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs text-[#7A8782]">Cliente</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-[#26302D]">
                {clientText}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#7A8782]">OT(s)</p>
              <p className="mt-0.5 text-sm font-semibold text-[#26302D]">
                {formatList(item.ots, "Sin OT")}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#7A8782]">Proyecto(s)</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-[#26302D]">
                {formatList(item.proyectos, "Sin proyecto")}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#7A8782]">
                Procesos pendientes
              </p>
              <p className="mt-0.5 text-sm font-bold text-[#8E1A32]">
                {item.procesosPendientes} / {item.totalProcesos}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold text-[#61706B]">
                Avance asociado a la OV
              </p>
              <strong className="text-sm tabular-nums text-[#014638]">
                {progress.toFixed(1)}%
              </strong>
            </div>

            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#E8ECEA]">
              <div
                className="h-full rounded-full bg-[#08715B] transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2E6E4] bg-[#F8FAF9] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.07em] text-[#61706B]">
            Ajuste manual
          </p>

          <p className="mt-1 text-xs text-[#7A8782]">
            El siguiente sync de Excel puede reemplazar este valor.
          </p>

          <div className="mt-3 flex gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={priorityDraft}
              disabled={saving}
              onChange={(event) =>
                onPriorityDraftChange(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAssign();
                }
              }}
              placeholder={
                item.prioridad === null
                  ? "Ej. 1"
                  : String(item.prioridad)
              }
              className="min-w-0 flex-1 rounded-xl border border-[#CDD5D2] bg-white px-4 py-3 text-center text-base font-black tabular-nums outline-none focus:border-[#8E1A32]"
            />

            <button
              type="button"
              disabled={saving || priorityDraft.trim() === ""}
              onClick={onAssign}
              className="rounded-xl bg-[#8E1A32] px-4 py-3 text-sm font-bold text-white disabled:opacity-45"
            >
              {saving ? "Guardando..." : "Aplicar"}
            </button>
          </div>

          {isPrioritized ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving || item.prioridad === 1}
                onClick={() => onMove(-1)}
                className="min-h-11 rounded-xl border border-[#C9D2CE] bg-white text-sm font-semibold disabled:opacity-40"
              >
                ↑ Subir
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => onMove(1)}
                className="min-h-11 rounded-xl border border-[#C9D2CE] bg-white text-sm font-semibold disabled:opacity-40"
              >
                ↓ Bajar
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={onRemove}
                className="col-span-2 min-h-11 rounded-xl border border-[#E2B6BE] bg-[#FFF7F8] text-sm font-semibold text-[#8E1A32] disabled:opacity-40"
              >
                Quitar prioridad
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={onAppend}
              className="mt-3 min-h-11 w-full rounded-xl border border-[#BDD0CA] bg-[#F1F8F6] text-sm font-bold text-[#01634F] disabled:opacity-40"
            >
              Agregar al final
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Priorities() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<OvPrioridad[]>([]);

  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingOv, setSavingOv] = useState<number | null>(null);
  const [syncingExcel, setSyncingExcel] = useState(false);

  const [priorityDrafts, setPriorityDrafts] = useState<
    Record<number, string>
  >({});

  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 6_000);

    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const loadItems = useCallback(
    async (
      page = 1,
      signal?: AbortSignal,
      silent = false,
    ) => {
      if (!silent) {
        setLoading(true);
      }

      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });

        if (debouncedSearch) {
          params.set("search", debouncedSearch);
        }

        const data = await apiRequest<OvsPrioridadPayload>(
          `/prioridades?${params.toString()}`,
          { signal },
        );

        setItems(data.items ?? []);
        setPagination(data.pagination);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Error cargando OVs para priorizacion:",
          loadError,
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : "No fue posible cargar las OVs.",
        );
      } finally {
        if (!silent && !signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [debouncedSearch],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadItems(1, controller.signal);
    return () => controller.abort();
  }, [loadItems]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (savingOv === null && !syncingExcel) {
        void loadItems(pagination.page, undefined, true);
      }
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [loadItems, pagination.page, savingOv, syncingExcel]);

  const updatePriority = async (
    item: OvPrioridad,
    prioridad: number,
  ) => {
    if (
      !Number.isSafeInteger(prioridad) ||
      prioridad <= 0 ||
      savingOv !== null
    ) {
      return;
    }

    setSavingOv(item.numeroOv);

    try {
      const data = await apiRequest<AsignarPrioridadResult>(
        `/prioridades/${item.numeroOv}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prioridad }),
        },
      );

      setPriorityDrafts((current) => {
        const next = { ...current };
        delete next[item.numeroOv];
        return next;
      });

      setToast({
        variant: "success",
        title: "Prioridad actualizada",
        message:
          `La OV ${data.numeroOv} quedo en prioridad ${data.prioridad}.`,
      });

      await loadItems(pagination.page);
    } catch (saveError) {
      setToast({
        variant: "error",
        title: "No fue posible actualizar",
        message:
          saveError instanceof Error
            ? saveError.message
            : "No fue posible actualizar la prioridad.",
      });
    } finally {
      setSavingOv(null);
    }
  };

  const handleAssign = async (item: OvPrioridad) => {
    const draft =
      priorityDrafts[item.numeroOv] ??
      (item.prioridad === null
        ? ""
        : String(item.prioridad));

    const priority = Number(draft);

    if (!Number.isSafeInteger(priority) || priority <= 0) {
      setToast({
        variant: "warning",
        title: "Prioridad invalida",
        message:
          "La prioridad debe ser un entero mayor o igual a 1.",
      });
      return;
    }

    await updatePriority(item, priority);
  };

  const handleRemove = async (item: OvPrioridad) => {
    if (savingOv !== null) {
      return;
    }

    setSavingOv(item.numeroOv);

    try {
      await apiRequest<QuitarPrioridadResult>(
        `/prioridades/${item.numeroOv}`,
        { method: "DELETE" },
      );

      setToast({
        variant: "success",
        title: "Prioridad retirada",
        message: `La OV ${item.numeroOv} quedo sin prioridad.`,
      });

      await loadItems(pagination.page);
    } catch (removeError) {
      setToast({
        variant: "error",
        title: "No fue posible quitar la prioridad",
        message:
          removeError instanceof Error
            ? removeError.message
            : "No fue posible quitar la prioridad.",
      });
    } finally {
      setSavingOv(null);
    }
  };

  const handleSyncExcel = async () => {
    if (syncingExcel) {
      return;
    }

    setSyncingExcel(true);

    try {
      const data = await apiRequest<SyncExcelResult>(
        "/prioridades/sincronizar-excel",
        { method: "POST" },
      );

      const missing =
        data.ovsNoEncontradas.length > 0
          ? `\nOVs no encontradas en PostgreSQL: ${data.ovsNoEncontradas.join(", ")}`
          : "";

      setToast({
        variant:
          data.ovsNoEncontradas.length > 0
            ? "warning"
            : "success",
        title: "Excel sincronizado",
        message:
          `${data.ovsActualizadas} OV(s) actualizadas desde OneDrive.` +
          missing,
      });

      await loadItems(1);
    } catch (syncError) {
      setToast({
        variant: "error",
        title: "Error sincronizando Excel",
        message:
          syncError instanceof Error
            ? syncError.message
            : "No fue posible leer el Excel de OneDrive.",
      });
    } finally {
      setSyncingExcel(false);
    }
  };

  const summary = useMemo(() => {
    const priorizadas = items.filter(
      (item) => item.prioridad !== null,
    ).length;

    const desdeExcel = items.filter(
      (item) => item.fuente === "EXCEL_ONEDRIVE",
    ).length;

    const conPendientes = items.filter(
      (item) => item.procesosPendientes > 0,
    ).length;

    return {
      priorizadas,
      desdeExcel,
      conPendientes,
    };
  }, [items]);

  return (
    <div className="min-h-screen bg-[#F6F5F1] md:flex">
      {toast && (
        <ToastNotification
          toast={toast}
          onClose={() => setToast(null)}
        />
      )}

      <Sidebar activePage="programacion" />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-[#E8E9E6] bg-white/95 backdrop-blur">
          <div className="flex min-h-20 items-center justify-between gap-4 px-4 pl-20 sm:px-6 sm:pl-20 md:px-8 md:pl-8">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-xl font-bold text-[#111816] sm:text-2xl lg:text-3xl">
                  Priorizacion por OV
                </h1>

                <span className="rounded-full bg-[#E8DCE0] px-3 py-1 text-xs font-bold text-[#8E1A32]">
                  Excel OneDrive + PostgreSQL
                </span>
              </div>

              <p className="mt-1 hidden text-sm text-[#71807B] sm:block">
                La prioridad pertenece a la OV y se propaga a sus OTs y procesos.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={syncingExcel || savingOv !== null}
                onClick={() => void handleSyncExcel()}
                className="min-h-11 rounded-xl bg-[#014638] px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {syncingExcel
                  ? "Sincronizando..."
                  : "Sincronizar Excel"}
              </button>

              <button
                type="button"
                disabled={loading || savingOv !== null || syncingExcel}
                onClick={() => void loadItems(pagination.page)}
                className="hidden min-h-11 rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm font-semibold text-[#26302D] disabled:opacity-50 sm:block"
              >
                Actualizar
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="OVs internas"
              value={String(pagination.total)}
              helper="Base interna"
              accentClass="bg-[#8E1A32]"
            />

            <KpiCard
              title="Priorizadas"
              value={String(summary.priorizadas)}
              helper="En esta pagina"
              accentClass="bg-[#014638]"
            />

            <KpiCard
              title="Desde Excel"
              value={String(summary.desdeExcel)}
              helper="En esta pagina"
              accentClass="bg-[#9B8D4F]"
            />

            <KpiCard
              title="Con procesos pendientes"
              value={String(summary.conPendientes)}
              helper="En esta pagina"
              accentClass="bg-[#C63A50]"
            />
          </section>

          <section className="mt-7 rounded-2xl border border-[#D8DEDB] bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#111816]">
                  Prioridades por orden de venta
                </h2>
                <p className="mt-1 text-sm text-[#71807B]">
                  El archivo de OneDrive es la fuente principal. Solo se aplican OVs que ya existan en PostgreSQL.
                </p>
              </div>

              <input
                type="search"
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(event.target.value)
                }
                placeholder="Buscar OV, OT, cliente, detalle o proyecto"
                className="min-h-14 w-full rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm outline-none focus:border-[#8E1A32] xl:max-w-xl"
              />
            </div>
          </section>

          <section className="mt-5">
            {loading && items.length === 0 && (
              <div className="rounded-2xl border border-[#D8DEDB] bg-white px-6 py-16 text-center font-semibold text-[#71807B]">
                Cargando OVs...
              </div>
            )}

            {!loading && error && items.length === 0 && (
              <div className="rounded-2xl border border-[#E5B6BF] bg-[#FFF6F7] px-6 py-14 text-center font-semibold text-[#8E1A32]">
                {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="rounded-2xl border border-[#D8DEDB] bg-white px-6 py-16 text-center text-[#71807B]">
                No hay OVs para mostrar.
              </div>
            )}

            {items.length > 0 && (
              <div className="space-y-4">
                {items.map((item) => (
                  <OvCard
                    key={item.numeroOv}
                    item={item}
                    priorityDraft={
                      priorityDrafts[item.numeroOv] ??
                      (item.prioridad === null
                        ? ""
                        : String(item.prioridad))
                    }
                    saving={savingOv === item.numeroOv}
                    onPriorityDraftChange={(value) => {
                      setPriorityDrafts((current) => ({
                        ...current,
                        [item.numeroOv]: value,
                      }));
                    }}
                    onAssign={() => void handleAssign(item)}
                    onMove={(delta) => {
                      if (item.prioridad !== null) {
                        void updatePriority(
                          item,
                          Math.max(1, item.prioridad + delta),
                        );
                      }
                    }}
                    onAppend={() =>
                      void updatePriority(item, APPEND_PRIORITY)
                    }
                    onRemove={() => void handleRemove(item)}
                  />
                ))}
              </div>
            )}
          </section>

          {pagination.totalPages > 1 && (
            <nav className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#D8DEDB] bg-white px-5 py-4">
              <p className="text-sm font-semibold text-[#61706B]">
                Pagina {pagination.page} de {pagination.totalPages} · {pagination.total} OVs
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    loading ||
                    savingOv !== null ||
                    syncingExcel ||
                    pagination.page <= 1
                  }
                  onClick={() =>
                    void loadItems(pagination.page - 1)
                  }
                  className="min-h-11 rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm font-semibold disabled:opacity-40"
                >
                  Anterior
                </button>

                <button
                  type="button"
                  disabled={
                    loading ||
                    savingOv !== null ||
                    syncingExcel ||
                    pagination.page >= pagination.totalPages
                  }
                  onClick={() =>
                    void loadItems(pagination.page + 1)
                  }
                  className="min-h-11 rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm font-semibold disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </nav>
          )}
        </main>
      </div>
    </div>
  );
}
