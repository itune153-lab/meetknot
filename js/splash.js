/* =========================================================
   MeetKNOT.Ai — 시작(로딩) 화면
   & → AND: → MeetNOTE → NOTE 지우고 KNOT → 모래처럼 흩어짐
   화면을 누르면 바로 넘어갈 수 있음
   ========================================================= */
(function () {
  const splash = document.getElementById("splash");
  const cv = document.getElementById("sand");
  const ctx = cv.getContext("2d");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const INK = "#15181f";

  let W = 0, H = 0, dpr = 1;
  let skipped = false, finished = false;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  // 화면 상태
  const s = { amp: 0, and: 0, word: "", caret: true };
  const FONT = '"Arial Black", "Arial", sans-serif';

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const base = Math.min(W, H * 0.6);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = INK;

    // &
    if (s.amp > 0) {
      ctx.save();
      ctx.globalAlpha = s.amp;
      const sc = 0.7 + 0.3 * s.amp;
      ctx.translate(cx, H * 0.36);
      ctx.scale(sc, sc);
      ctx.font = `900 ${base * 0.55}px ${FONT}`;
      ctx.fillText("&", 0, 0);
      ctx.restore();
    }
    // AND:
    if (s.and > 0) {
      ctx.globalAlpha = s.and;
      ctx.font = `900 ${base * 0.075}px ${FONT}`;
      ctx.fillText("AND:", cx, H * 0.56);
      ctx.globalAlpha = 1;
    }
    // MeetNOTE / MeetKNOT
    ctx.font = `900 ${base * 0.105}px ${FONT}`;
    const y = H * 0.645;
    const w = ctx.measureText(s.word).width;
    ctx.fillText(s.word, cx, y);
    if (s.caret) {
      const h = base * 0.1;
      ctx.fillRect(cx + w / 2 + 4, y - h / 2, Math.max(2, base * 0.008), h);
    }
  }

  async function fade(key, ms) {
    const t0 = performance.now();
    while (!skipped) {
      const k = Math.min(1, (performance.now() - t0) / ms);
      s[key] = 1 - Math.pow(1 - k, 3);
      draw();
      if (k >= 1) break;
      await new Promise(requestAnimationFrame);
    }
  }

  async function type(text, ms) {
    for (const ch of text) {
      if (skipped) return;
      s.word += ch; draw(); await sleep(ms);
    }
  }
  async function erase(n, ms) {
    for (let i = 0; i < n; i++) {
      if (skipped) return;
      s.word = s.word.slice(0, -1); draw(); await sleep(ms);
    }
  }

  // 글자를 모래알로 바꿔서 흩날리기
  function sandAway() {
    return new Promise((resolve) => {
      s.caret = false; draw();
      const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const step = Math.max(2, Math.round(2 * dpr));
      const parts = [];
      for (let y = 0; y < cv.height; y += step) {
        for (let x = 0; x < cv.width; x += step) {
          if (img[(y * cv.width + x) * 4 + 3] > 120) {
            const px = x / dpr, py = y / dpr;
            parts.push({
              x: px, y: py,
              vx: 0.6 + Math.random() * 2.2,
              vy: -0.8 - Math.random() * 1.6,
              delay: (px / W) * 500 + Math.random() * 250, // 왼쪽부터 차례로 흩어짐
              life: 1,
            });
          }
        }
      }
      const size = 1.6;
      const t0 = performance.now();
      function frame(now) {
        const t = now - t0;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = INK;
        let alive = 0;
        for (const p of parts) {
          if (t > p.delay) {
            p.x += p.vx; p.y += p.vy;
            p.vx += 0.04 + Math.random() * 0.05;   // 바람에 밀리듯
            p.vy += (Math.random() - 0.55) * 0.12;
            p.life -= 0.012 + Math.random() * 0.01;
          }
          if (p.life > 0) {
            alive++;
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillRect(p.x, p.y, size, size);
          }
        }
        ctx.globalAlpha = 1;
        if (alive && t < 2200 && !skipped) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function finish() {
    if (finished) return;
    finished = true;
    splash.classList.add("out");
    if (window.meetStartHome) window.meetStartHome();
    setTimeout(() => splash.remove(), 600);
  }

  // 누르면 건너뛰기
  splash.addEventListener("click", () => { skipped = true; finish(); });
  window.addEventListener("resize", () => { if (!finished) { resize(); draw(); } });

  async function run() {
    // 글꼴 준비를 잠깐 기다림
    try { await Promise.race([document.fonts.ready, sleep(400)]); } catch (e) {}
    await fade("amp", 500);
    await fade("and", 300);
    await sleep(150);
    await type("MeetNOTE", 90);
    await sleep(450);
    await erase(4, 110);
    await sleep(120);
    await type("KNOT", 120);
    await sleep(700);
    if (!skipped) await sandAway();
    finish();
  }
  run();
})();
