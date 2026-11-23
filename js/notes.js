/* =========================================================
   MeetKNOT.Ai — 회의 목록
   ========================================================= */
(function () {
  const MK = window.MK;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  MK.showNotes = () => {
    $("noteDetail").classList.add("hidden");
    $("noteListWrap").classList.remove("hidden");
    const list = MK.meetings();
    const box = $("noteList");
    if (!list.length) {
      box.innerHTML = '<div class="empty-card">저장된 회의가 아직 없어요.<br>회의를 마치고 "회의 저장"을 누르면 여기에 쌓여요.</div>';
      return;
    }
    box.innerHTML = "";
    list.forEach((m) => {
      const el = document.createElement("button");
      el.className = "note-item";
      el.innerHTML = `
        <div class="n-title">${esc(m.title)}</div>
        <div class="n-sub">${MK.fmtDate(m.date)} · 단락 ${m.paragraphs.length}개${m.place ? " · " + esc(m.place) : ""}</div>`;
      el.onclick = () => openNote(m.id);
      box.appendChild(el);
    });
  };

  function openNote(id) {
    const m = MK.meetings().find((x) => x.id === id);
    if (!m) return;
    $("noteListWrap").classList.add("hidden");
    const d = $("noteDetail");
    d.classList.remove("hidden");
    d.querySelector(".d-body").innerHTML = `
      <h2 class="d-title">${esc(m.title)}</h2>
      <div class="d-sub">${MK.fmtDate(m.date)}</div>
      ${m.place ? `<div class="d-row"><b>장소</b> ${esc(m.place)}</div>` : ""}
      ${m.attendees.length ? `<div class="d-row"><b>참석자</b> ${esc(m.attendees.join(", "))}</div>` : ""}
      ${m.agenda ? `<div class="d-sec">안건</div><div class="d-text">${esc(m.agenda)}</div>` : ""}
      <div class="d-sec">회의 내용 (단락 ${m.paragraphs.length}개)</div>
      ${m.paragraphs.map((p, i) => `<div class="d-para"><span>${i + 1}. ${p.time}</span>${esc(p.text)}</div>`).join("")}
    `;
    d.querySelector(".d-ai").onclick = () => MK.summarize(m);
    d.querySelector(".d-del").onclick = async () => {
      const ok = await MK.ask("회의 삭제", `"${m.title}"을(를) 삭제할까요?\n삭제하면 되돌릴 수 없어요.`, [
        { label: "취소", value: false },
        { label: "삭제", value: true, main: true },
      ]);
      if (!ok) return;
      MK.deleteMeeting(m.id);
      MK.showNotes();
    };
    window.scrollTo(0, 0);
  }

  $("noteBack").onclick = () => MK.showNotes();
})();
