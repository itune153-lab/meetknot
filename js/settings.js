/* =========================================================
   MeetKNOT.Ai — 설정 (API 키 · 참석자 명단 · 테마)
   ========================================================= */
(function () {
  const MK = window.MK;
  const $ = (id) => document.getElementById(id);
  const msg = (t, err) => { const m = $("keyMsg"); m.textContent = t; m.className = "set-msg" + (err ? " err" : ""); };

  MK.showSetting = () => {
    const k = MK.apiKey();
    $("keyInput").value = k;
    $("keyInput").type = "password";
    msg(k ? "키가 저장되어 있어요. (이 기기에만 저장)" : "아직 키가 없어요.");
    renderPeople();
    document.querySelectorAll("#themes button").forEach((b) => b.classList.toggle("on", b.dataset.theme === MK.theme()));
  };

  // ---------- API 키 ----------
  $("keyShow").onclick = () => { const i = $("keyInput"); i.type = i.type === "password" ? "text" : "password"; };

  $("keySave").onclick = async () => {
    const k = $("keyInput").value.trim();
    if (!k) { MK.setApiKey(""); msg("키를 지웠어요."); return; }
    MK.setApiKey(k);
    msg("저장했어요. 키가 되는지 확인하는 중…");
    $("keySave").disabled = true;
    try {
      const model = await MK.testKey(k);
      msg("✓ 키가 잘 작동해요. (" + model + ")");
    } catch (e) {
      msg(e.message, true);
    }
    $("keySave").disabled = false;
  };

  // ---------- 참석자 명단 ----------
  function renderPeople() {
    const box = $("peopleList");
    box.innerHTML = "";
    const list = MK.people();
    if (!list.length) box.innerHTML = '<div class="empty">등록된 참석자가 없어요.</div>';
    list.forEach((name) => {
      const row = document.createElement("div");
      row.className = "person";
      row.innerHTML = `<span></span><button>삭제</button>`;
      row.querySelector("span").textContent = name;
      row.querySelector("button").onclick = () => { MK.savePeople(MK.people().filter((n) => n !== name)); renderPeople(); };
      box.appendChild(row);
    });
  }

  $("personAdd").onclick = () => {
    const n = $("personInput").value.trim();
    if (!n) return;
    const list = MK.people();
    if (!list.includes(n)) { list.push(n); MK.savePeople(list); }
    $("personInput").value = "";
    renderPeople();
  };
  $("personInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("personAdd").click(); });

  // ---------- 테마 ----------
  document.querySelectorAll("#themes button").forEach((b) => {
    b.onclick = () => {
      MK.setTheme(b.dataset.theme);
      document.querySelectorAll("#themes button").forEach((x) => x.classList.toggle("on", x === b));
    };
  });
})();
