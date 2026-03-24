import net from "node:net";
import { Readable } from "node:stream";
import { parseFilesResponse, parseKvResponse, parseProgressResponse } from "./lib/parse.js";

const PRINTER_API_PORT = 8899;
const PRINTER_HTTP_PORT = 8898;
const PRINTER_CAMERA_PORT = 8080;
const PRINTER_CAMERA_STREAM_PATH = "/?action=stream";
const DEFAULT_TIMEOUT_MS = 10000;
const SOCKET_IDLE_TIMEOUT_MS = 150;

function normalizeUploadFileName(fileName) {
  return String(fileName || "")
    .split("/")
    .pop()
    .replace(/[^\w\s\-().+%,@[\]{}:;!#$^&*=<>?]/g, "_")
    .trim();
}

function isTcpResponseSuccessful(command, responseText) {
  const normalized = String(responseText || "").toLowerCase();
  if (!normalized) {
    return false;
  }

  if (command.startsWith("~M28") || command.startsWith("~M29")) {
    return !/error:|control failed\.|file is not available|cannot create file|not enough space/.test(normalized);
  }

  if (command.startsWith("~M601")) {
    return normalized.includes("control success") || normalized.includes("have been connected");
  }

  if (command.startsWith("~M23")) {
    return normalized.includes("ok") || normalized.includes("success");
  }

  return normalized.includes("ok");
}

function openPrinterSocket(host) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: PRINTER_API_PORT });
    const onError = (error) => {
      socket.destroy();
      reject(error);
    };

    socket.once("error", onError);
    socket.once("connect", () => {
      socket.off("error", onError);
      socket.setNoDelay(true);
      resolve(socket);
    });
  });
}

function waitForSocketResponse(socket, { idleMs = SOCKET_IDLE_TIMEOUT_MS, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let firstChunkSeen = false;
    let idleTimer = null;
    let hardTimer = null;

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      if (idleTimer) clearTimeout(idleTimer);
      if (hardTimer) clearTimeout(hardTimer);
    };

    const finish = () => {
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };

    const onData = (chunk) => {
      firstChunkSeen = true;
      chunks.push(chunk);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, idleMs);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      if (firstChunkSeen) {
        resolve(Buffer.concat(chunks).toString("utf8"));
        return;
      }
      reject(new Error("printer closed the TCP connection unexpectedly"));
    };

    hardTimer = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for printer TCP response"));
    }, timeoutMs);

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function sendTcpCommand(socket, command, options) {
  socket.write(command);
  if (!socket.writableNeedDrain) {
    return waitForSocketResponse(socket, options);
  }

  await new Promise((resolve, reject) => {
    socket.once("drain", resolve);
    socket.once("error", reject);
  });
  return waitForSocketResponse(socket, options);
}

async function uploadPrinterFileTcp(printer, file, { fileName, printNow }) {
  const normalizedFileName = normalizeUploadFileName(fileName);
  if (!normalizedFileName) {
    throw new Error("invalid upload file name");
  }

  const socket = await openPrinterSocket(printer.ip);

  try {
    // Some Adventurer 5M firmware returns "Control failed." for M601 while still allowing M28/M29 uploads.
    // Treat login as best-effort instead of a hard requirement.
    try {
      await sendTcpCommand(socket, "~M601 S1\r\n");
    } catch {
      // Ignore login handshake errors and continue with raw upload commands.
    }

    const startUploadCommand = `~M28 ${file.buffer.length} 0:/user/${normalizedFileName}\r\n`;
    const prepResponse = await sendTcpCommand(socket, startUploadCommand, { timeoutMs: 10000 });
    if (!isTcpResponseSuccessful(startUploadCommand, prepResponse)) {
      throw new Error(prepResponse.trim() || "printer rejected TCP upload initialization");
    }

    socket.write(file.buffer);
    if (socket.writableNeedDrain) {
      await new Promise((resolve, reject) => {
        socket.once("drain", resolve);
        socket.once("error", reject);
      });
    }

    const finishResponse = await sendTcpCommand(socket, "~M29\r\n", { timeoutMs: 10000 });
    if (!isTcpResponseSuccessful("~M29", finishResponse)) {
      throw new Error(finishResponse.trim() || "printer rejected TCP upload finalization");
    }

    if (printNow) {
      const startPrintCommand = `~M23 0:/user/${normalizedFileName}\r\n`;
      const printResponse = await sendTcpCommand(socket, startPrintCommand, { timeoutMs: 10000 });
      if (!isTcpResponseSuccessful(startPrintCommand, printResponse)) {
        throw new Error(printResponse.trim() || "printer rejected TCP start print command");
      }
    }

    socket.write("~M602\r\n");
    return { success: true, method: "tcp" };
  } finally {
    socket.destroy();
  }
}

