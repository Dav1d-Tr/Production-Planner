import express from "express";
import cors from "cors";

import otsRoutes from "./routes/otsroutes";
import programacionRoutes from "./routes/programacionRoutes";
import procesosRoutes from "./routes/procesosRoutes";
import controlProduccionRoutes from "./routes/controlProduccionRoutes";
import prioridadesRoutes from "./routes/prioridadesRoutes";
import responsablesPlantaRoutes from "./routes/responsablesPlantaRoutes";

const app = express();

// ==========================================
// MIDDLEWARES
// ==========================================

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    message:
      "Production Planner Backend funcionando",
  });
});

// ==========================================
// RUTAS API
// ==========================================

app.use("/api/ots", otsRoutes);

app.use(
  "/api/programacion",
  programacionRoutes
);

app.use(
  "/api/procesos",
  procesosRoutes
);

app.use(
  "/api/control-produccion",
  controlProduccionRoutes
);

app.use(
  "/api/prioridades",
  prioridadesRoutes
);

app.use(
  "/api/responsables-planta",
  responsablesPlantaRoutes
);

// ==========================================
// 404 SOLO PARA API
// ==========================================

app.use("/api", (_req, res) => {
  res.status(404).json({
    success: false,
    message: "Ruta API no encontrada.",
  });
});

export default app;