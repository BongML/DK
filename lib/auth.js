"use strict";

const crypto = require("crypto");

const COOKIE_NAME = "sid";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 giờ

/* ------------------------------------------------------------------ *
 * Cấu hình (đọc từ biến môi trường — không bao giờ nằm trong mã nguồn)
 * ------------------------------------------------------------------ */
function readConfig() {
  const cfg = {
    user: process.env.AUTH_USER,
    pass: process.env.AUTH_PASS,
    message: process.env.SECRET_MESSAGE,
    sessionSecret: process.env.SESSION_SECRET
  };
  const missing = Object.keys(cfg).filter((k) => !cfg[k]);
  if (missing.length) {
    const err = new Error("Thiếu biến môi trường: " + missing.join(", "));
    err.code = "CONFIG";
    return { error: err };
  }
  return { cfg };
}

/* ------------------------------------------------------------------ *
 * So sánh chuỗi chống timing attack
 * ------------------------------------------------------------------ */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  // hash trước để hai buffer luôn cùng độ dài (timingSafeEqual yêu cầu vậy)
  const hashA = crypto.createHash("sha256").update(bufA).digest();
  const hashB = crypto.createHash("sha256").update(bufB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/* ------------------------------------------------------------------ *
 * Token phiên: base64url(payload).HMAC-SHA256(payload)
 * ------------------------------------------------------------------ */
function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload, secret) {
  return b64url(crypto.createHmac("sha256", secret).update(payload).digest());
}

function createToken(secret) {
  const payload = b64url(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    jti: crypto.randomBytes(8).toString("hex")
  }));
  return payload + "." + sign(payload, secret);
}

function verifyToken(token, secret) {
  if (typeof token !== "string" || token.indexOf(".") < 0) return false;
  const idx = token.lastIndexOf(".");
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!safeEqual(sig, sign(payload, secret))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return typeof data.exp === "number" && data.exp > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Cookie
 * ------------------------------------------------------------------ */
function isSecureRequest(req) {
  const proto = req.headers["x-forwarded-proto"];
  return proto ? String(proto).split(",")[0].trim() === "https"
               : process.env.NODE_ENV === "production";
}

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(";");
  for (let i = 0; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq < 0) continue;
    if (parts[i].slice(0, eq).trim() === name) {
      return decodeURIComponent(parts[i].slice(eq + 1).trim());
    }
  }
  return null;
}

function sessionCookie(req, value, maxAge) {
  const bits = [
    COOKIE_NAME + "=" + encodeURIComponent(value),
    "Path=/",
    "HttpOnly",                    // JS trên trang không đọc được
    "SameSite=Strict",             // chặn CSRF từ site khác
    "Max-Age=" + maxAge
  ];
  if (isSecureRequest(req)) bits.push("Secure");
  return bits.join("; ");
}

/* ------------------------------------------------------------------ *
 * Giới hạn số lần thử (best-effort, theo từng instance serverless)
 * ------------------------------------------------------------------ */
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;  // 10 phút
const attempts = new Map();

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function checkRateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = attempts.get(ip);

  if (rec && now - rec.first > WINDOW_MS) {
    attempts.delete(ip);
    return { allowed: true };
  }
  if (rec && rec.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((rec.first + WINDOW_MS - now) / 1000) };
  }
  return { allowed: true };
}

function recordFailure(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) attempts.set(ip, { first: now, count: 1 });
  else rec.count += 1;

  // dọn rác để Map không phình mãi
  if (attempts.size > 5000) {
    for (const [key, val] of attempts) {
      if (now - val.first > WINDOW_MS) attempts.delete(key);
    }
  }
}

function clearFailures(req) {
  attempts.delete(clientIp(req));
}

/* ------------------------------------------------------------------ */
function noStore(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  readConfig,
  safeEqual,
  createToken,
  verifyToken,
  readCookie,
  sessionCookie,
  checkRateLimit,
  recordFailure,
  clearFailures,
  noStore
};
