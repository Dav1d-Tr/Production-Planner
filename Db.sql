-- ============================================================
-- PRODUCTION PLANNER - ESQUEMA COMPLETO V4
-- PostgreSQL
-- ============================================================
--
-- MODELO:
--
-- usuarios
--   └── Usuarios que ingresan a la aplicación
--
-- ots
-- ├── ovs
-- │   └── clientes
-- │
-- └── ensambles
--      └── procesos
--           ├── area
--           ├── lider (texto, máximo uno)
--           └── procesos_responsables
--                └── nombre (texto, uno o varios)
--
-- REGLAS PRINCIPALES:
--
-- 1. Los usuarios de la aplicación NO están relacionados
--    con líderes ni responsables de producción.
--
-- 2. El líder se escribe directamente en el proceso.
--
-- 3. Un proceso puede tener 0 o 1 líder.
--
-- 4. Un proceso puede tener 0, 1 o muchos responsables.
--
-- 5. Los responsables se almacenan textualmente.
--
-- 6. La cantidad faltante NO se escribe manualmente:
--
--      faltante = programada - producida
--
--    con mínimo de 0.
--
-- 7. cantidad_producida será actualizada desde Epicor.
--
-- 8. Se almacenan datos de control de sincronización
--    para Epicor.
--
-- ============================================================


BEGIN;


-- ============================================================
-- TABLA: USUARIOS
-- ============================================================
--
-- Esta tabla queda exclusivamente para usuarios que acceden
-- al sistema.
--
-- NO representa responsables ni líderes de producción.
-- ============================================================

CREATE TABLE public.usuarios (
    id BIGSERIAL PRIMARY KEY,

    correo VARCHAR(150) NOT NULL UNIQUE,

    nombre VARCHAR(150) NOT NULL,

    password_hash TEXT NOT NULL,

    activo BOOLEAN NOT NULL DEFAULT TRUE,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_usuario_correo
        CHECK (BTRIM(correo) <> ''),

    CONSTRAINT chk_usuario_nombre
        CHECK (BTRIM(nombre) <> '')
);


-- ============================================================
-- TABLA: AREAS
-- ============================================================

CREATE TABLE public.areas (
    id BIGSERIAL PRIMARY KEY,

    area VARCHAR(100) NOT NULL UNIQUE,

    activo BOOLEAN NOT NULL DEFAULT TRUE,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_area_nombre
        CHECK (BTRIM(area) <> '')
);


-- ============================================================
-- TABLA: ESTADOS
-- ============================================================

CREATE TABLE public.estados (
    id BIGSERIAL PRIMARY KEY,

    estado VARCHAR(100) NOT NULL UNIQUE,

    descripcion TEXT,

    activo BOOLEAN NOT NULL DEFAULT TRUE,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_estado_nombre
        CHECK (BTRIM(estado) <> '')
);


-- ============================================================
-- TABLA: ORDENES DE TRABAJO
-- ============================================================
--
-- La OT corresponde al JobNum de Epicor.
-- ============================================================

