import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  // PostgreSQL
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",

  // Epicor
  "EPICOR_DB_HOST",
  "EPICOR_DB_NAME",
  "EPICOR_DB_USER",
  "EPICOR_DB_PASSWORD",

];

for (const envName of requiredEnv) {
  if (!process.env[envName]) {
    throw new Error(`Falta la variable de entorno: ${envName}`);
  }
}

export const env = {
  port: Number(process.env.PORT) || 8090,

  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",

  postgres: {
    host: process.env.DB_HOST as string,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME as string,
    user: process.env.DB_USER as string,
    password: process.env.DB_PASSWORD as string,
  },

  epicor: {
    host: process.env.EPICOR_DB_HOST as string,
    port: Number(process.env.EPICOR_DB_PORT) || 1433,
    database: process.env.EPICOR_DB_NAME as string,
    user: process.env.EPICOR_DB_USER as string,
    password: process.env.EPICOR_DB_PASSWORD as string,
  },
};