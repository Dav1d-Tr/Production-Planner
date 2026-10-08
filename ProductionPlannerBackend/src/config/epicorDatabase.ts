import {
  ConnectionPool,
  config as SqlConfig,
} from "mssql";

import { env } from "./env";

const epicorConfig: SqlConfig = {
  server: env.epicor.host,
  port: env.epicor.port,
  database: env.epicor.database,
  user: env.epicor.user,
  password: env.epicor.password,

  options: {
    encrypt: false,
    trustServerCertificate: true,
  },

  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },

  connectionTimeout: 15000,
  requestTimeout: 60000,
};

let poolPromise: Promise<ConnectionPool> | null = null;

export const getEpicorPool =
  async (): Promise<ConnectionPool> => {

    if (!poolPromise) {
      const pool = new ConnectionPool(epicorConfig);

      poolPromise = pool
        .connect()
        .then((connectedPool) => {
          console.log(
            "✅ Conexión establecida con Epicor SQL Server"
          );

          connectedPool.on("error", (error) => {
            console.error(
              "❌ Error en conexión Epicor:",
              error
            );
          });

          return connectedPool;
        })
        .catch((error) => {
          poolPromise = null;

          console.error(
            "❌ No fue posible conectar con Epicor:",
            error
          );

          throw error;
        });
    }

    return poolPromise;
  };