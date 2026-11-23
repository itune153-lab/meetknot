/* =========================================================
   MeetKNOT.Ai — AI 요약 (Google Gemini) · 요약 목록
   ========================================================= */
(function () {
  const MK = window.MK;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // 앞에서부터 차례로 시도하고, 안 되면 다음 모델로 넘어감
  const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"];
  const API = "https://generativelanguage.googleapis.com/v1beta/models/";

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
    let lastErr = "";
    for (const model of MODELS) {
      const gen = { temperature: 0.4, maxOutputTokens: 8192 };
      if (model.startsWith("gemini-2.5")) gen.thinkingConfig = { thinkingBudget: 0 };
      let res, data;
      try {
        res = await fetch(API + model + ":generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: gen }),
        });
        data = await res.json().catch(() => ({}));
      } catch (e) {
        lastErr = "인터넷 연결을 확인해 주세요.";
        continue;
      }
      if (res.ok) {
        const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
        if (text) return { text, model };
        lastErr = "요약 결과가 비어 있어요.";
        continue;
      }
      const msg = data.error?.message || "";
      // 키 자체가 틀리면 다른 모델로 넘어가도 소용없음
      if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) throw new Error("API 키가 올바르지 않아요. 설정에서 키를 다시 확인해 주세요.");
      if (res.status === 403) throw new Error("이 API 키로는 Gemini를 쓸 수 없어요. 설정에서 키를 확인해 주세요.");
      lastErr = `${model}: ${res.status} ${msg.slice(0, 80)}`;
    }
    throw new Error("모든 모델에서 요약에 실패했어요.\n" + lastErr);
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
