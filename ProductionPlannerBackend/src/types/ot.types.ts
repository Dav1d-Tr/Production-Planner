export interface EpicorOtListItem {
  company: string;
  ot: string;
  cliente: string | null;
  ov: number | null;
  proyecto: string | null;
  partNum: string | null;
  partDescription: string | null;
  plano: string | null;
  prodCode: string | null;
  jobReleased: boolean;
  jobClosed: boolean;
  cantidadOT: number;
  operacionActual: string | null;
  assemblySeq: number | null;
  oprSeq: number | null;
  opCode: string | null;
  cantidadProgramada: number;
  cantidadProducida: number;
  progreso: number;
}

export interface EpicorProceso {
  oprSeq: number;
  opCode: string | null;
  opDesc: string | null;
  maquinas: string[];
  maquina: string | null;
  area: string | null;
  areaId: string | null;
  cantidadProgramada: number;
  cantidadProducida: number;
  cantidadFaltante: number;
  tiempoEstimadoHoras: number;
  tiempoUnitarioHoras: number;
  tiempoProducidoHoras: number;
  idProceso?: number | null;
  programacion?: {
    idProgramacion: number;
    estado: string;
    fechaProgramada: string;
  } | null;
}

export interface EpicorEnsamble {
  assemblySeq: number;
  partNum: string | null;
  ensamble: string | null;
  plano: string | null;
  procesos: EpicorProceso[];
}

export interface EpicorOtDetail {
  company: string;
  ot: string;
  cliente: string | null;
  ov: number | null;
  ovs: Array<{
    numeroOv: number;
    cliente: string | null;
  }>;
  proyecto: string | null;
  partNum: string | null;
  partDescription: string | null;
  plano: string | null;
  prodCode: string | null;
  jobReleased: boolean;
  jobClosed: boolean;
  cantidadOT: number;
  progreso: number;
  ensambles: EpicorEnsamble[];
  sincronizada?: boolean;
  idOtLocal?: number | null;
  estadoLocal?: string | null;
}
