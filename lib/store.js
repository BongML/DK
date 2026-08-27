"use strict";

/**
 * Nơi lưu phím đã gắn keycap.
 *
 * - Có KV_REST_API_URL + KV_REST_API_TOKEN  -> ghi vào Redis (Vercel KV / Upstash).
 * - Không có                                -> ghi ra file tạm + console (đủ để chạy thử,
 *                                              KHÔNG bền trên Vercel vì mỗi lần chạy là
 *                                              một máy khác).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const KEY_LAST = "keycap:last";
const KEY_LOG = "keycap:log";
const LOG_LIMIT = 200;

const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

function hasRedis() {
  return Boolean(URL && TOKEN);
}

async function redis(command) {
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!r.ok) throw new Error("KV " + r.status + " " + (await r.text()).slice(0, 200));
  const data = await r.json();
  if (data && data.error) throw new Error("KV " + data.error);
  return data ? data.result : null;
}

/* ------------------------------------------------------------------ *
 * Fallback: file tạm
 * ------------------------------------------------------------------ */
const FILE = path.join(os.tmpdir(), "keycaps.json");

function readFile() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch (_) { return { last: null, log: [] }; }
}

function writeFile(data) {
  try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8"); }
  catch (e) { console.error("[store] không ghi được file tạm:", e.message); }
}

/* ------------------------------------------------------------------ */
async function saveKeycap(record) {
  if (hasRedis()) {
    await redis(["SET", KEY_LAST, record.key]);
    await redis(["LPUSH", KEY_LOG, JSON.stringify(record)]);
    await redis(["LTRIM", KEY_LOG, "0", String(LOG_LIMIT - 1)]);
    return { backend: "kv" };
  }

  console.log("[keycap]", JSON.stringify(record));
  const data = readFile();
  data.last = record.key;
  data.log.unshift(record);
  data.log = data.log.slice(0, LOG_LIMIT);
  writeFile(data);
  return { backend: "file" };
}

/**
 * Xoá phím đang ghi nhớ (gọi khi đăng xuất) để lần đăng nhập sau
 * phải đi lại luồng từ đầu. Lịch sử `keycap:log` vẫn giữ nguyên.
 */
async function clearKeycap() {
  if (hasRedis()) {
    await redis(["DEL", KEY_LAST]);
    return { backend: "kv" };
  }
  const data = readFile();
  data.last = null;
  writeFile(data);
  return { backend: "file" };
}

async function getLastKeycap() {
  if (hasRedis()) {
    try { return await redis(["GET", KEY_LAST]); }
    catch (e) { console.error("[store]", e.message); return null; }
  }
  return readFile().last;
}

/**
 * Đọc lịch sử phím đã ghi (mới nhất trước). `limit` tối đa LOG_LIMIT.
 * Trả về mảng bản ghi { key, at, ua }.
 */
async function getLog(limit) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 50, 1), LOG_LIMIT);
  if (hasRedis()) {
    const raw = await redis(["LRANGE", KEY_LOG, "0", String(n - 1)]);
    if (!Array.isArray(raw)) return [];
    return raw.map(function (s) {
      try { return JSON.parse(s); } catch (_) { return { key: String(s) }; }
    });
  }
  return readFile().log.slice(0, n);
}

module.exports = { saveKeycap, getLastKeycap, getLog, clearKeycap, hasRedis };
