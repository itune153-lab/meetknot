/* =========================================================
   MeetKNOT.Ai — 회의준비 화면 · 본 회의(녹음) 화면
   ========================================================= */
(function () {
  const MK = window.MK;
  const $ = (id) => document.getElementById(id);

  // ---------- 카카오톡 등 앱 안 브라우저 감지 ----------
  if (/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent)) {
    $("inapp").classList.remove("hidden");
    $("openChrome").href =
      "intent://" + location.host + location.pathname + "#Intent;scheme=https;package=com.android.chrome;end";
  }

  /* ======================= 회의준비 화면 ======================= */
  let picked = [];

  function renderPeople() {
    const box = $("pPeople");
    box.innerHTML = "";
    MK.people().forEach((name) => {
      const c = document.createElement("button");
      c.className = "chip" + (picked.includes(name) ? " on" : "");
      c.textContent = name;
      c.onclick = () => {
        picked = picked.includes(name) ? picked.filter((n) => n !== name) : picked.concat(name);
        renderPeople();
      };
      box.appendChild(c);
    });
    const add = document.createElement("button");
    add.className = "chip add";
    add.textContent = "+ 추가";
    add.onclick = () => {
      const n = (prompt("추가할 참석자 이름을 입력하세요.") || "").trim();
      if (!n) return;
      const list = MK.people();
      if (!list.includes(n)) { list.push(n); MK.savePeople(list); }
      if (!picked.includes(n)) picked.push(n);
      renderPeople();
    };
    box.appendChild(add);
  }

  MK.showPrep = () => {
    $("pTitle").value = "";
    $("pPlace").value = "";
    $("pAgenda").value = "";
    $("pNow").textContent = MK.fmtDate();
    picked = [];
    renderPeople();
  };

  $("pStart").onclick = () => {
    MK.newMeeting({
      title: $("pTitle").value,
      place: $("pPlace").value,
      attendees: picked.slice(),
      agenda: $("pAgenda").value,
    });
    MK.go("meeting", { direct: true });
  };

  /* ======================= 본 회의 화면 ======================= */
  const cur = () => MK.current();
  const update = (fn) => { const m = cur(); if (!m) return; fn(m); MK.saveCurrent(m); };

  MK.showMeeting = () => {
    const m = cur();
    if (!m) return;
    $("title").value = m.title;
    $("now").textContent = MK.fmtDate(m.date);
    const info = [];
    if (m.place) info.push("장소: " + m.place);
    if (m.attendees.length) info.push("참석: " + m.attendees.join(", "));
    $("mInfo").textContent = info.join("  ·  ");
    $("mAgenda").textContent = m.agenda;
    $("mAgendaBox").classList.toggle("hidden", !m.agenda);
    showLive("", "");
    setStatus("");
    renderParas();
  };

  $("title").addEventListener("change", () => update((m) => (m.title = $("title").value.trim() || m.title)));

  function renderParas() {
    const m = cur();
    const paras = m ? m.paragraphs : [];
    $("count").textContent = paras.length;
    const box = $("paras");
    box.innerHTML = "";
    if (!paras.length) { box.innerHTML = '<div class="empty">단락 내용</div>'; return; }
    paras.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "para";
      el.innerHTML = `
        <div class="para-head">
          <span>${i + 1}. ${p.type === "rec" ? "녹음" : "직접 입력"} · ${p.time}</span>
          <span><button class="edit">수정</button><button class="del">삭제</button></span>
        </div>
        <div class="para-body"></div>`;
      el.querySelector(".para-body").textContent = p.text;
      el.querySelector(".del").onclick = () => {
        if (confirm("이 단락을 삭제할까요?")) { update((m) => m.paragraphs.splice(i, 1)); renderParas(); }
      };
      el.querySelector(".edit").onclick = () => editPara(el, i);
      box.appendChild(el);
    });
  }

  function editPara(el, i) {
    const body = el.querySelector(".para-body");
    const ta = document.createElement("textarea");
    ta.rows = 4;
    ta.value = cur().paragraphs[i].text;
    body.replaceWith(ta);
    const btn = el.querySelector(".edit");
    btn.textContent = "저장";
    btn.onclick = () => {
      const v = ta.value.trim();
      if (v) update((m) => (m.paragraphs[i].text = v));
      renderParas();
    };
    ta.focus();
  }

  function addPara(text, type) {
    text = (text || "").trim();
    if (!text) return;
    update((m) => m.paragraphs.push({ text, type, time: MK.hhmm() }));
    renderParas();
  }

  $("addDirect").onclick = () => { addPara($("direct").value, "text"); $("direct").value = ""; };

  // ---------- 실시간 글자 표시 ----------
  const liveFinal = document.querySelector("#liveText .final");
  const liveInterim = document.querySelector("#liveText .interim");
  function showLive(finalText, interim) {
    liveFinal.textContent = finalText;
    liveInterim.textContent = interim ? (finalText ? " " : "") + interim : "";
    const box = $("liveText").parentElement;
    box.scrollTop = box.scrollHeight;
  }

  function setStatus(msg, isErr) {
    const s = $("status");
    s.textContent = msg || "";
    s.className = "status" + (isErr ? " err" : "");
  }

  // ---------- 타이머 ----------
  let t0 = 0, tick = null;
  function startTimer() {
    t0 = Date.now();
    $("timer").classList.remove("hidden");
    tick = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $("timer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    }, 500);
  }
  function stopTimer() { clearInterval(tick); $("timer").classList.add("hidden"); }

  // ---------- 진단 줄 ----------
  function showDiag(d) {
    $("diag").innerHTML =
      `<b>진단</b> ${d.mode} · ${d.state} · 재연결 ${d.restarts}회<br>` + d.log.map((l) => "· " + l).join("<br>");
  }

  // ---------- 녹음 ----------
  const rec = new MeetRecorder({
    onText: showLive,
    onDiag: showDiag,
    onState: (state, msg) => {
      const on = state === "on";
      $("recBtn").classList.toggle("on", on);
      $("recImg").src = on ? "img/ICON_REC2.png" : "img/ICON_REC1.png";
      $("recHint").innerHTML = on ? "녹음 중이에요.<br />다시 누르면 저장돼요." : "녹음 버튼을 누르면<br />자동 입력됩니다.";
      if (state === "error") { setStatus(msg, true); stopTimer(); }
    },
  });

  let busy = false;
  $("recBtn").onclick = async () => {
    if (busy) return;
    busy = true;
    if (!rec.want) {
      showLive("", "");
      setStatus("듣고 있어요. 말씀하세요.");
      rec.start();
      if (rec.want) startTimer();
    } else {
      setStatus("저장 중…");
      const text = await rec.stop();
      stopTimer();
      if (text) { addPara(text, "rec"); setStatus("한 단락으로 저장했어요."); }
      else setStatus("들린 말이 없어서 저장하지 않았어요.");
    }
    busy = false;
  };

  // ---------- 회의 저장 ----------
  $("saveMeeting").onclick = async () => {
    if (rec.want) { setStatus("녹음을 먼저 멈춰주세요.", true); return; }
    const m = cur();
    if (!m || !m.paragraphs.length) { setStatus("저장할 단락이 없어요. 녹음하거나 직접 입력해 주세요.", true); return; }
    const choice = await MK.ask("회의 저장", `"${m.title}"\n단락 ${m.paragraphs.length}개를 회의 목록에 저장하고 회의를 마칠까요?`, [
      { label: "취소", value: "no" },
      { label: "저장만", value: "save" },
      { label: "저장 + AI 요약", value: "ai", main: true },
    ]);
    if (choice === "no") return;
    const saved = MK.archiveCurrent();
    MK.go("notes", { direct: true });
    if (choice === "ai") setTimeout(() => MK.summarize(saved), 800);
  };

  // 다른 화면으로 갈 때 녹음 중인지 확인할 수 있게 공개
  window.meetRec = rec;
  window.meetSetStatus = setStatus;
})();
