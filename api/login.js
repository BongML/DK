"use strict";

const auth = require("../lib/auth.js");

module.exports = function handler(req, res) {
  auth.noStore(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { cfg, error } = auth.readConfig();
  if (error) {
    console.error("[login]", error.message);
    return res.status(500).json({ error: "Máy chủ chưa được cấu hình." });
  }

  const limit = auth.checkRateLimit(req);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({
      error: "Bạn đã thử sai quá nhiều lần. Thử lại sau " +
             Math.ceil(limit.retryAfter / 60) + " phút."
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== "object") body = {};

  const user = String(body.user || "").trim().toUpperCase().slice(0, 32);
  const pass = String(body.pass || "").trim().slice(0, 64);

  // luôn kiểm tra cả hai vế -> thời gian phản hồi không tiết lộ vế nào sai
  const okUser = auth.safeEqual(user, String(cfg.user).toUpperCase());
  const okPass = auth.safeEqual(pass, String(cfg.pass));

  if (!(okUser && okPass)) {
    auth.recordFailure(req);
    return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu." });
  }

  auth.clearFailures(req);
  const token = auth.createToken(cfg.sessionSecret);
  res.setHeader("Set-Cookie", auth.sessionCookie(req, token, auth.SESSION_TTL_SECONDS));
  return res.status(200).json({ message: cfg.message });
};
