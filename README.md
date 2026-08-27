# Landing page đăng nhập — nội dung ẩn

Trang đăng nhập; sau khi đăng nhập đúng, một đoạn nội dung được đặt **trong thẻ nhạc, ngay
dưới dòng "Thời lượng"** với màu chữ **trong suốt** nên vô hình. Chỉ khi **Ctrl + A** (bôi đen
toàn trang) thì nó mới hiện ra, và **Ctrl + C → Ctrl + V** cũng dán ra đúng đoạn đó.

## Luồng

1. **Đăng nhập** — tài khoản + mật khẩu.
2. **Keycap** — hỏi đã gắn keycap vào phím cơ chưa, kèm ảnh minh hoạ.
3. **Nhập phím** — bấm thẳng phím đã gắn keycap (phím nào cũng được, kể cả Enter, Esc,
   Delete, phím mũi tên…); dữ liệu được ghi vào database.
4. **Nội dung** — hiện lời nhắn + trình phát nhạc. Nhấn **Ctrl + phím keycap** để bôi đen
   toàn trang (y như Ctrl + A) → lộ nội dung ẩn nằm dưới dòng "Thời lượng" trong thẻ nhạc.

## Cấu trúc

```
public/          # static: index.html, styles.css, app.js, ảnh, mp3
                 # (KHÔNG chứa mật khẩu / nội dung ẩn)
api/login.js     # POST  — kiểm tra tài khoản, phát cookie phiên, trả nội dung
api/keycap.js    # POST  — lưu phím đã gắn keycap vào database (cần đăng nhập)
api/content.js   # GET   — trả nội dung + phím đã lưu, nếu cookie phiên còn hợp lệ
api/log.js       # GET   — trả lịch sử phím đã ghi (cần đăng nhập); ?limit=50
api/logout.js    # POST  — xoá cookie phiên
lib/auth.js      # so sánh timing-safe, ký/kiểm token, rate limit, cookie
lib/store.js     # ghi/đọc database (Vercel KV / Upstash Redis, fallback file tạm)
vercel.json      # security headers + CSP
```

## Database

`lib/store.js` ghi vào Redis qua REST khi có `KV_REST_API_URL` + `KV_REST_API_TOKEN`:

- `keycap:last` — phím mới nhất (dùng để khôi phục khi F5).
- `keycap:log` — danh sách 200 bản ghi gần nhất `{ key, at, ua }`.

Cách bật: Vercel → **Storage** → tạo **Upstash Redis** → **Connect** vào project. Vercel tự
thêm hai biến trên; **Redeploy** là chạy.

Chưa bật thì code vẫn chạy nhưng chỉ ghi ra file tạm + log — **trên Vercel dữ liệu sẽ mất**,
vì mỗi lần gọi hàm là một máy khác.

### Xem dữ liệu đã ghi

Đăng nhập xong, mở `/api/log?limit=50` (dùng chính cookie phiên nên phải đăng nhập trước).
Trả về JSON gồm `count`, `log` (mảng `{ key, at, ua }` mới nhất trước) và `persistent`:
`persistent:false` nghĩa là đang chạy file tạm — dữ liệu **không bền**, hãy bật Upstash Redis.

## Đổi bài hát

Bỏ file `.mp3` mới vào `public/`, rồi sửa `src` của thẻ `<audio>` và phần tên bài / nghệ sĩ
(khối `.album` và `<dl class="info">`) trong `public/index.html`.

## Bảo mật đã làm

| Việc | Cách làm |
|---|---|
| Mật khẩu & nội dung không lộ trong mã nguồn | Nằm ở biến môi trường, chỉ đọc trong serverless function. View Source / DevTools của khách không thấy gì. |
| Không lộ vế nào sai | So sánh bằng `crypto.timingSafeEqual` (hash trước để cùng độ dài), luôn kiểm tra cả user lẫn pass. |
| Chống dò mật khẩu | Rate limit 8 lần sai / 10 phút / IP → trả `429` kèm `Retry-After`. |
| Phiên đăng nhập | Cookie `HttpOnly` + `SameSite=Strict` + `Secure` (trên HTTPS), token ký HMAC-SHA256, hết hạn 8 giờ. JS trên trang không đọc được cookie. |
| Chống XSS | Nội dung chèn bằng `textContent`, không dùng `innerHTML`. CSP chặn script ngoài, `frame-ancestors 'none'` chặn clickjacking. |
| Không cache nhầm | Mọi phản hồi `/api/*` đều `Cache-Control: no-store`. |
| Không bị index | `X-Robots-Tag: noindex` + thẻ meta robots. |

**Giới hạn cần biết:** mật khẩu 4 chữ số chỉ có 10.000 khả năng. Rate limit ở trên là
*best-effort* — mỗi instance serverless giữ bộ đếm riêng trong RAM, nên kẻ tấn công kiên trì
vẫn có thể dò. Nếu muốn chắc chắn, đặt `AUTH_PASS` là chuỗi dài hơn (server không giới hạn
4 ký tự — chỉ ô input phía trước giới hạn, sửa `maxlength` trong `public/index.html`),
hoặc gắn thêm Upstash Redis cho rate limit dùng chung.

## Chạy thử ở máy

```bash
npm i -g vercel
cd <thư-mục-dự-án>
cp .env.example .env.local   # rồi điền giá trị thật
vercel dev                   # mở http://localhost:3000
```

## Deploy lên Vercel

1. Đẩy code lên GitHub (`.env.local` đã bị `.gitignore`, sẽ không lên theo).
2. Vercel → **Add New… → Project** → chọn repo. Framework Preset để **Other**, không cần build command.
3. **Settings → Environment Variables**, thêm cho cả Production / Preview / Development:

   | Name | Nội dung |
   |---|---|
   | `AUTH_USER` | tên tài khoản |
   | `AUTH_PASS` | mật khẩu |
   | `SESSION_SECRET` | chuỗi ngẫu nhiên 64 ký tự (xem `.env.example` để biết cách tạo) |
   | `SECRET_MESSAGE` | đoạn nội dung ẩn |

   Giá trị thật chỉ nhập ở đây và ở `.env.local` — đừng viết vào file nào được commit.

4. **Deploy**. Nếu thêm biến sau khi đã deploy thì phải **Redeploy** lại.

Thiếu bất kỳ biến nào, API sẽ trả `500 "Máy chủ chưa được cấu hình."` thay vì chạy với giá trị mặc định.
