import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const configPath = path.join(projectRoot, "config.json");
const exampleConfigPath = path.join(projectRoot, "config.example.json");

function defaultConfig() {
  return {
    server: { port: 8080 },
    auth: {
      passwordForRead: false,
      passwordForWrite: false,
      password: "change-me",
      loginRequired: true,
      slicerApiKey: "change-me-slicer-key",
      slicerRequireApiKey: false,
    },
    printers: {},
  };
}

export function loadConfig() {
  let config;
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } else if (fs.existsSync(exampleConfigPath)) {
    config = JSON.parse(fs.readFileSync(exampleConfigPath, "utf8"));
  } else {
    config = defaultConfig();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  if (!config.printers || typeof config.printers !== "object") {
    config.printers = {};
  }
  if (!config.auth || typeof config.auth !== "object") {
    config.auth = defaultConfig().auth;
  }
  if (typeof config.auth.slicerApiKey !== "string") {
    config.auth.slicerApiKey = config.auth.password || defaultConfig().auth.slicerApiKey;
  }
  if (typeof config.auth.slicerRequireApiKey !== "boolean") {
    config.auth.slicerRequireApiKey = defaultConfig().auth.slicerRequireApiKey;
  }

  return config;
}

export function saveConfig(config) {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}
