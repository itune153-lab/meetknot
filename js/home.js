/* =========================================================
   MeetKNOT.Ai — 홈 화면 · 화면 이동 · 가운데 번쩍 효과
   ========================================================= */
(function () {
  const MK = (window.MK = window.MK || {});
  const $ = (id) => document.getElementById(id);

  const FLASH = {
    prep: "img/ICON_MEETING.png",
    meeting: "img/ICON_MEETING.png",
    notes: "img/ICON_NOTES.png",
    ai: "img/ICON_AI.png",
    pdf: "img/ICON_PDFList.png",
    setting: "img/ICON_SETTING.png",
  };
  // 화면이 열릴 때 내용을 채우는 함수
  const ON_SHOW = {
    prep: () => MK.showPrep && MK.showPrep(),
    meeting: () => MK.showMeeting && MK.showMeeting(),
    notes: () => MK.showNotes && MK.showNotes(),
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
      void el.offsetWidth;
      el.classList.add("fly");
    });
    const p = $("pitch");
    if (typedOnce) { p.textContent = PITCH; p.classList.add("done"); return; }
    typedOnce = true;
    p.textContent = "";
    p.classList.remove("done");
    let i = 0;
    setTimeout(function type() {
      i += 2;
      p.textContent = PITCH.slice(0, i);
      if (i < PITCH.length) setTimeout(type, 14);
      else p.classList.add("done");
    }, 700);
  }

  // ---------- 회의 버튼: 진행 중인 회의가 있으면 물어보기 ----------
  async function enterMeeting() {
    const m = MK.current();
    if (!m) return go("prep", { direct: true });
    if (current === "meeting") return;
    const n = m.paragraphs.length;
    const choice = await MK.ask(
      "진행 중인 회의가 있어요",
      `"${m.title}"\n단락 ${n}개`,
      [
        { label: "새 회의 시작", value: "new" },
        { label: "이어서 하기", value: "cont", main: true },
      ]
    );
    if (choice === "cont") go("meeting", { direct: true });
    else { MK.archiveCurrent(); go("prep", { direct: true }); }
  }

  // ---------- 화면 이동 ----------
  function go(name, opts) {
    opts = opts || {};
    if (busy) return;
    if (current === "meeting" && name !== "meeting" && window.meetRec && window.meetRec.want) {
      window.meetSetStatus && window.meetSetStatus("녹음 중이에요. 녹음을 먼저 멈춰주세요.", true);
      return;
    }
    if (name === "meeting" && !opts.direct) return enterMeeting();
    if (name === current && !opts.direct) return;

    busy = true;
    const navKey = name === "prep" ? "meeting" : name;
    document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("on", b.dataset.go === navKey));

    const show = () => {
      document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
      const v = $("page-" + name);
      v.classList.remove("hidden", "enter");
      void v.offsetWidth;
      v.classList.add("enter");
      window.scrollTo(0, 0);
      current = name;
      if (ON_SHOW[name]) ON_SHOW[name]();
      if (name === "home") playHome();
    };

    if (name === "home" || !FLASH[name]) { show(); busy = false; return; }

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

  window.meetStartHome = () => playHome();
  MK.go = go;
})();