CREATE TABLE public.ots (
    id BIGSERIAL PRIMARY KEY,

    ot VARCHAR(50) NOT NULL UNIQUE,

    part_num VARCHAR(100),

    part_description TEXT,

    plano VARCHAR(255),

    prod_code VARCHAR(100),

    proyecto TEXT,

    fecha_inicio DATE NOT NULL,

    fecha_fin DATE,

    id_estado BIGINT NOT NULL,

    job_released BOOLEAN NOT NULL DEFAULT FALSE,

    job_closed BOOLEAN NOT NULL DEFAULT FALSE,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ot_estado
        FOREIGN KEY (id_estado)
        REFERENCES public.estados(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_ot_fechas
        CHECK (
            fecha_fin IS NULL
            OR fecha_fin >= fecha_inicio
        ),

    CONSTRAINT chk_ot_numero
        CHECK (BTRIM(ot) <> '')
);


-- ============================================================
-- TABLA: ORDENES DE VENTA
-- ============================================================
--
-- Una OT puede tener:
-- 0, 1 o varias órdenes de venta.
-- ============================================================

CREATE TABLE public.ovs (
    id BIGSERIAL PRIMARY KEY,

    id_ot BIGINT NOT NULL,

    numero_ov BIGINT NOT NULL,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ov_ot
        FOREIGN KEY (id_ot)
        REFERENCES public.ots(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT uq_ov_ot_numero
        UNIQUE (id_ot, numero_ov),

    CONSTRAINT chk_ov_numero
        CHECK (numero_ov > 0)
);


-- ============================================================
-- TABLA: CLIENTES
-- ============================================================

CREATE TABLE public.clientes (
    id BIGSERIAL PRIMARY KEY,

    id_ov BIGINT NOT NULL,

    nombre_cliente VARCHAR(250) NOT NULL,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cliente_ov
        FOREIGN KEY (id_ov)
        REFERENCES public.ovs(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT chk_cliente_nombre
        CHECK (BTRIM(nombre_cliente) <> '')
);


-- ============================================================
-- TABLA: ENSAMBLES
-- ============================================================
--
-- Cada ensamble pertenece directamente a una OT.
--
-- Epicor:
--
-- JobNum      = ots.ot
-- AssemblySeq = ensambles.assembly_seq
--
-- ============================================================

CREATE TABLE public.ensambles (
    id BIGSERIAL PRIMARY KEY,

    id_ot BIGINT NOT NULL,

    assembly_seq INTEGER NOT NULL,

    part_num VARCHAR(100),

    ensamble VARCHAR(255) NOT NULL,

    plano VARCHAR(255),

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ensamble_ot
        FOREIGN KEY (id_ot)
        REFERENCES public.ots(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT uq_ensamble_ot
        UNIQUE (id_ot, assembly_seq),

    CONSTRAINT chk_ensamble_assembly_seq
        CHECK (assembly_seq >= 0),

    CONSTRAINT chk_ensamble_nombre
        CHECK (BTRIM(ensamble) <> '')
);


-- ============================================================
-- TABLA: PROCESOS
-- ============================================================
--
-- Epicor:
--
-- JobNum      = ots.ot
-- AssemblySeq = ensambles.assembly_seq
-- OprSeq      = procesos.opr_seq
--
--
-- RESPONSABILIDAD:
--
-- lider:
--     Campo textual.
--     Solo puede existir un valor.
--
--
-- CANTIDADES:
--
-- cantidad_programada:
--     Cantidad total requerida.
--
-- cantidad_producida:
--     Cantidad obtenida/sincronizada desde Epicor.
--
-- cantidad_faltante:
--     Calculada automáticamente.
--
--
-- SINCRONIZACION:
--
-- ultima_sincronizacion_epicor
-- sincronizacion_epicor_ok
-- error_sincronizacion_epicor
--
-- ============================================================

CREATE TABLE public.procesos (
    id BIGSERIAL PRIMARY KEY,

    id_ensamble BIGINT NOT NULL,

    opr_seq INTEGER NOT NULL,

    op_code VARCHAR(100),

    op_desc TEXT,

    maquina TEXT,

    id_area BIGINT DEFAULT NULL,

    -- ========================================================
    -- LIDER DEL PROCESO
    -- ========================================================

    lider VARCHAR(150),

    -- ========================================================
    -- CANTIDADES
    -- ========================================================

    cantidad_programada NUMERIC(18,4),

    cantidad_producida NUMERIC(18,4) NOT NULL DEFAULT 0,

    cantidad_faltante NUMERIC(18,4)
        GENERATED ALWAYS AS (
            GREATEST(
                COALESCE(cantidad_programada, 0::NUMERIC)
                -
                COALESCE(cantidad_producida, 0::NUMERIC),
                0::NUMERIC
            )
        ) STORED,

    -- ========================================================
    -- TIEMPOS
    -- ========================================================

    tiempo_estimado_horas NUMERIC(18,4),

    tiempo_unitario_horas NUMERIC(18,6),

    tiempo_producido_horas NUMERIC(18,4),

    -- ========================================================
    -- SINCRONIZACION EPICOR
    -- ========================================================

    ultima_sincronizacion_epicor TIMESTAMP,

    sincronizacion_epicor_ok BOOLEAN NOT NULL DEFAULT FALSE,

    error_sincronizacion_epicor TEXT,

    -- ========================================================
    -- AUDITORIA
    -- ========================================================

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- ========================================================
    -- FOREIGN KEYS
    -- ========================================================

    CONSTRAINT fk_proceso_ensamble
        FOREIGN KEY (id_ensamble)
        REFERENCES public.ensambles(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_proceso_area
        FOREIGN KEY (id_area)
        REFERENCES public.areas(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    -- ========================================================
    -- UNICIDAD
    -- ========================================================

    CONSTRAINT uq_proceso_ensamble
        UNIQUE (id_ensamble, opr_seq),

    -- ========================================================
    -- VALIDACIONES
    -- ========================================================

    CONSTRAINT chk_proceso_opr_seq
        CHECK (opr_seq >= 0),

    CONSTRAINT chk_proceso_lider
        CHECK (
            lider IS NULL
            OR BTRIM(lider) <> ''
        ),

    CONSTRAINT chk_cantidad_programada
        CHECK (
            cantidad_programada IS NULL
            OR cantidad_programada >= 0
        ),

    CONSTRAINT chk_cantidad_producida
        CHECK (
            cantidad_producida >= 0
        ),

    CONSTRAINT chk_tiempo_estimado
        CHECK (
            tiempo_estimado_horas IS NULL
            OR tiempo_estimado_horas >= 0
        ),

    CONSTRAINT chk_tiempo_unitario
        CHECK (
            tiempo_unitario_horas IS NULL
            OR tiempo_unitario_horas >= 0
        ),

    CONSTRAINT chk_tiempo_producido
        CHECK (
            tiempo_producido_horas IS NULL
            OR tiempo_producido_horas >= 0
        )
);


-- ============================================================
-- TABLA: PROCESOS RESPONSABLES
-- ============================================================
--
-- Los responsables se almacenan como TEXTO.
--
-- Ya NO dependen de:
--
-- usuarios
-- usuarios_responsables
--
--
-- Ejemplo:
--
-- proceso 1
-- ├── Francisco Arango
-- ├── Juan Pérez
-- └── Carlos Gómez
--
-- ============================================================

CREATE TABLE public.procesos_responsables (
    id BIGSERIAL PRIMARY KEY,

    id_proceso BIGINT NOT NULL,

    nombre VARCHAR(150) NOT NULL,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_procesos_responsables_proceso
        FOREIGN KEY (id_proceso)
        REFERENCES public.procesos(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT chk_responsable_nombre
        CHECK (BTRIM(nombre) <> '')
);


-- ============================================================
-- EVITAR RESPONSABLES DUPLICADOS
-- ============================================================
--
-- Esto evita casos como:
--
-- Juan Pérez
-- juan pérez
-- JUAN PÉREZ
--
-- dentro del mismo proceso.
--
-- ============================================================

CREATE UNIQUE INDEX uq_proceso_responsable_nombre
    ON public.procesos_responsables (
        id_proceso,
        LOWER(BTRIM(nombre))
    );


-- ============================================================
-- INDICES
-- ============================================================

CREATE INDEX idx_ots_estado
    ON public.ots(id_estado);


CREATE INDEX idx_ots_ot
    ON public.ots(ot);


CREATE INDEX idx_ots_job_closed
    ON public.ots(job_closed);


CREATE INDEX idx_ovs_ot
    ON public.ovs(id_ot);


CREATE INDEX idx_ovs_numero
    ON public.ovs(numero_ov);


CREATE INDEX idx_clientes_ov
    ON public.clientes(id_ov);


CREATE INDEX idx_ensambles_ot
    ON public.ensambles(id_ot);


CREATE INDEX idx_ensambles_assembly_seq
    ON public.ensambles(assembly_seq);


CREATE INDEX idx_procesos_ensamble
    ON public.procesos(id_ensamble);


CREATE INDEX idx_procesos_area
    ON public.procesos(id_area);


CREATE INDEX idx_procesos_opr_seq
    ON public.procesos(opr_seq);


CREATE INDEX idx_procesos_cantidad_faltante
    ON public.procesos(cantidad_faltante);


CREATE INDEX idx_procesos_sincronizacion_epicor
    ON public.procesos(sincronizacion_epicor_ok);


CREATE INDEX idx_procesos_ultima_sincronizacion
    ON public.procesos(ultima_sincronizacion_epicor);


CREATE INDEX idx_procesos_responsables_proceso
    ON public.procesos_responsables(id_proceso);


-- ============================================================
-- DATOS INICIALES: ESTADOS
-- ============================================================

INSERT INTO public.estados (
    estado,
    descripcion
)
VALUES
    (
        'Pendiente',
        'OT creada pero pendiente de iniciar'
    ),
    (
        'Programada',
        'OT programada para iniciar producción'
    ),
    (
        'En proceso',
        'OT actualmente en producción'
    ),
    (
        'Pausada',
        'OT temporalmente pausada'
    ),
    (
        'Finalizada',
        'OT terminada'
    ),
    (
        'Cancelada',
        'OT cancelada'
    );


-- ============================================================
-- DATOS INICIALES: AREAS
-- ============================================================

INSERT INTO public.areas (area)
VALUES
    ('CORTE'),
    ('CONFORMADO'),
    ('SOLDADURA'),
	('PUNZONADO'),
    ('PINTURA'),
    ('ENSAMBLE'),
    ('CALIDAD'),
    ('SUBCONTRATACIÓN'),
    ('EMPAQUE'),
    ('APROVECHAMIENTO');


-- ============================================================
-- FUNCION:
-- ACTUALIZAR fecha_actualizacion
-- ============================================================

CREATE OR REPLACE FUNCTION public.actualizar_fecha_actualizacion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    NEW.fecha_actualizacion = CURRENT_TIMESTAMP;

    RETURN NEW;

END;
$$;


-- ============================================================
-- TRIGGER: USUARIOS
-- ============================================================

CREATE TRIGGER trg_usuarios_fecha_actualizacion
BEFORE UPDATE
ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_fecha_actualizacion();


-- ============================================================
-- TRIGGER: OTS
-- ============================================================

CREATE TRIGGER trg_ots_fecha_actualizacion
BEFORE UPDATE
ON public.ots
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_fecha_actualizacion();


-- ============================================================
-- TRIGGER: CLIENTES
-- ============================================================

CREATE TRIGGER trg_clientes_fecha_actualizacion
BEFORE UPDATE
ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_fecha_actualizacion();


-- ============================================================
-- TRIGGER: PROCESOS
-- ============================================================

CREATE TRIGGER trg_procesos_fecha_actualizacion
BEFORE UPDATE
ON public.procesos
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_fecha_actualizacion();


-- ============================================================
-- VISTA: PROCESOS PENDIENTES DEL PLANNER
-- ============================================================
--
-- Esta vista devuelve únicamente procesos que todavía
-- tienen producción pendiente.
--
-- Cuando Epicor actualice cantidad_producida y:
--
-- cantidad_faltante = 0
--
-- el proceso dejará automáticamente de aparecer aquí.
--
-- ============================================================

CREATE VIEW public.vw_procesos_pendientes AS

SELECT
    p.id AS id_proceso,

    o.id AS id_ot,
    o.ot,

    o.part_num AS ot_part_num,
    o.part_description,

    o.proyecto,

    o.job_released,
    o.job_closed,

    e.id AS id_ensamble,
    e.assembly_seq,
    e.part_num AS ensamble_part_num,
    e.ensamble,

    p.opr_seq,
    p.op_code,
    p.op_desc,

    p.maquina,

    p.id_area,

    a.area,

    p.lider,

    p.cantidad_programada,

    p.cantidad_producida,

    p.cantidad_faltante,

    p.tiempo_estimado_horas,

    p.tiempo_unitario_horas,

    p.tiempo_producido_horas,

    p.ultima_sincronizacion_epicor,

    p.sincronizacion_epicor_ok,

    p.error_sincronizacion_epicor,

    p.fecha_actualizacion

FROM public.procesos AS p

INNER JOIN public.ensambles AS e
    ON e.id = p.id_ensamble

INNER JOIN public.ots AS o
    ON o.id = e.id_ot

LEFT JOIN public.areas AS a
    ON a.id = p.id_area

WHERE
    p.cantidad_faltante > 0
    AND o.job_closed = FALSE;


-- ============================================================
-- VISTA: RESPONSABLES AGRUPADOS POR PROCESO
-- ============================================================
--
-- Útil para el frontend.
--
-- Devuelve:
--
-- id_proceso | responsables
--
-- donde responsables será un ARRAY de PostgreSQL.
--
-- Ejemplo:
--
-- {Francisco Arango,Juan Perez,Carlos Gomez}
--
-- ============================================================

CREATE VIEW public.vw_procesos_responsables AS

SELECT
    p.id AS id_proceso,

    COALESCE(
        ARRAY_AGG(
            pr.nombre
            ORDER BY pr.nombre
        )
        FILTER (
            WHERE pr.id IS NOT NULL
        ),
        ARRAY[]::VARCHAR[]
    ) AS responsables

FROM public.procesos AS p

LEFT JOIN public.procesos_responsables AS pr
    ON pr.id_proceso = p.id

GROUP BY
    p.id;


-- ============================================================
-- FIN
-- ============================================================

COMMIT;