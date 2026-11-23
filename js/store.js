/* =========================================================
   MeetKNOT.Ai — 저장소 (이 기기 안에만 저장)
   ========================================================= */
(function () {
  const MK = (window.MK = window.MK || {});
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const KEY_CUR = "mk_current";
  const KEY_LIST = "mk_meetings";
  const KEY_PEOPLE = "mk_people";

  const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const p2 = (n) => String(n).padStart(2, "0");

  // 2026.11.23(월)  17:20
  MK.fmtDate = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}(${DAYS[d.getDay()]})  ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  MK.hhmm = () => { const d = new Date(); return p2(d.getHours()) + ":" + p2(d.getMinutes()); };

  // ---------- 진행 중인 회의 ----------
  MK.current = () => get(KEY_CUR, null);
  MK.saveCurrent = (m) => { if (m) { m.updatedAt = new Date().toISOString(); set(KEY_CUR, m); } else localStorage.removeItem(KEY_CUR); };

  MK.newMeeting = (info) => {
    const now = new Date().toISOString();
    const m = {
      id: "m" + Date.now(),
      title: (info.title || "").trim() || MK.fmtDate(now).replace("  ", " ") + " 회의",
      date: now,
      place: (info.place || "").trim(),
      attendees: info.attendees || [],
      agenda: (info.agenda || "").trim(),
      paragraphs: [],
      createdAt: now,
      updatedAt: now,
    };
    MK.saveCurrent(m);
    return m;
  };

  // 내용이 있는 회의인가
  MK.hasContent = (m) => !!(m && (m.paragraphs.length || m.agenda));

  // 진행 중 회의를 회의 목록에 저장하고 비운다
  MK.archiveCurrent = () => {
    const m = MK.current();
    if (!m) return null;
    if (m.paragraphs.length || m.agenda) {
      const list = MK.meetings().filter((x) => x.id !== m.id);
      list.unshift(m);
      set(KEY_LIST, list);
    }
    MK.saveCurrent(null);
    return m;
  };

  // ---------- 회의 목록 ----------
  MK.meetings = () => get(KEY_LIST, []);
  MK.deleteMeeting = (id) => set(KEY_LIST, MK.meetings().filter((x) => x.id !== id));

  // ---------- 참석자 명단 ----------
  MK.people = () => get(KEY_PEOPLE, ["전준호", "신재준", "이정현", "신채인"]);
  MK.savePeople = (list) => set(KEY_PEOPLE, list);

  // 1단계 테스트용 저장값 정리
  localStorage.removeItem("meetknot_test_paragraphs");

  // ---------- 공용 질문 창 ----------
  // MK.ask("제목", "내용", [{label:"이어서", value:"cont"}, ...]) → 누른 버튼의 value
  MK.ask = (title, msg, buttons) =>
    new Promise((resolve) => {
      const box = document.getElementById("modal");
      box.querySelector(".m-title").textContent = title;
      box.querySelector(".m-msg").textContent = msg;
      const btns = box.querySelector(".m-btns");
      btns.innerHTML = "";
      buttons.forEach((b) => {
        const el = document.createElement("button");
        el.textContent = b.label;
        if (b.main) el.className = "main";
        el.onclick = () => { box.classList.add("hidden"); resolve(b.value); };
        btns.appendChild(el);
      });
      box.classList.remove("hidden");
    });
})();
