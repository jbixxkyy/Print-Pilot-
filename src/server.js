import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { loadConfig, saveConfig } from "./config.js";
import { AuthManager } from "./authManager.js";
import { createAuthRouter } from "./routes/auth.js";
import { createPrinterRouter } from "./routes/printers.js";
import { createSlicerBridgeRouter } from "./routes/slicerBridge.js";

dotenv.config();

const config = loadConfig();
const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const publicDir = path.join(projectRoot, "public");
const port = Number(process.env.PORT || config.server?.port || 8080);
const host = String(process.env.HOST || "0.0.0.0");
const authManager = new AuthManager({ projectRoot, config });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Slicer bridge can be reached as /api/... (root mount) and /octoprint/api/...
app.use(createSlicerBridgeRouter(config));
app.use("/octoprint", createSlicerBridgeRouter(config));
app.use("/api/auth", createAuthRouter(authManager));
app.use("/api/printers", createPrinterRouter(config, { saveConfig, authManager }));

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: error.code || (status === 500 ? "SERVER_ERROR" : "REQUEST_ERROR"),
    message: error.message || "unexpected error",
  });
});

app.listen(port, host, () => {
  console.log(`flashforge-api-server-node listening on http://${host}:${port}`);
  console.log(`local access: http://localhost:${port}`);
});
