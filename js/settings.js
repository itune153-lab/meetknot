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
    document.querySelectorAll("#recModes button").forEach((b) => b.classList.toggle("on", b.dataset.mode === MK.recMode()));
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

  // ---------- 녹음 방식 ----------
  document.querySelectorAll("#recModes button").forEach((b) => {
    b.onclick = () => {
      MK.setRecMode(b.dataset.mode);
      document.querySelectorAll("#recModes button").forEach((x) => x.classList.toggle("on", x === b));
    };
  });

  // ---------- 테마 ----------
  document.querySelectorAll("#themes button").forEach((b) => {
    b.onclick = () => {
      MK.setTheme(b.dataset.theme);
      document.querySelectorAll("#themes button").forEach((x) => x.classList.toggle("on", x === b));
    };
  });
})();

/* ---------- 백업 내보내기 / 불러오기 ---------- */
(function () {
  const MK = window.MK;
  const $ = (id) => document.getElementById(id);
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const p2 = (n) => String(n).padStart(2, "0");
  const msg = (t, err) => { const m = $("backupMsg"); m.textContent = t; m.className = "set-msg" + (err ? " err" : ""); };

  $("backupOut").onclick = async () => {
    const d = new Date();
    const stamp = String(d.getFullYear()).slice(2) + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes());
    const data = {
      app: "MeetKNOT.Ai",
      version: 1,
      exportedAt: d.toISOString(),
      meetings: MK.meetings(),
      summaries: MK.summaries(),
      people: MK.people(),
      current: MK.current(),
    };
    const name = `MeetKNOT백업_${stamp}.json`;
    const file = new File([JSON.stringify(data)], name, { type: "application/json" });
    msg(`회의 ${data.meetings.length}개, 요약 ${data.summaries.length}개를 백업 파일로 만들었어요.`);
    // 폰: 보내기 창(카카오톡 나와의 채팅, 드라이브 등) / PC: 내려받기
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      const how = await MK.ask("백업 파일", name + "\n어떻게 저장할까요?", [
        { label: "내려받기", value: "down" },
        { label: "보내기", value: "send", main: true },
      ]);
      if (how === "send") { try { await navigator.share({ files: [file], title: name }); } catch (e) {} return; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  $("backupIn").onclick = () => { $("backupFile").value = ""; $("backupFile").click(); };

  $("backupFile").onchange = async () => {
    const f = $("backupFile").files[0];
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { msg("백업 파일을 읽지 못했어요.", true); return; }
    if (!data || data.app !== "MeetKNOT.Ai" || !Array.isArray(data.meetings)) { msg("MeetKNOT.Ai 백업 파일이 아니에요.", true); return; }

    const ok = await MK.ask("백업 불러오기",
      `회의 ${data.meetings.length}개, 요약 ${(data.summaries || []).length}개가 들어 있어요.\n지금 기록은 지우지 않고, 없는 것만 더해요.`,
      [{ label: "취소", value: false }, { label: "불러오기", value: true, main: true }]);
    if (!ok) return;

    const merge = (key, incoming) => {
      const list = get(key, []);
      const ids = new Set(list.map((x) => x.id));
      let added = 0;
      (incoming || []).forEach((x) => { if (x && x.id && !ids.has(x.id)) { list.push(x); added++; } });
      list.sort((a, b) => ((a.createdAt || a.date) < (b.createdAt || b.date) ? 1 : -1));
      set(key, list);
      return added;
    };
    const m = merge("mk_meetings", data.meetings);
    const s = merge("mk_summaries", data.summaries);
    const people = MK.people();
    (data.people || []).forEach((n) => { if (!people.includes(n)) people.push(n); });
    MK.savePeople(people);
    // 진행 중 회의가 백업에만 있으면 회의 목록에 넣어둠
    if (data.current && data.current.paragraphs && data.current.paragraphs.length) merge("mk_meetings", [data.current]);

    msg(`불러왔어요. 회의 ${m}개, 요약 ${s}개를 더했어요.`);
    MK.showSetting();
    msg(`불러왔어요. 회의 ${m}개, 요약 ${s}개를 더했어요.`);
  };
})();
