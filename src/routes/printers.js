import express from "express";
import multer from "multer";
import {
  deletePrinterFile,
  getCameraSnapshot,
  getPrinterDetail,
  getPrinterFileThumbnail,
  getPrinterFiles,
  getPrinterFilesDebug,
  getPrinterSummary,
  proxyCameraStream,
  runPrinterRequest,
  startPrinterFile,
  uploadPrinterFile,
} from "../printerClient.js";

const upload = multer({ storage: multer.memoryStorage() });

export function createPrinterRouter(config, { saveConfig, authManager }) {
  const router = express.Router();

  function getPrinter(printerId) {
    const printer = config.printers[printerId];
    if (!printer) {
      const error = new Error(`unknown printer ${printerId}`);
      error.status = 404;
      throw error;
    }
    return printer;
  }

  function normalizeFileName(fileName) {
    return String(fileName || "").split("/").pop();
  }

  function requirePort8898Credentials(printer, printerId) {
    if (!printer.serialNumber) {
      const error = new Error(`printer ${printerId} is missing serialNumber in config.json`);
      error.status = 400;
      throw error;
    }
    if (!printer.checkCode) {
      const error = new Error(`printer ${printerId} is missing checkCode in config.json`);
      error.status = 400;
      throw error;
    }
  }

  function requireAccess(accessType) {
    return (req, _res, next) => {
      if (authManager?.isLoginRequired()) {
        if (!authManager.isAuthenticated(req)) {
          next(Object.assign(new Error("login required"), { status: 401, code: "AUTH_REQUIRED" }));
          return;
        }
      }
      const auth = config.auth || {};
      const needsPassword = accessType === "write" ? auth.passwordForWrite : auth.passwordForRead;
      if (!needsPassword) {
        next();
        return;
      }
      if (req.header("x-secret") === auth.password) {
        next();
        return;
      }
      next(Object.assign(new Error("password required"), { status: 401, code: "PASSWORD_REQUIRED" }));
    };
  }

  router.get("/", async (_req, res, next) => {
    try {
      const printers = await Promise.all(Object.entries(config.printers).map(([id, printer]) => getPrinterSummary(id, printer)));
      res.json(printers);
    } catch (error) {
      next(error);
    }
  });

  router.get("/names", (_req, res) => {
    res.json(Object.keys(config.printers));
  });

  router.get("/configured", requireAccess("read"), (_req, res) => {
    const printers = Object.entries(config.printers || {}).map(([id, printer]) => ({
      id,
      ip: printer.ip || "",
      serialNumber: printer.serialNumber || "",
      checkCode: printer.checkCode || "",
    }));
    res.json(printers);
  });

  router.post("/configured", requireAccess("write"), (req, res, next) => {
    try {
      const body = req.body || {};
      const id = String(body.id || "").trim();
      const ip = String(body.ip || "").trim();
      const serialNumber = String(body.serialNumber || "").trim();
      const checkCode = String(body.checkCode || "").trim();

      if (!id || !ip || !serialNumber || !checkCode) {
        throw Object.assign(new Error("id, ip, serialNumber, and checkCode are required"), {
          status: 400,
          code: "VALIDATION_ERROR",
        });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        throw Object.assign(new Error("printer id must use letters, numbers, dash, or underscore"), {
          status: 400,
          code: "VALIDATION_ERROR",
        });
      }

      config.printers[id] = { ip, serialNumber, checkCode };
      saveConfig(config);
      res.json({ success: true, id });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/configured/:printerId", requireAccess("write"), (req, res, next) => {
    try {
      const printerId = req.params.printerId;
      if (!config.printers[printerId]) {
        throw Object.assign(new Error(`unknown printer ${printerId}`), { status: 404, code: "NOT_FOUND" });
      }
      delete config.printers[printerId];
      saveConfig(config);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/info", requireAccess("read"), async (req, res, next) => {
    try {
      res.json(await runPrinterRequest(getPrinter(req.params.printerId), { type: "info" }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/status", requireAccess("read"), async (req, res, next) => {
    try {
      res.json(await runPrinterRequest(getPrinter(req.params.printerId), { type: "status" }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/temperatures", requireAccess("read"), async (req, res, next) => {
    try {
      res.json(await runPrinterRequest(getPrinter(req.params.printerId), { type: "temperatures" }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/progress", requireAccess("read"), async (req, res, next) => {
    try {
      res.json(await runPrinterRequest(getPrinter(req.params.printerId), { type: "progress" }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/head-position", requireAccess("read"), async (req, res, next) => {
    try {
      res.json(await runPrinterRequest(getPrinter(req.params.printerId), { type: "headPosition" }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/files", requireAccess("read"), async (req, res, next) => {
    try {
      res.json(await getPrinterFiles(getPrinter(req.params.printerId)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/files-debug", requireAccess("read"), async (req, res, next) => {
    try {
      res.json(await getPrinterFilesDebug(getPrinter(req.params.printerId)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/detail", requireAccess("read"), async (req, res, next) => {
    try {
      const printer = getPrinter(req.params.printerId);
      requirePort8898Credentials(printer, req.params.printerId);
      res.json(await getPrinterDetail(printer));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/file-thumbnail", requireAccess("read"), async (req, res, next) => {
    try {
      const printer = getPrinter(req.params.printerId);
      requirePort8898Credentials(printer, req.params.printerId);
      const fileName = normalizeFileName(req.query.file_name);
      const thumbnail = await getPrinterFileThumbnail(printer, fileName);
      res.type(thumbnail.contentType).send(thumbnail.bytes);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:printerId/start-file", requireAccess("write"), async (req, res, next) => {
    try {
      const printer = getPrinter(req.params.printerId);
      requirePort8898Credentials(printer, req.params.printerId);
      res.json(await startPrinterFile(printer, normalizeFileName(req.query.file_name)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:printerId/upload-file", requireAccess("write"), upload.single("file"), async (req, res, next) => {
    try {
      const printer = getPrinter(req.params.printerId);
      requirePort8898Credentials(printer, req.params.printerId);
      if (!req.file) {
        throw Object.assign(new Error("file is required"), { status: 400, code: "UPLOAD_ERROR" });
      }
      const sourceName = req.body.file_name || req.file.originalname || "upload.gcode";
      const fileName = normalizeFileName(sourceName);
      const printNow = String(req.body.print_now).toLowerCase() === "true";
      res.json(await uploadPrinterFile(printer, req.file, { fileName, printNow }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:printerId/delete-file", requireAccess("write"), async (req, res, next) => {
    try {
      const printer = getPrinter(req.params.printerId);
      requirePort8898Credentials(printer, req.params.printerId);
      res.json(await deletePrinterFile(printer, normalizeFileName(req.query.file_name)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:printerId/set-temperature/:tempIndex/:temperature", requireAccess("write"), async (req, res, next) => {
    try {
      res.json(await runPrinterRequest(getPrinter(req.params.printerId), {
        type: "setTemperature",
        index: Number(req.params.tempIndex),
        temperature: Number(req.params.temperature),
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:printerId/nozzle-temperature/:temperature", requireAccess("write"), async (req, res, next) => {
    try {
      res.json(await runPrinterRequest(getPrinter(req.params.printerId), {
        type: "setTemperature",
        index: 0,
        temperature: Number(req.params.temperature),
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:printerId/bed-temperature/:temperature", requireAccess("write"), async (req, res, next) => {
    try {
      res.json(await runPrinterRequest(getPrinter(req.params.printerId), {
        type: "setTemperature",
        index: 1,
        temperature: Number(req.params.temperature),
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:printerId/pause", requireAccess("write"), async (req, res, next) => {
    try {
      res.json(await runPrinterRequest(getPrinter(req.params.printerId), { type: "pause" }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:printerId/resume", requireAccess("write"), async (req, res, next) => {
    try {
      res.json(await runPrinterRequest(getPrinter(req.params.printerId), { type: "resume" }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/snapshot", async (req, res, next) => {
    try {
      const bytes = await getCameraSnapshot(getPrinter(req.params.printerId));
      res.type("image/jpeg").send(bytes);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:printerId/camera", async (req, res, next) => {
    try {
      await proxyCameraStream(getPrinter(req.params.printerId), res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
