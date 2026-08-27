"use strict";

const auth = require("../lib/auth.js");
const store = require("../lib/store.js");

module.exports = async function handler(req, res) {
  auth.noStore(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Xoá phím đã ghi nhớ để lần đăng nhập sau đi lại luồng từ đầu.
  // Chỉ phiên hợp lệ mới được xoá — tránh người lạ gọi thẳng endpoint này.
  const { cfg } = auth.readConfig();
  if (cfg) {
    const token = auth.readCookie(req, auth.COOKIE_NAME);
    if (token && auth.verifyToken(token, cfg.sessionSecret)) {
      try { await store.clearKeycap(); }
      catch (e) { console.error("[logout] không xoá được keycap:", e.message); }
    }
  }

  // cookie luôn được xoá, kể cả khi phiên đã hỏng
  res.setHeader("Set-Cookie", auth.sessionCookie(req, "", 0));
  return res.status(200).json({ ok: true });
};
