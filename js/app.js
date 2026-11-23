/* =========================================================
   MeetKNOT.Ai — 1단계: 녹음 테스트 화면
   ========================================================= */
(function () {
  const $ = (id) => document.getElementById(id);
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const STORE = "meetknot_test_paragraphs";

  // ---------- 날짜/시간 ----------
  function nowText() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}(${DAYS[d.getDay()]})  ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  $("now").textContent = nowText();
  setInterval(() => ($("now").textContent = nowText()), 30000);

  // ---------- 카카오톡 등 앱 안 브라우저 감지 ----------
  const ua = navigator.userAgent;
  if (/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua)) {
    $("inapp").classList.remove("hidden");
    $("openChrome").href =
      "intent://" + location.host + location.pathname + "#Intent;scheme=https;package=com.android.chrome;end";
  }

  // ---------- 단락 저장 ----------
  let paras = [];
  try { paras = JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) {}
  const save = () => localStorage.setItem(STORE, JSON.stringify(paras));

  function renderParas() {
    $("count").textContent = paras.length;
    const box = $("paras");
    box.innerHTML = "";
    if (!paras.length) {
      box.innerHTML = '<div class="empty">단락 내용</div>';
      return;
    }
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
        if (confirm("이 단락을 삭제할까요?")) { paras.splice(i, 1); save(); renderParas(); }
      };
      el.querySelector(".edit").onclick = () => editPara(el, i);
      box.appendChild(el);
    });
    box.scrollTop = box.scrollHeight;
  }

  function editPara(el, i) {
    const body = el.querySelector(".para-body");
    const ta = document.createElement("textarea");
    ta.rows = 4;
    ta.value = paras[i].text;
    body.replaceWith(ta);
    const btn = el.querySelector(".edit");
    btn.textContent = "저장";
    btn.onclick = () => {
      const v = ta.value.trim();
      if (v) { paras[i].text = v; save(); }
      renderParas();
    };
    ta.focus();
  }

  function addPara(text, type) {
    text = (text || "").trim();
    if (!text) return;
    paras.push({ text, type, time: nowText().slice(-5) });
    save();
    renderParas();
  }

  $("addDirect").onclick = () => {
    addPara($("direct").value, "text");
    $("direct").value = "";
  };

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
  function stopTimer() { clearInterval(tick); }

  // ---------- 녹음 ----------
  const rec = new MeetRecorder({
    onText: showLive,
    onInfo: (m) => setStatus(m),
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

  // 하단 메뉴 (1단계에서는 아직 준비 중)
  document.querySelectorAll(".nav button").forEach((b) => {
    b.onclick = () => { if (b.dataset.go !== "meeting") setStatus("이 메뉴는 다음 단계에서 만들어요."); };
  });

  renderParas();
})();
