"use strict";

const auth = require("../lib/auth.js");
const store = require("../lib/store.js");

/**
 * GET /api/log?limit=50
 * Trả lịch sử phím đã gắn keycap (mới nhất trước).
 * Chỉ phiên đăng nhập hợp lệ mới xem được.
 */
module.exports = async function handler(req, res) {
  auth.noStore(res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { cfg, error } = auth.readConfig();
  if (error) {
    console.error("[log]", error.message);
    return res.status(500).json({ error: "Máy chủ chưa được cấu hình." });
  }

  const token = auth.readCookie(req, auth.COOKIE_NAME);
  if (!token || !auth.verifyToken(token, cfg.sessionSecret)) {
    return res.status(401).json({ error: "Chưa đăng nhập." });
  }

  let limit = 50;
  try {
    const u = new URL(req.url, "http://x");
    limit = u.searchParams.get("limit") || 50;
  } catch (_) { /* giữ mặc định */ }

  try {
    const log = await store.getLog(limit);
    return res.status(200).json({
      count: log.length,
      persistent: store.hasRedis(),   // false => đang chạy file tạm, dữ liệu KHÔNG bền
      log: log
    });
  } catch (e) {
    console.error("[log] đọc thất bại:", e.message);
    return res.status(502).json({ error: "Không đọc được dữ liệu." });
  }
};
