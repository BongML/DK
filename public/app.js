(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var loginScreen   = $("loginScreen");
  var keycapScreen  = $("keycapScreen");
  var keyScreen     = $("keyScreen");
  var contentScreen = $("contentScreen");

  var loginForm = $("loginForm"), userEl = $("user"), passEl = $("pass");
  var submitBtn = $("submitBtn"), errEl = $("err");

  var keyForm = $("keyForm"), keycapEl = $("keycap");
  var keySubmit = $("keySubmit"), keyErr = $("keyErr");

  var secret = $("secret");
  var hintKey = $("hintKey");

  var savedMessage = "";
  var hotkey = "";              // phím đã gắn keycap

  /* ---------------------------------------------------------- *
   * tiện ích
   * ---------------------------------------------------------- */
  function show(screen) {
    [loginScreen, keycapScreen, keyScreen, contentScreen].forEach(function (s) {
      s.hidden = (s !== screen);
    });
  }

  function flash(card, box, msg) {
    box.textContent = msg;
    box.classList.add("on");
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
  }

  /* ---------------------------------------------------------- *
   * bước 1 — đăng nhập
   * ---------------------------------------------------------- */
  passEl.addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "").slice(0, 4);
  });

  [userEl, passEl].forEach(function (el) {
    el.addEventListener("input", function () { errEl.classList.remove("on"); });
  });

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submitBtn.disabled) return;

    var u = userEl.value.trim().toUpperCase();
    var p = passEl.value.trim();
    if (!u || !p) { flash(loginForm, errEl, "Vui lòng nhập đủ tài khoản và mật khẩu."); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = "Đang kiểm tra…";

    postJSON("/api/login", { user: u, pass: p })
      .then(function (res) {
        if (res.status === 200 && res.data && res.data.message) {
          savedMessage = res.data.message;
          errEl.classList.remove("on");
          show(keycapScreen);
        } else {
          flash(loginForm, errEl, (res.data && res.data.error) || "Sai tài khoản hoặc mật khẩu.");
          passEl.value = "";
          passEl.focus();
        }
      })
      .catch(function () { flash(loginForm, errEl, "Không kết nối được máy chủ. Thử lại sau nhé."); })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Đăng nhập";
      });
  });

  /* ---------------------------------------------------------- *
   * bước 2 — xác nhận đã gắn keycap
   * ---------------------------------------------------------- */
  $("keycapNext").addEventListener("click", function () {
    show(keyScreen);
    keycapEl.focus();
  });

  /* ---------------------------------------------------------- *
   * bước 3 — nhập phím, ghi vào database
   * ---------------------------------------------------------- */
  keycapEl.addEventListener("input", function () {
    this.value = this.value.trim().slice(0, 1).toUpperCase();
    keyErr.classList.remove("on");
  });

  keyForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (keySubmit.disabled) return;

    var k = keycapEl.value.trim().toUpperCase();
    if (!/^[A-Z0-9]$/.test(k)) {
      flash(keyForm, keyErr, "Nhập đúng một phím chữ hoặc số nhé.");
      return;
    }

    keySubmit.disabled = true;
    keySubmit.textContent = "Đang lưu…";

    postJSON("/api/keycap", { key: k })
      .then(function (res) {
        if (res.status === 200) {
          hotkey = k;
          unlock(savedMessage, k);
        } else {
          flash(keyForm, keyErr, (res.data && res.data.error) || "Lưu không thành công. Thử lại nhé.");
        }
      })
      .catch(function () { flash(keyForm, keyErr, "Không kết nối được máy chủ. Thử lại sau nhé."); })
      .then(function () {
        keySubmit.disabled = false;
        keySubmit.textContent = "Xác nhận";
      });
  });

  /* ---------------------------------------------------------- *
   * bước 4 — nội dung
   * ---------------------------------------------------------- */
  function unlock(message, key) {
    hotkey = key || hotkey;
    // textContent, không dùng innerHTML -> server không chèn được HTML vào DOM
    secret.textContent = message;
    hintKey.textContent = hotkey || "?";
    show(contentScreen);
  }

  function lock() {
    secret.textContent = "";
    hotkey = "";
    savedMessage = "";
    pause();
    userEl.value = ""; passEl.value = ""; keycapEl.value = "";
    show(loginScreen);
    userEl.focus();
  }

  /* Ctrl + <phím keycap> = chọn toàn trang (y như Ctrl + A) + phát nhạc */
  document.addEventListener("keydown", function (e) {
    if (contentScreen.hidden || !hotkey) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (String(e.key).toUpperCase() !== hotkey) return;

    e.preventDefault();

    var sel = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(document.body);
    sel.removeAllRanges();
    sel.addRange(range);

    if (audio.paused) play();   // phím bấm là user gesture -> trình duyệt cho phát
  });

  $("logout").addEventListener("click", function () {
    fetch("/api/logout", { method: "POST", credentials: "same-origin" })
      .catch(function () {})
      .then(lock);
  });

  /* ---------------------------------------------------------- *
   * trình phát nhạc
   * ---------------------------------------------------------- */
  var audio = $("audio");
  var player = document.querySelector(".player");
  var track = $("track");
  var bar = $("bar"), barFill = $("barFill"), barDot = $("barDot");
  var curEl = $("cur"), durEl = $("dur"), trackTime = $("trackTime");
  var pillText = $("pillText");

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function play() {
    audio.play().then(function () {
      player.classList.add("playing");
      track.classList.add("active");
      pillText.textContent = "Tạm dừng";
    }).catch(function () { /* trình duyệt chặn autoplay */ });
  }

  function pause() {
    audio.pause();
    player.classList.remove("playing");
    pillText.textContent = "Phát";
  }

  function toggle() { audio.paused ? play() : pause(); }

  $("playPill").addEventListener("click", toggle);
  $("coverPlay").addEventListener("click", toggle);
  track.addEventListener("click", toggle);
  track.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });

  audio.addEventListener("loadedmetadata", function () {
    var d = fmt(audio.duration);
    durEl.textContent = d;
    trackTime.textContent = d;
    var info = $("infoDur");
    if (info) info.textContent = d;
  });

  audio.addEventListener("timeupdate", function () {
    var pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    barFill.style.width = pct + "%";
    barDot.style.left = pct + "%";
    bar.setAttribute("aria-valuenow", Math.round(pct));
    curEl.textContent = fmt(audio.currentTime);
  });

  audio.addEventListener("ended", function () {
    if (audio.loop) return;
    pause();
    audio.currentTime = 0;
  });

  function seekTo(clientX) {
    var r = bar.getBoundingClientRect();
    var pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    if (audio.duration) audio.currentTime = pct * audio.duration;
  }

  bar.addEventListener("pointerdown", function (e) {
    seekTo(e.clientX);
    var move = function (ev) { seekTo(ev.clientX); };
    var up = function () {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });

  bar.addEventListener("keydown", function (e) {
    if (!audio.duration) return;
    if (e.key === "ArrowRight") { e.preventDefault(); audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); audio.currentTime = Math.max(0, audio.currentTime - 5); }
  });

  var vol = $("vol");
  audio.volume = vol.value / 100;
  vol.addEventListener("input", function () { audio.volume = this.value / 100; });

  $("likeBtn").addEventListener("click", function () {
    this.setAttribute("aria-pressed", this.getAttribute("aria-pressed") === "true" ? "false" : "true");
  });

  $("loopBtn").addEventListener("click", function () {
    audio.loop = !audio.loop;
    this.setAttribute("aria-pressed", audio.loop ? "true" : "false");
  });

  /* ---------------------------------------------------------- *
   * helper + khôi phục phiên
   * ---------------------------------------------------------- */
  function postJSON(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (data) { return { status: r.status, data: data }; });
    });
  }

  fetch("/api/content", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.message) { userEl.focus(); return; }
      savedMessage = data.message;
      if (data.keycap) unlock(data.message, data.keycap);   // đã khai báo phím rồi
      else show(keycapScreen);                              // còn phiên nhưng chưa khai báo
    })
    .catch(function () { userEl.focus(); });
})();
