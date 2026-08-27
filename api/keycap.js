"use strict";

const auth = require("../lib/auth.js");
const store = require("../lib/store.js");

module.exports = async function handler(req, res) {
  auth.noStore(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { cfg, error } = auth.readConfig();
  if (error) {
    console.error("[keycap]", error.message);
    return res.status(500).json({ error: "Máy chủ chưa được cấu hình." });
  }

  // chỉ người đã đăng nhập mới ghi được dữ liệu
  const token = auth.readCookie(req, auth.COOKIE_NAME);
  if (!token || !auth.verifyToken(token, cfg.sessionSecret)) {
    return res.status(401).json({ error: "Chưa đăng nhập." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== "object") body = {};

  const key = String(body.key || "").trim().toUpperCase();
  if (!/^[A-Z0-9]$/.test(key)) {
    return res.status(400).json({ error: "Phím không hợp lệ — chỉ một chữ cái hoặc chữ số." });
  }

  const record = {
    key: key,
    at: new Date().toISOString(),
    ua: String(req.headers["user-agent"] || "").slice(0, 200)
  };

  try {
    const out = await store.saveKeycap(record);
    return res.status(200).json({ ok: true, key: key, stored: out.backend });
  } catch (e) {
    console.error("[keycap] lưu thất bại:", e.message);
    return res.status(502).json({ error: "Không lưu được dữ liệu. Thử lại nhé." });
  }
};
