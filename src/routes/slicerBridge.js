import express from "express";
import multer from "multer";
import { uploadPrinterFile } from "../printerClient.js";

const upload = multer({ storage: multer.memoryStorage() });

function parseBool(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes";
}

export function createSlicerBridgeRouter(config) {
  const router = express.Router();
  const octoServerVersion = "1.10.3";
  const octoApiVersion = "0.1";

  function getConfiguredApiKey() {
    const explicit = String(config?.auth?.slicerApiKey || "").trim();
    if (explicit) return explicit;
    const fallback = String(config?.auth?.password || "").trim();
    return fallback;
  }

  function resolvePrinterId(req) {
    const fromQuery = String(req.query.printerId || "").trim();
    if (fromQuery && config.printers[fromQuery]) return fromQuery;

    const fromBody = String(req.body?.printerId || "").trim();
    if (fromBody && config.printers[fromBody]) return fromBody;

    if (config.printers.main) return "main";
    const first = Object.keys(config.printers || {})[0];
    if (first) return first;

    const error = new Error("no printers configured");
    error.status = 400;
    error.code = "NO_PRINTERS";
    throw error;
  }

  function requireApiKey(req, _res, next) {
    if (config?.auth?.slicerRequireApiKey === false) {
      next();
      return;
    }

    const expected = getConfiguredApiKey();
    if (!expected) {
      next(Object.assign(new Error("set auth.slicerApiKey or auth.password in config.json"), {
        status: 503,
        code: "SLICER_API_KEY_NOT_CONFIGURED",
      }));
      return;
    }

    const provided = String(
      req.header("x-api-key")
      || req.query.apikey
      || req.query.api_key
      || ""
    ).trim();

    if (provided && provided === expected) {
      next();
      return;
    }

    next(Object.assign(new Error("invalid slicer API key"), { status: 401, code: "INVALID_SLICER_API_KEY" }));
  }

  function sendVersion(res) {
    res.json({
      api: octoApiVersion,
      server: octoServerVersion,
      text: `OctoPrint ${octoServerVersion} (PrintPilot Bridge)`,
    });
  }

  // Keep version public for slicer compatibility checks.
  router.get("/api/version", (_req, res) => {
    sendVersion(res);
  });

  router.get("/api/server", requireApiKey, (_req, res) => {
    res.json({
      server: "PrintPilot",
      safemode: null,
    });
  });

  router.get("/api/printer", requireApiKey, (req, res) => {
    const printerId = resolvePrinterId(req);
    res.json({
      state: {
        text: "Operational",
        flags: {
          operational: true,
          printing: false,
          closedOrError: false,
          error: false,
          paused: false,
          ready: true,
        },
      },
      printerId,
    });
  });

  router.post("/api/files/local", requireApiKey, upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        throw Object.assign(new Error("file is required"), { status: 400, code: "UPLOAD_ERROR" });
      }

      const printerId = resolvePrinterId(req);
      const printer = config.printers[printerId];
      const sourceName = String(req.body?.filename || req.file.originalname || "upload.gcode");
      const fileName = sourceName.split("/").pop();
      const printNow = parseBool(req.body?.print || req.body?.select || req.body?.print_now);

      await uploadPrinterFile(printer, req.file, { fileName, printNow });

      res.status(201).json({
        done: true,
        files: {
          local: {
            name: fileName,
            path: fileName,
            origin: "local",
          },
        },
        printerId,
        printStarted: printNow,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