function instructionFor(request) {
  switch (request.type) {
    case "control": return "~M601 S1\r\n";
    case "info": return "~M115\r\n";
    case "status": return "~M119\r\n";
    case "temperatures": return "~M105\r\n";
    case "progress": return "~M27\r\n";
    case "headPosition": return "~M114\r\n";
    case "files": return "~M661\r\n";
    case "pause": return "~M25\r\n";
    case "resume": return "~M24\r\n";
    case "setTemperature":
      // Bed setpoint is more reliable on Flashforge firmware via M140 than M104 T1.
      if (Number(request.index) === 1) return `~M140 S${request.temperature}\r\n`;
      return `~M104 S${request.temperature} T${request.index}\r\n`;
    default: throw new Error(`unknown request type: ${request.type}`);
  }
}

function parseResponse(request, responseText) {
  if (["control", "pause", "resume", "setTemperature"].includes(request.type)) {
    return { success: true };
  }

  if (request.type === "files") {
    return parseFilesResponse(responseText);
  }

  if (request.type === "progress") {
    return parseProgressResponse(responseText);
  }

  const kv = parseKvResponse(responseText);

  switch (request.type) {
    case "info":
      return {
        name: kv["Machine Name"],
        firmware_version: kv.Firmware,
        sn: kv.SN,
        tool_count: Number(kv["Tool Count"] || 0),
        model_name: kv["Machine Type"],
        mac_addr: kv["Mac Address"],
        position: {
          x: Number(kv.X || 0),
          y: Number(kv.Y || 0),
          z: Number(kv.Z || 0),
        },
      };
    case "status":
      return {
        end_stop: {
          x_max: Number(kv["X-max"] || 0),
          y_max: Number(kv["Y-max"] || 0),
          z_min: Number(kv["Z-min"] || 0),
        },
        machine_status: kv.MachineStatus,
        move_mode: kv.MoveMode,
        led: kv.LED === "1",
        current_file: kv.CurrentFile || null,
      };
    case "temperatures":
      return Object.fromEntries(Object.entries(kv).map(([key, value]) => {
        const [current, target] = String(value).split("/").map(Number);
        return [key, { current, target }];
      }));
    case "headPosition":
      return {
        x: Number(kv.X || 0),
        y: Number(kv.Y || 0),
        z: Number(kv.Z || 0),
        a: Number(kv.A || 0),
        b: Number(kv.B || 0),
      };
    default:
      throw new Error(`unhandled parse type: ${request.type}`);
  }
}

function readSocket(host, instructions) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: PRINTER_API_PORT });
    const responses = [];
    let currentInstruction = 0;
    let chunks = [];
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback(value);
    };

    socket.on("connect", () => {
      socket.setTimeout(5000);
      socket.write(instructions[currentInstruction]);
    });

    socket.on("data", (chunk) => {
      chunks.push(chunk);
      socket.setTimeout(150);
    });

    socket.on("timeout", () => {
      responses.push(Buffer.concat(chunks).toString("utf8"));
      chunks = [];
      currentInstruction += 1;
      if (currentInstruction < instructions.length) {
        socket.setTimeout(5000);
        socket.write(instructions[currentInstruction]);
        return;
      }
      finish(resolve, responses.at(-1) || "");
    });

    socket.on("error", (error) => finish(reject, error));
  });
}

function normalizeSerialNumber(serialNumber) {
  return String(serialNumber).startsWith("SN") ? String(serialNumber) : `SN${serialNumber}`;
}

