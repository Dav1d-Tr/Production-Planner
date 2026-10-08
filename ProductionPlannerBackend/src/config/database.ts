import {
  Pool,
  QueryResultRow,
} from "pg";

import { env } from "./env";

const pool = new Pool({
  host: env.postgres.host,
  port: env.postgres.port,
  database: env.postgres.database,
  user: env.postgres.user,
  password: env.postgres.password,
});

pool.on(
  "error",
  (error: Error) => {
    console.error(
      "❌ Error inesperado en PostgreSQL:",
      error
    );
  }
);

export const query = <
  T extends QueryResultRow = QueryResultRow
>(
  text: string,
  params?: unknown[]
) => {
  return pool.query<T>(
    text,
    params
  );
};

export default pool;