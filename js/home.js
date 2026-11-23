/* =========================================================
   MeetKNOT.Ai — 홈 화면 · 화면 이동 · 가운데 번쩍 효과
   ========================================================= */
(function () {
  const $ = (id) => document.getElementById(id);

  // 각 화면에 쓰는 가운데 번쩍 아이콘
  const FLASH = {
    meeting: "img/ICON_MEETING.png",
    notes: "img/ICON_NOTES.png",
    ai: "img/ICON_AI.png",
    pdf: "img/ICON_PDFList.png",
    setting: "img/ICON_SETTING.png",
  };

  const PITCH =
    "By the time your meeting ends, everything is already organized.\n" +
    "Record. Transcribe. Summarize. Share.\n" +
    "AI-powered meeting intelligence that transforms conversations into clear, actionable outcomes.\n" +
    "No more manual notes. No more missed details. Just better meetings.";

  let current = "home";
  let typedOnce = false;
  let busy = false;

  // ---------- 홈: 아이콘 날아오기 + 문구 타자 ----------
  function playHome() {
    document.querySelectorAll(".hi").forEach((el) => {
      el.classList.remove("fly");
      void el.offsetWidth; // 애니메이션 다시 시작
      el.classList.add("fly");
    });
    const p = $("pitch");
    if (typedOnce) { p.textContent = PITCH; p.classList.add("done"); return; }
    typedOnce = true;
    p.textContent = "";
    p.classList.remove("done");
    let i = 0;
    setTimeout(function type() {
      i += 2; // 순식간에 적히도록 두 글자씩
      p.textContent = PITCH.slice(0, i);
      if (i < PITCH.length) setTimeout(type, 14);
      else p.classList.add("done");
    }, 700);
  }

  // ---------- 화면 이동 ----------
  function go(name) {
    if (busy || name === current) return;
    // 녹음 중에는 회의 화면을 떠나지 않게
    if (current === "meeting" && window.meetRec && window.meetRec.want) {
      window.meetSetStatus && window.meetSetStatus("녹음 중이에요. 녹음을 먼저 멈춰주세요.", true);
      return;
    }
    busy = true;
    document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("on", b.dataset.go === name));

    const show = () => {
      document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
      const v = $("page-" + name);
      v.classList.remove("hidden", "enter");
      void v.offsetWidth;
      v.classList.add("enter");
      window.scrollTo(0, 0);
      current = name;
      if (name === "home") playHome();
    };

    if (name === "home" || !FLASH[name]) { show(); busy = false; return; }

    // 가운데 아이콘이 번쩍 나타났다 사라지고 화면이 바뀐다
    const f = $("flash");
    const img = f.querySelector("img");
    img.src = FLASH[name];
    img.style.animation = "none";
    void img.offsetWidth;
    img.style.animation = "";
    f.classList.remove("hidden");
    setTimeout(show, 280);
    setTimeout(() => { f.classList.add("hidden"); busy = false; }, 680);
  }

  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.go));
  });

  // 시작 화면이 끝나면 splash.js가 부른다
  window.meetStartHome = () => playHome();
  window.meetGo = go;
})();
