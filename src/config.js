import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const configPath = path.join(projectRoot, "config.json");
const exampleConfigPath = path.join(projectRoot, "config.example.json");

export function loadConfig() {
  const sourcePath = fs.existsSync(configPath) ? configPath : exampleConfigPath;
  const raw = fs.readFileSync(sourcePath, "utf8");
  const config = JSON.parse(raw);

  if (!config.printers || typeof config.printers !== "object") {
    throw new Error("config is missing printers");
  }

  return config;
}
