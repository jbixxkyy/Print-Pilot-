import express from "express";

export function createAuthRouter(authManager) {
  const router = express.Router();

  router.post("/login", (req, res, next) => {
    try {
      const { password, deviceId, deviceName } = req.body || {};
      const session = authManager.login({ password, deviceId, deviceName });
      res.json({ success: true, ...session });
    } catch (error) {
      next(error);
    }
  });

  router.get("/status", (req, res) => {
    const session = authManager.getSession(req);
    res.json({
      authenticated: Boolean(session),
      deviceId: session?.deviceId || null,
      deviceName: session?.deviceName || null,
      loginRequired: authManager.isLoginRequired(),
    });
  });

  router.post("/logout", (req, res) => {
    res.json(authManager.logout(req));
  });

  return router;
}

