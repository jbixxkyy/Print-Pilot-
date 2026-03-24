import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export class AuthManager {
  constructor({ projectRoot, config }) {
    this.config = config;
    this.storeDir = path.join(projectRoot, "data");
    this.storePath = path.join(this.storeDir, "auth-sessions.json");
    this.sessions = new Map();
    this.load();
  }

  isLoginRequired() {
    return this.config?.auth?.loginRequired !== false;
  }

  load() {
    try {
      if (!fs.existsSync(this.storePath)) {
        return;
      }
      const raw = fs.readFileSync(this.storePath, "utf8");
      const parsed = JSON.parse(raw);
      for (const [token, session] of Object.entries(parsed.sessions || {})) {
        this.sessions.set(token, session);
      }
    } catch {
      this.sessions.clear();
    }
  }

  persist() {
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
    const sessions = Object.fromEntries(this.sessions.entries());
    fs.writeFileSync(this.storePath, `${JSON.stringify({ sessions }, null, 2)}\n`);
  }

  extractToken(req) {
    const queryToken = req?.query?.session_token;
    if (queryToken) {
      return String(queryToken);
    }
    const headerToken = req.header("x-session-token");
    if (headerToken) {
      return headerToken;
    }
    const auth = req.header("authorization");
    if (auth && auth.startsWith("Bearer ")) {
      return auth.slice("Bearer ".length).trim();
    }
    return null;
  }

  getSession(req) {
    const token = this.extractToken(req);
    if (!token) {
      return null;
    }
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }
    session.lastSeenAt = new Date().toISOString();
    this.sessions.set(token, session);
    this.persist();
    return { token, ...session };
  }

  isAuthenticated(req) {
    return Boolean(this.getSession(req));
  }

  requireSession(req, _res, next) {
    if (!this.isLoginRequired()) {
      next();
      return;
    }
    if (this.isAuthenticated(req)) {
      next();
      return;
    }
    next(Object.assign(new Error("login required"), { status: 401, code: "AUTH_REQUIRED" }));
  }

  login({ password, deviceId, deviceName }) {
    const expectedPassword = String(this.config?.auth?.password || "");
    if (!expectedPassword) {
      throw Object.assign(new Error("set auth.password in config.json before using login"), {
        status: 400,
        code: "AUTH_NOT_CONFIGURED",
      });
    }
    if (String(password || "") !== expectedPassword) {
      throw Object.assign(new Error("invalid credentials"), { status: 401, code: "INVALID_CREDENTIALS" });
    }

    const normalizedDeviceId = String(deviceId || "").trim() || crypto.randomUUID();
    for (const [token, session] of this.sessions.entries()) {
      if (session.deviceId === normalizedDeviceId) {
        this.sessions.delete(token);
      }
    }

    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date().toISOString();
    this.sessions.set(token, {
      deviceId: normalizedDeviceId,
      deviceName: String(deviceName || "Unknown device"),
      createdAt: now,
      lastSeenAt: now,
    });
    this.persist();
    return { token, deviceId: normalizedDeviceId };
  }

  logout(req) {
    const token = this.extractToken(req);
    if (!token) {
      return { success: true };
    }
    this.sessions.delete(token);
    this.persist();
    return { success: true };
  }
}
