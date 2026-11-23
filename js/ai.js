/* =========================================================
   MeetKNOT.Ai — AI 요약 (Google Gemini) · 요약 목록
   ========================================================= */
(function () {
  const MK = window.MK;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // 먼저 시도할 모델 (최신 순). 키로 쓸 수 있는 모델 목록을 받아서 자동으로 보충한다.
  const PREFERRED = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const API = "https://generativelanguage.googleapis.com/v1beta/models";
  const SKIP = /image|tts|live|audio|embedding|vision|aqa|native|robotics|computer|learnlm|gemma/i;
  const modelCache = {};

  // 숫자 버전 비교용: gemini-3.8-flash → 3.8
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);

  async function modelOrder(key) {
    if (modelCache[key]) return modelCache[key];
    let available = null;
    try {
      const res = await fetch(API + "?pageSize=1000", { headers: { "x-goog-api-key": key } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(data.error?.message || "")) {
        throw new Error("API 키가 올바르지 않아요. 설정에서 키를 다시 확인해 주세요.");
      }
      if (res.ok && data.models) {
        available = data.models
          .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
          .map((m) => m.name.replace("models/", ""))
          .filter((n) => n.startsWith("gemini-") && !SKIP.test(n));
      }
    } catch (e) {
      if (/API 키/.test(e.message)) throw e;
    }
    let order;
    if (available && available.length) {
      const first = PREFERRED.filter((n) => available.includes(n));
      // 나머지: flash → pro 순, 최신 버전 먼저, 미리보기(preview/exp)는 뒤로
      const rest = available
        .filter((n) => !first.includes(n))
        .sort((x, y) => {
          const px = /preview|exp/.test(x), py = /preview|exp/.test(y);
          if (px !== py) return px ? 1 : -1;
          const fx = /flash/.test(x), fy = /flash/.test(y);
          if (fx !== fy) return fx ? -1 : 1;
          return ver(y) - ver(x);
        });
      order = first.concat(rest).slice(0, 8);
    } else {
      order = PREFERRED.slice();
    }
    modelCache[key] = order;
    return order;
  }

  function buildPrompt(m) {
    const body = m.paragraphs.map((p, i) => `[단락 ${i + 1} · ${p.time}] ${p.text}`).join("\n");
    return `너는 한국 회사의 유능한 회의록 작성 비서야.
아래 회의 기록을 바탕으로 자세하고 긴 회의 요약본을 한국어로 작성해줘.

규칙
- 음성 인식으로 받아 적은 글이라 오타, 끊긴 말, 반복이 있을 수 있어. 문맥에 맞게 자연스럽게 다듬어서 이해해줘.
- 기록에 없는 내용은 지어내지 마. 불확실한 것은 "확인 필요"라고 적어줘.
- 마크다운 기호(#, *, **)는 쓰지 말고, 아래 형식 그대로 써줘.
- 짧게 줄이지 말고, 논의된 내용을 빠짐없이 충분히 길게 정리해줘.

형식
■ 회의 개요
- 회의명 / 일시 / 장소 / 참석자

■ 한눈에 보는 요약
(3~5문장)

■ 안건별 논의 내용
1. (안건 또는 주제)
 - 논의 내용을 자세히
 - 나온 의견과 근거

■ 결정 사항
-

■ 할 일 (담당자 · 기한)
-

■ 추가 확인이 필요한 사항
-

회의 정보
회의명: ${m.title}
일시: ${MK.fmtDate(m.date)}
장소: ${m.place || "기록 없음"}
참석자: ${m.attendees.length ? m.attendees.join(", ") : "기록 없음"}
안건:
${m.agenda || "기록 없음"}

회의 기록
${body}`;
  }

  async function callGemini(prompt, key) {
    const models = await modelOrder(key);
    const errors = [];
    for (const model of models) {
      const gen = { temperature: 0.4, maxOutputTokens: 16384 };
      if (model.startsWith("gemini-2.5")) gen.thinkingConfig = { thinkingBudget: 0 };
      let res, data;
      try {
        res = await fetch(API + "/" + model + ":generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: gen }),
        });
        data = await res.json().catch(() => ({}));
      } catch (e) {
        errors.push(model + ": 인터넷 연결 문제");
        continue;
      }
      if (res.ok) {
        const parts = data.candidates?.[0]?.content?.parts || [];
        const text = parts.filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
        if (text) return { text, model };
        errors.push(model + ": 결과가 비어 있음");
        continue;
      }
      const msg = data.error?.message || "";
      if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) throw new Error("API 키가 올바르지 않아요. 설정에서 키를 다시 확인해 주세요.");
      if (res.status === 403) throw new Error("이 API 키로는 Gemini를 쓸 수 없어요. 설정에서 키를 확인해 주세요.\n(" + msg.slice(0, 120) + ")");
      errors.push(`${model}: ${res.status} ${msg.slice(0, 120)}`);
    }
    delete modelCache[key]; // 다음에는 목록을 새로 받아옴
    const hint = errors.some((e) => /: 429/.test(e))
      ? "\n\n사용량 한도에 걸렸어요. 잠시 뒤 다시 하거나, AI Studio에서 결제 계정을 연결해 주세요."
      : "";
    throw new Error("요약하지 못했어요. 첫 번째 원인:\n" + (errors[0] || "알 수 없음") + `\n(시도한 모델 ${errors.length}개)` + hint);
  }

  // ---------- 요약 중 표시 ----------
  const busyOn = (on) => $("aiBusy").classList.toggle("hidden", !on);

  // 회의 하나를 요약해서 요약 목록에 저장
  MK.summarize = async (meeting) => {
    const key = MK.apiKey();
    if (!key) {
      const go = await MK.ask("API 키가 필요해요", "AI 요약을 하려면 설정에서 Gemini API 키를 먼저 넣어주세요.", [
        { label: "나중에", value: false },
        { label: "설정으로", value: true, main: true },
      ]);
      if (go) MK.go("setting", { direct: true });
      return null;
    }
    if (!meeting.paragraphs.length) { await MK.ask("요약할 내용이 없어요", "단락이 하나 이상 있어야 요약할 수 있어요.", [{ label: "확인", value: 1, main: true }]); return null; }
    busyOn(true);
    try {
      const r = await callGemini(buildPrompt(meeting), key);
      const s = {
        id: "s" + Date.now(),
        meetingId: meeting.id,
        title: meeting.title,
        date: meeting.date,
        model: r.model,
        text: r.text,
        createdAt: new Date().toISOString(),
      };
      MK.addSummary(s);
      busyOn(false);
      const see = await MK.ask("요약 완료!", `"${meeting.title}" 요약본을 요약 목록에 저장했어요.`, [
        { label: "닫기", value: false },
        { label: "요약 보기", value: true, main: true },
      ]);
      if (see) { MK.openSummaryId = s.id; MK.go("ai", { direct: true }); }
      return s;
    } catch (e) {
      busyOn(false);
      await MK.ask("요약하지 못했어요", e.message, [{ label: "확인", value: 1, main: true }]);
      return null;
    }
  };

  // API 키 확인 (설정 화면에서 사용)
  MK.testKey = async (key) => {
    const r = await callGemini("'확인'이라고 한 단어로만 대답해.", key);
    return r.model;
  };

  // ---------- 요약 목록 화면 ----------
  MK.showSummaries = () => {
    if (MK.openSummaryId) { const id = MK.openSummaryId; MK.openSummaryId = null; return openSummary(id); }
    $("sumDetail").classList.add("hidden");
    $("sumListWrap").classList.remove("hidden");
    const list = MK.summaries();
    const box = $("sumList");
    if (!list.length) {
      box.innerHTML = '<div class="empty-card">아직 요약본이 없어요.<br>회의 목록에서 회의를 열고 "AI 요약"을 눌러보세요.</div>';
      return;
    }
    box.innerHTML = "";
    list.forEach((s) => {
      const el = document.createElement("button");
      el.className = "note-item ai";
      el.innerHTML = `<div class="n-title">${esc(s.title)}</div><div class="n-sub">${MK.fmtDate(s.date)} · 요약 ${MK.fmtDate(s.createdAt).slice(-5)}</div>`;
      el.onclick = () => openSummary(s.id);
      box.appendChild(el);
    });
  };

  function openSummary(id) {
    const s = MK.summaries().find((x) => x.id === id);
    if (!s) return MK.showSummaries();
    $("sumListWrap").classList.add("hidden");
    const d = $("sumDetail");
    d.classList.remove("hidden");
    d.querySelector(".d-body").innerHTML = `
      <h2 class="d-title">${esc(s.title)}</h2>
      <div class="d-sub">${MK.fmtDate(s.date)} · ${esc(s.model)}로 요약</div>
      <div class="d-text sum-text">${esc(s.text)}</div>`;
    d.querySelector(".d-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(s.title + "\n\n" + s.text); MK.ask("복사했어요", "요약본을 복사했어요. 원하는 곳에 붙여넣으세요.", [{ label: "확인", value: 1, main: true }]); }
      catch (e) { MK.ask("복사하지 못했어요", "글을 길게 눌러 직접 복사해 주세요.", [{ label: "확인", value: 1, main: true }]); }
    };
    d.querySelector(".d-del").onclick = async () => {
      const ok = await MK.ask("요약 삭제", `"${s.title}" 요약본을 삭제할까요?\n삭제하면 되돌릴 수 없어요.`, [
        { label: "취소", value: false },
        { label: "삭제", value: true, main: true },
      ]);
      if (ok) { MK.deleteSummary(s.id); MK.showSummaries(); }
    };
    window.scrollTo(0, 0);
  }

  $("sumBack").onclick = () => MK.showSummaries();
})();
