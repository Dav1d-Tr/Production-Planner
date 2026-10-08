import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router";

import Sidebar from "../Components/Sidebar";
import { API_BASE } from "../config/api";

type ResponsablePlanta = {
  id: number;
  nombre: string;
  procesosAsignados: number;
  fechaCreacion: string;
  fechaActualizacion: string;
};

type EliminarResponsableResult = {
  id: number;
  nombre: string;
  procesosAsignadosConservados: number;
};

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

type Toast = {
  id: number;
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

const normalizeName = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .toLocaleLowerCase("es");

function ToastNotification({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: () => void;
}) {
  const style = {
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
      role={toast.variant === "error" ? "alert" : "status"}
      className={`fixed right-4 top-4 z-100 w-[calc(100%-2rem)] max-w-md rounded-2xl border p-4 shadow-xl ${style}`}
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
          aria-label="Cerrar notificacion"
          className="rounded-lg px-2 py-1 font-bold text-[#71807B] hover:bg-black/5"
        >
          x
        </button>
      </div>
    </div>
  );
}

export default function ResponsablesPlanta() {
  const navigate = useNavigate();

  const [items, setItems] = useState<ResponsablePlanta[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 5_000);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = (
    variant: Toast["variant"],
    title: string,
    message: string,
  ) => {
    setToast({
      id: Date.now(),
      variant,
      title,
      message,
    });
  };

  const loadItems = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      setError(null);

      try {
        const params = new URLSearchParams();

        if (debouncedSearch) {
          params.set("search", debouncedSearch);
        }

        const query = params.toString();

        const data = await apiRequest<ResponsablePlanta[]>(
          `/responsables-planta${query ? `?${query}` : ""}`,
          { signal },
        );

        setItems(data ?? []);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Error cargando responsables de planta:",
          loadError,
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : "No fue posible cargar los miembros de planta.",
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
    void loadItems(controller.signal);
    return () => controller.abort();
  }, [loadItems]);

  const totalAsignaciones = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total + Math.max(item.procesosAsignados || 0, 0),
        0,
      ),
    [items],
  );

  const handleCreate = async () => {
    const nombre = newName.trim().replace(/\s+/g, " ");

    if (!nombre) {
      showToast(
        "warning",
        "Nombre requerido",
        "Ingresa el nombre completo del miembro de planta.",
      );
      return;
    }

    if (
      items.some(
        (item) =>
          normalizeName(item.nombre) === normalizeName(nombre),
      )
    ) {
      showToast(
        "warning",
        "Nombre repetido",
        "Ese miembro de planta ya aparece en el catalogo.",
      );
      return;
    }

    setSaving(true);

    try {
      const created = await apiRequest<ResponsablePlanta>(
        "/responsables-planta",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ nombre }),
        },
      );

      setNewName("");

      showToast(
        "success",
        "Miembro agregado",
        `${created.nombre} ya esta disponible para asignar a operaciones.`,
      );

      await loadItems(undefined, true);
    } catch (createError) {
      showToast(
        "error",
        "No fue posible agregar",
        createError instanceof Error
          ? createError.message
          : "No fue posible agregar el miembro de planta.",
      );
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: ResponsablePlanta) => {
    setEditingId(item.id);
    setEditingName(item.nombre);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleUpdate = async (item: ResponsablePlanta) => {
    const nombre = editingName.trim().replace(/\s+/g, " ");

    if (!nombre) {
      showToast(
        "warning",
        "Nombre requerido",
        "El nombre completo no puede quedar vacio.",
      );
      return;
    }

    setSaving(true);

    try {
      const updated = await apiRequest<ResponsablePlanta>(
        `/responsables-planta/${item.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ nombre }),
        },
      );

      cancelEdit();

      showToast(
        "success",
        "Nombre actualizado",
        `${updated.nombre} fue actualizado tambien en sus asignaciones vinculadas.`,
      );

      await loadItems(undefined, true);
    } catch (updateError) {
      showToast(
        "error",
        "No fue posible editar",
        updateError instanceof Error
          ? updateError.message
          : "No fue posible actualizar el nombre.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ResponsablePlanta) => {
    const confirmed = window.confirm(
      item.procesosAsignados > 0
        ? `¿Eliminar a ${item.nombre} del catalogo?\n\nActualmente aparece en ${item.procesosAsignados} proceso(s). Esas asignaciones NO se eliminaran: conservaran el nombre como historico.`
        : `¿Eliminar a ${item.nombre} del catalogo de miembros de planta?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(item.id);

    try {
      const deleted =
        await apiRequest<EliminarResponsableResult>(
          `/responsables-planta/${item.id}`,
          { method: "DELETE" },
        );

      if (editingId === item.id) {
        cancelEdit();
      }

      showToast(
        "success",
        "Miembro eliminado del catalogo",
        deleted.procesosAsignadosConservados > 0
          ? `${deleted.nombre} fue retirado del catalogo. ${deleted.procesosAsignadosConservados} proceso(s) conservaron su asignacion y su nombre historico.`
          : `${deleted.nombre} fue retirado del catalogo.`,
      );

      await loadItems(undefined, true);
    } catch (deleteError) {
      showToast(
        "error",
        "No fue posible eliminar",
        deleteError instanceof Error
          ? deleteError.message
          : "No fue posible eliminar el miembro de planta.",
      );
    } finally {
      setDeletingId(null);
    }
  };

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
          <div className="flex min-h-20 items-center justify-between gap-4 px-4 pl-20 sm:px-6 sm:pl-20 md:px-8 md:pl-8">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-[#111816] sm:text-2xl lg:text-3xl">
                Miembros de planta
              </h1>
              <p className="mt-1 hidden text-sm text-[#71807B] sm:block">
                Catalogo de responsables disponibles para asignar a operaciones
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate("/coordinador")}
              className="min-h-11 rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm font-semibold text-[#26302D] hover:border-[#8E1A32] hover:text-[#8E1A32]"
            >
              Volver al coordinador
            </button>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-2xl border border-[#D8DEDB] bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-[#61706B]">
                Miembros visibles
              </p>
              <strong className="mt-2 block text-4xl text-[#111816]">
                {items.length}
              </strong>
              <p className="mt-1 text-xs text-[#89938F]">
                Resultado del filtro actual
              </p>
            </article>

            <article className="rounded-2xl border border-[#D8DEDB] bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-[#61706B]">
                Asignaciones visibles
              </p>
              <strong className="mt-2 block text-4xl text-[#014638]">
                {totalAsignaciones}
              </strong>
              <p className="mt-1 text-xs text-[#89938F]">
                Procesos asociados a los miembros mostrados
              </p>
            </article>

            <article className="rounded-2xl border border-[#D8DEDB] bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-[#61706B]">
                Proteccion historica
              </p>
              <strong className="mt-2 block text-xl text-[#8E1A32]">
                Asignaciones protegidas
              </strong>
              <p className="mt-2 text-xs leading-5 text-[#71807B]">
                Eliminar un nombre del catalogo nunca elimina el responsable de un proceso ya asignado.
              </p>
            </article>
          </section>

          <section className="mt-6 rounded-2xl border border-[#D8DEDB] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <label className="block">
                  <span className="text-sm font-semibold text-[#61706B]">
                    Nombre completo
                  </span>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={newName}
                      maxLength={150}
                      disabled={saving}
                      onChange={(event) =>
                        setNewName(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCreate();
                        }
                      }}
                      placeholder="Ej. Juan Carlos Perez Gomez"
                      className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm outline-none focus:border-[#8E1A32]"
                    />

                    <button
                      type="button"
                      disabled={saving || !newName.trim()}
                      onClick={() => void handleCreate()}
                      className="min-h-12 rounded-xl bg-[#014638] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {saving ? "Guardando..." : "Agregar miembro"}
                    </button>
                  </div>
                </label>
              </div>

              <label className="block lg:w-90">
                <span className="text-sm font-semibold text-[#61706B]">
                  Buscar
                </span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(event.target.value)
                  }
                  placeholder="Buscar por nombre..."
                  className="mt-2 min-h-12 w-full rounded-xl border border-[#D5DBD8] bg-white px-4 text-sm outline-none focus:border-[#8E1A32]"
                />
              </label>
            </div>
          </section>

          <section className="mt-5 overflow-hidden rounded-2xl border border-[#D8DEDB] bg-white shadow-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_150px_230px] border-b border-[#D8DEDB] bg-[#EEF2F0] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#64716B]">
              <span>Nombre completo</span>
              <span className="text-center">Procesos</span>
              <span className="text-right">Acciones</span>
            </div>

            {loading && (
              <div className="px-6 py-14 text-center font-semibold text-[#71807B]">
                Cargando miembros de planta...
              </div>
            )}

            {!loading && error && (
              <div className="bg-[#FFF6F7] px-6 py-12 text-center font-semibold text-[#8E1A32]">
                {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="px-6 py-14 text-center text-[#71807B]">
                {debouncedSearch
                  ? "No hay miembros que coincidan con la busqueda."
                  : "Todavia no hay miembros de planta en el catalogo."}
              </div>
            )}

            {!loading &&
              !error &&
              items.map((item) => {
                const editing = editingId === item.id;

                return (
                  <div
                    key={item.id}
                    className="grid min-h-18 grid-cols-[minmax(0,1fr)_150px_230px] items-center border-b border-[#E7ECE9] px-5 py-3 last:border-b-0 hover:bg-[#F8FAF9]"
                  >
                    <div className="min-w-0 pr-4">
                      {editing ? (
                        <input
                          autoFocus
                          type="text"
                          maxLength={150}
                          value={editingName}
                          disabled={saving}
                          onChange={(event) =>
                            setEditingName(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleUpdate(item);
                            }

                            if (event.key === "Escape") {
                              cancelEdit();
                            }
                          }}
                          className="min-h-11 w-full rounded-lg border border-[#8E1A32] bg-white px-3 font-semibold text-[#18201E] outline-none"
                        />
                      ) : (
                        <>
                          <p className="truncate font-bold text-[#17201D]">
                            {item.nombre}
                          </p>
                          <p className="mt-1 text-xs text-[#89938F]">
                            ID {item.id}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="text-center">
                      <span
                        className={`inline-flex min-w-10 justify-center rounded-full px-3 py-1 text-sm font-bold ${
                          item.procesosAsignados > 0
                            ? "bg-[#E2F0ED] text-[#01634F]"
                            : "bg-[#EEF1EF] text-[#7A8782]"
                        }`}
                      >
                        {item.procesosAsignados}
                      </span>
                    </div>

                    <div className="flex justify-end gap-2">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            disabled={
                              saving || !editingName.trim()
                            }
                            onClick={() =>
                              void handleUpdate(item)
                            }
                            className="min-h-10 rounded-lg bg-[#014638] px-3 text-xs font-bold text-white disabled:opacity-45"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={cancelEdit}
                            className="min-h-10 rounded-lg border border-[#D5DBD8] bg-white px-3 text-xs font-semibold text-[#53615C]"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={
                              saving || deletingId !== null
                            }
                            onClick={() => startEdit(item)}
                            className="min-h-10 rounded-lg border border-[#BDD0CA] bg-[#F1F8F6] px-3 text-xs font-bold text-[#01634F] disabled:opacity-40"
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            disabled={
                              saving || deletingId !== null
                            }
                            onClick={() =>
                              void handleDelete(item)
                            }
                            className="min-h-10 rounded-lg border border-[#E2B6BE] bg-[#FFF7F8] px-3 text-xs font-bold text-[#8E1A32] disabled:opacity-40"
                          >
                            {deletingId === item.id
                              ? "Eliminando..."
                              : "Eliminar"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
          </section>
        </main>
      </div>
    </div>
  );
}
