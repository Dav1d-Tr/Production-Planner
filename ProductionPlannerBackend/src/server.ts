import app from "./app";
import { env } from "./config/env";
import pool from "./config/database";

import {
  startPrioridadesExcelAutoSync,
} from "./services/prioridadesExcelService";

const HOST = "0.0.0.0";

const startServer = async () => {
  try {
    // ======================================================
    // VALIDAR POSTGRESQL
    // ======================================================

    await pool.query("SELECT 1");

    console.log(
      "PostgreSQL conectado correctamente"
    );

    // ======================================================
    // INICIAR SERVIDOR EXPRESS
    // ======================================================

    app.listen(env.port, HOST, () => {
      console.log(
        `Production Planner Backend ejecutándose en http://localhost:${env.port}`
      );

      console.log(
        `Health: http://localhost:${env.port}/api/health`
      );

      // ====================================================
      // INICIAR SINCRONIZACION AUTOMATICA DE PRIORIDADES
      // ====================================================

      console.log(
        "[Prioridades Excel] Iniciando sincronizacion automatica..."
      );

      startPrioridadesExcelAutoSync();
    });
  } catch (error) {
    console.error(
      "No se pudo iniciar el servidor:",
      error
    );

    process.exit(1);
  }
};

void startServer();