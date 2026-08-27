"use strict";

const auth = require("../lib/auth.js");
const store = require("../lib/store.js");

module.exports = async function handler(req, res) {
  auth.noStore(res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { cfg, error } = auth.readConfig();
  if (error) {
    console.error("[content]", error.message);
    return res.status(500).json({ error: "Máy chủ chưa được cấu hình." });
  }

  const token = auth.readCookie(req, auth.COOKIE_NAME);
  if (!token || !auth.verifyToken(token, cfg.sessionSecret)) {
    return res.status(401).json({ error: "Chưa đăng nhập." });
  }

  let keycap = null;
  try { keycap = await store.getLastKeycap(); } catch (_) { /* không chặn luồng */ }

  return res.status(200).json({ message: cfg.message, keycap: keycap });
};