function normalizeListedFileName(fileName) {
  return String(fileName || "").split("/").pop();
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

async function callPrinterJson(printer, path, payload, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const timer = withTimeout(timeoutMs);
  try {
    const response = await fetch(`http://${printer.ip}:${PRINTER_HTTP_PORT}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: timer.signal,
    });
    const responseText = await response.text();
    let body;
    try {
      body = JSON.parse(responseText);
    } catch (error) {
      throw new Error(`invalid JSON from printer: ${error.message}`);
    }
    if (body?.code !== 0) {
      throw new Error(body?.message || "unknown printer error");
    }
    return body;
  } finally {
    timer.clear();
  }
}

export async function runPrinterRequest(printer, request) {
  const instructions = [instructionFor({ type: "control" })];
  if (request.type !== "control") {
    instructions.push(instructionFor(request));
  }

  const responseText = await readSocket(printer.ip, instructions);
  return parseResponse(request, responseText);
}

export async function getPrinterSummary(printerId, printer) {
  try {
    const status = await runPrinterRequest(printer, { type: "status" });
    return {
      name: printerId,
      is_online: true,
      current_file: status.current_file,
      firmware_version: null,
    };
  } catch {
    return {
      name: printerId,
      is_online: false,
      current_file: null,
      firmware_version: null,
    };
  }
}

export async function getPrinterFiles(printer) {
  const [status, files] = await Promise.all([
    runPrinterRequest(printer, { type: "status" }),
    runPrinterRequest(printer, { type: "files" }),
  ]);

  const currentFile = status.current_file;
  const normalizedCurrent = currentFile ? currentFile.split("/").pop() : null;
  let foundActive = false;

  for (const file of files) {
    const normalizedFile = file.name.split("/").pop();
    file.is_active = Boolean(currentFile && (file.name === currentFile || normalizedFile === normalizedCurrent));
    delete file.isActive;
    if (file.is_active) {
      foundActive = true;
    }
  }

  if (currentFile && !foundActive) {
    files.unshift({ name: currentFile, is_active: true });
  }

  return files;
}

export async function getPrinterFilesDebug(printer) {
  const responseText = await readSocket(printer.ip, [instructionFor({ type: "control" }), instructionFor({ type: "files" })]);
  const payload = Buffer.from(responseText, "utf8");
  const utf8Lossy = payload.toString("utf8");
  const extractedPaths = [...new Set((utf8Lossy.match(/\/data\/[A-Za-z0-9_\-./ ()]+\.[A-Za-z0-9]+/g) || []))];
  return {
    byte_count: payload.length,
    base64: payload.toString("base64"),
    utf8_lossy: utf8Lossy,
    extracted_paths: extractedPaths,
  };
}

export async function getPrinterDetail(printer) {
  return callPrinterJson(printer, "/detail", {
    serialNumber: normalizeSerialNumber(printer.serialNumber),
    checkCode: printer.checkCode,
  }, { timeoutMs: 5000 });
}

export async function startPrinterFile(printer, fileName) {
  await callPrinterJson(printer, "/control", {
    serialNumber: normalizeSerialNumber(printer.serialNumber),
    checkCode: printer.checkCode,
    action: "start",
    fileName,
  });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const status = await runPrinterRequest(printer, { type: "status" });
  const active = normalizeListedFileName(status.current_file);
  const requested = normalizeListedFileName(fileName);
  if (active !== requested) {
    const suffix = active ? ` Printer is currently on: ${active}.` : "";
    throw new Error(`Printer did not start ${requested}.${suffix}`);
  }
  return { success: true };
}

async function tryTcpDelete(printer, fileName) {
  const normalized = normalizeUploadFileName(fileName);
  if (!normalized) {
    return;
  }

  const socket = await openPrinterSocket(printer.ip);
  try {
    try {
      await sendTcpCommand(socket, "~M601 S1\r\n");
    } catch {
      // Ignore login failures; many firmwares still accept file commands directly.
    }

    const commands = [
      `~M30 0:/user/${normalized}\r\n`,
      `~M30 /data/${normalized}\r\n`,
      `~M30 ${normalized}\r\n`,
    ];
    for (const command of commands) {
      try {
        await sendTcpCommand(socket, command, { timeoutMs: 8000 });
      } catch {
        // Try the next delete variant.
      }
    }
    socket.write("~M602\r\n");
  } finally {
    socket.destroy();
  }
}

export async function deletePrinterFile(printer, fileName) {
  const target = normalizeListedFileName(fileName);

  await callPrinterJson(printer, "/control", {
    serialNumber: normalizeSerialNumber(printer.serialNumber),
    checkCode: printer.checkCode,
    action: "del",
    fileName: target,
  });

  await new Promise((resolve) => setTimeout(resolve, 700));
  let files = await getPrinterFiles(printer);
  let stillExists = files.some((file) => normalizeListedFileName(file.name) === target);
  if (!stillExists) {
    return { success: true };
  }

  await tryTcpDelete(printer, target);
  await new Promise((resolve) => setTimeout(resolve, 700));
  files = await getPrinterFiles(printer);
  stillExists = files.some((file) => normalizeListedFileName(file.name) === target);
  if (stillExists) {
    throw new Error(`Printer acknowledged delete but kept file: ${target}`);
  }

  return { success: true };
}

export async function getPrinterFileThumbnail(printer, fileName) {
  const body = await callPrinterJson(printer, "/gcodeThumb", {
    serialNumber: normalizeSerialNumber(printer.serialNumber),
    checkCode: printer.checkCode,
    fileName,
  });

  if (!body.imageData) {
    const error = new Error(`printer did not return a thumbnail for ${fileName}`);
    error.status = 404;
    throw error;
  }

  const bytes = Buffer.from(body.imageData, "base64");
  let contentType = "application/octet-stream";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    contentType = "image/png";
  } else if (bytes.subarray(0, 2).equals(Buffer.from([0x42, 0x4d]))) {
    contentType = "image/bmp";
  }

  return { bytes, contentType };
}

export async function uploadPrinterFile(printer, file, { fileName, printNow }) {
  try {
    return await uploadPrinterFileTcp(printer, file, { fileName, printNow });
  } catch (tcpError) {
    const form = new FormData();
    form.append("serialNumber", normalizeSerialNumber(printer.serialNumber));
    form.append("checkCode", printer.checkCode);
    form.append("fileSize", String(file.buffer.length));
    form.append("printNow", String(Boolean(printNow)));
    form.append("levelingBeforePrint", "false");
    form.append("flowCalibration", "false");
    form.append("firstLayerInspection", "false");
    form.append("timeLapseVideo", "false");
    form.append("useMatlStation", "false");
    form.append("gcodeToolCnt", "0");
    form.append("materialMappings", "W10=");
    form.append("gcodeFile", new Blob([file.buffer], { type: "application/octet-stream" }), fileName);

    const timer = withTimeout(120000);
    try {
      const response = await fetch(`http://${printer.ip}:${PRINTER_HTTP_PORT}/uploadGcode`, {
        method: "POST",
        body: form,
        signal: timer.signal,
      });
      const body = await response.json();
      if (body?.code !== 0) {
        const error = new Error(body?.message || "unknown printer error");
        error.cause = tcpError;
        throw error;
      }
      return { success: true, method: "http-fallback" };
    } finally {
      timer.clear();
    }
  }
}

