import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { loadConfig } from "./config.js";
import { createPrinterRouter } from "./routes/printers.js";

dotenv.config();

const config = loadConfig();
const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const publicDir = path.join(projectRoot, "public");
const port = Number(process.env.PORT || config.server?.port || 8080);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/printers", createPrinterRouter(config));

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: error.code || (status === 500 ? "SERVER_ERROR" : "REQUEST_ERROR"),
    message: error.message || "unexpected error",
  });
});

app.listen(port, () => {
  console.log(`flashforge-api-server-node listening on http://localhost:${port}`);
});