export async function openCameraStream(printer) {
  const timer = withTimeout(DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`http://${printer.ip}:${PRINTER_CAMERA_PORT}${PRINTER_CAMERA_STREAM_PATH}`, {
      signal: timer.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`camera stream request failed with ${response.status}`);
    }
    return response;
  } finally {
    timer.clear();
  }
}

function extractBoundary(contentType) {
  const match = /boundary=([^;]+)/i.exec(contentType || "");
  return match?.[1] || "boundarydonotcross";
}

export async function getCameraSnapshot(printer) {
  const response = await openCameraStream(printer);
  const reader = response.body.getReader();
  const chunks = [];
  let totalLength = 0;
  const boundary = Buffer.from(`--${extractBoundary(response.headers.get("content-type"))}`);

  while (totalLength < 2_000_000) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    totalLength += chunk.length;
    const merged = Buffer.concat(chunks, totalLength);
    const firstBoundary = merged.indexOf(boundary);
    if (firstBoundary === -1) {
      continue;
    }
    const headerEnd = merged.indexOf(Buffer.from("\r\n\r\n"), firstBoundary);
    if (headerEnd === -1) {
      continue;
    }
    const secondBoundary = merged.indexOf(boundary, headerEnd + 4);
    if (secondBoundary === -1) {
      continue;
    }
    reader.cancel().catch(() => {});
    return merged.subarray(headerEnd + 4, secondBoundary - 2);
  }

  reader.cancel().catch(() => {});
  throw new Error("unable to extract snapshot from camera stream");
}

export async function proxyCameraStream(printer, res) {
  const response = await openCameraStream(printer);
  res.status(response.status);
  res.setHeader("content-type", response.headers.get("content-type") || "multipart/x-mixed-replace; boundary=boundarydonotcross");
  res.setHeader("cache-control", "no-store, no-cache, must-revalidate");
  res.setHeader("pragma", "no-cache");
  Readable.fromWeb(response.body).pipe(res);
}
