/* =========================================================
   MeetKNOT.Ai — PDF 만들기 · PDF 목록 · 공유
   - PDF는 이 기기 안(IndexedDB)에 저장
   - 긴 회의도 한 쪽씩 그려서 만들기 때문에 폰에서도 멈추지 않음
   ========================================================= */
(function () {
  const MK = window.MK;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const p2 = (n) => String(n).padStart(2, "0");

  /* ---------------- 라이브러리는 필요할 때만 불러오기 ---------------- */
  let libs = null;
  function loadLibs() {
    if (libs) return libs;
    const add = (src) => new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => no(new Error("PDF 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요."));
      document.head.appendChild(s);
    });
    libs = Promise.all([add("js/vendor/jspdf.umd.min.js"), add("js/vendor/html2canvas.min.js")]).catch((e) => { libs = null; throw e; });
    return libs;
  }

  /* ---------------- PDF 보관함 (IndexedDB) ---------------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((ok, no) => {
      const r = indexedDB.open("meetknot", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("pdfs", { keyPath: "id" });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((ok, no) => {
      const t = d.transaction("pdfs", mode);
      const req = fn(t.objectStore("pdfs"));
      t.oncomplete = () => ok(req && req.result);
      t.onerror = () => no(t.error);
    });
  }
  const pdfPut = (rec) => tx("readwrite", (s) => s.put(rec));
  const pdfGet = (id) => tx("readonly", (s) => s.get(id));
  const pdfAll = () => tx("readonly", (s) => s.getAll());
  const pdfDel = (id) => tx("readwrite", (s) => s.delete(id));

  /* ---------------- 파일 이름: YYMMDDHHMM제목 ---------------- */
  MK.fileName = (meeting, suffix) => {
    const d = new Date(meeting.date);
    const stamp = String(d.getFullYear()).slice(2) + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes());
    let t = (meeting.title || "").replace(/^\d{4}\.\d{2}\.\d{2}\(.\)\s*\d{2}:\d{2}\s*/, "");
    t = t.replace(/[^\p{L}\p{N}_-]/gu, "") || "회의";
    return stamp + t + (suffix || "");
  };

  /* ---------------- 글을 쪽에 맞게 잘게 나누기 ---------------- */
  function splitText(text, max) {
    max = max || 260;
    const out = [];
    String(text || "").split("\n").forEach((line) => {
      if (!line.trim()) { out.push(""); return; }
      while (line.length > max) {
        let cut = line.lastIndexOf(" ", max);
        if (cut < max * 0.5) cut = max;
        out.push(line.slice(0, cut));
        line = line.slice(cut).trimStart();
      }
      out.push(line);
    });
    return out;
  }

  const PAGE_W = 680;                          // 그리는 폭(px)
  const PAGE_H = Math.floor(PAGE_W * 273 / 186); // A4에서 여백 12mm를 뺀 비율
  const CSS = `
    .pdfp{width:${PAGE_W}px;font-family:"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#1f2633;background:#fff;box-sizing:border-box}
    .pdfp *{box-sizing:border-box}
    .pb{padding:0 0 2px}
    .brand{text-align:right;font:900 13px "Arial Black",Arial,sans-serif;color:#1f2633;border-bottom:2px solid #1f2633;padding-bottom:6px;margin-bottom:12px}
    .h1{font-size:24px;font-weight:800;margin:2px 0 4px}
    .sub{font-size:13px;color:#5b6475;margin-bottom:10px}
    .info{font-size:14px;margin:2px 0}
    .info b{display:inline-block;width:56px;color:#3b6fc4}
    .sec{margin:16px 0 6px;font-size:15px;font-weight:800;color:#fff;background:#3b6fc4;border-radius:6px;padding:5px 10px}
    .sec.ai{background:#e0a400}
    .ph{font-size:12px;color:#8a93a3;margin-top:10px}
    .tx{font-size:14px;line-height:1.75;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}
    .tx.box{background:#f4f6fa;padding:2px 10px}
    .gap{height:8px}
  `;

  // 블록(조각) 목록 만들기
  function blocksFor(kind, meeting, summary) {
    const B = [];
    B.push(`<div class="h1">${esc(meeting.title)}${kind === "summary" ? " — AI 요약" : ""}</div>`);
    B.push(`<div class="sub">${esc(MK.fmtDate(meeting.date))}</div>`);
    if (meeting.place) B.push(`<div class="info"><b>장소</b>${esc(meeting.place)}</div>`);
    if (meeting.attendees && meeting.attendees.length) B.push(`<div class="info"><b>참석자</b>${esc(meeting.attendees.join(", "))}</div>`);
    if (meeting.agenda) {
      B.push(`<div class="sec">안건</div>`);
      splitText(meeting.agenda).forEach((l) => B.push(`<div class="tx box">${esc(l) || "&nbsp;"}</div>`));
    }
    if (summary) {
      B.push(`<div class="sec ai">AI 요약</div>`);
      splitText(summary.text).forEach((l) => B.push(l ? `<div class="tx">${esc(l)}</div>` : `<div class="gap"></div>`));
    }
    if (kind === "meeting") {
      B.push(`<div class="sec">회의 내용 (단락 ${meeting.paragraphs.length}개)</div>`);
      meeting.paragraphs.forEach((p, i) => {
        B.push(`<div class="ph">${i + 1}. ${p.type === "rec" ? "녹음" : "직접 입력"} · ${esc(p.time)}</div>`);
        splitText(p.text).forEach((l) => B.push(l ? `<div class="tx">${esc(l)}</div>` : `<div class="gap"></div>`));
      });
    }
    return B;
  }

  // 블록을 쪽 단위로 나누기 (실제 높이를 재서)
  function paginate(blocks, host) {
    const meas = document.createElement("div");
    meas.className = "pdfp";
    host.appendChild(meas);
    const heights = blocks.map((h) => {
      const w = document.createElement("div");
      w.className = "pb";
      w.innerHTML = h;
      meas.appendChild(w);
      return w.offsetHeight;
    });
    host.removeChild(meas);
    const brandH = 40;
    const pages = [];
    let cur = [], used = brandH;
    blocks.forEach((h, i) => {
      const bh = heights[i];
      // 제목 줄(sec, ph)이 쪽 끝에 혼자 남지 않게
      const isHead = /class="(sec|ph)/.test(h);
      const need = isHead ? bh + 60 : bh;
      if (cur.length && used + need > PAGE_H) { pages.push(cur); cur = []; used = brandH; }
      cur.push(h);
      used += bh;
    });
    if (cur.length) pages.push(cur);
    return pages;
  }

  /* ---------------- PDF 만들기 ---------------- */
  const busy = (t) => { $("pdfBusyText").textContent = t; $("pdfBusy").classList.remove("hidden"); };
  const idle = () => $("pdfBusy").classList.add("hidden");

  async function buildPdf(kind, meeting, summary) {
    await loadLibs();
    const { jsPDF } = window.jspdf;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-20000px;top:0;";
    host.innerHTML = `<style>${CSS}</style>`;
    document.body.appendChild(host);
    try {
      const pages = paginate(blocksFor(kind, meeting, summary), host);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      for (let i = 0; i < pages.length; i++) {
        busy(`PDF 만드는 중… (${i + 1} / ${pages.length}쪽)`);
        const page = document.createElement("div");
        page.className = "pdfp";
        page.style.height = PAGE_H + "px";
        page.innerHTML = `<div class="brand">MeetKNOT.Ai</div>` + pages[i].map((h) => `<div class="pb">${h}</div>`).join("");
        host.appendChild(page);
        const canvas = await window.html2canvas(page, { scale: 1.5, backgroundColor: "#ffffff", logging: false });
        host.removeChild(page);
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.75), "JPEG", 12, 12, 186, 273);
        pdf.setFontSize(8);
        pdf.setTextColor(140);
        pdf.text(`${i + 1} / ${pages.length}`, 105, 291, { align: "center" });
      }
      return { blob: pdf.output("blob"), pages: pages.length };
    } finally {
      document.body.removeChild(host);
    }
  }

  // kind: "meeting"(회의록) 또는 "summary"(요약본)
  MK.makePdf = async (kind, meeting, summary) => {
    if (MK.pdfBusy) return;
    MK.pdfBusy = true;
    busy("PDF 준비 중…");
    try {
      const { blob, pages } = await buildPdf(kind, meeting, summary);
      const name = MK.fileName(meeting, kind === "summary" ? "_요약" : "");
      const rec = { id: "p" + Date.now(), name, kind, meetingId: meeting.id, title: meeting.title, pages, size: blob.size, createdAt: new Date().toISOString(), blob };
      await pdfPut(rec);
      idle();
      const act = await MK.ask("PDF 저장 완료", `${name}.pdf\n${pages}쪽 · ${kb(blob.size)}\nPDF 목록에 저장했어요.`, [
        { label: "닫기", value: "" },
        { label: "내려받기", value: "down" },
        { label: "보내기", value: "send", main: true },
      ]);
      if (act === "down") download(rec);
      if (act === "send") sendPdf(rec);
    } catch (e) {
      idle();
      await MK.ask("PDF를 만들지 못했어요", e.message || String(e), [{ label: "확인", value: 1, main: true }]);
    }
    MK.pdfBusy = false;
  };

  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");

  function download(rec) {
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = rec.name + ".pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function sendPdf(rec) {
    const file = new File([rec.blob], rec.name + ".pdf", { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: rec.name }); } catch (e) { /* 사용자가 닫음 */ }
    } else {
      await MK.ask("바로 보내기가 안 돼요", "이 브라우저는 파일 보내기를 지원하지 않아요. 내려받은 뒤 카카오톡 등에서 파일로 보내주세요.", [{ label: "확인", value: 1, main: true }]);
      download(rec);
    }
  }

  /* ---------------- PDF 목록 화면 ---------------- */
  MK.showPdfs = async () => {
    const box = $("pdfList");
    box.innerHTML = '<div class="empty-card">불러오는 중…</div>';
    let list = [];
    try { list = await pdfAll(); } catch (e) {}
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (!list.length) {
      box.innerHTML = '<div class="empty-card">저장된 PDF가 없어요.<br>회의 목록이나 요약 목록에서 회의를 열고 "PDF"를 눌러보세요.</div>';
      return;
    }
    box.innerHTML = "";
    list.forEach((r) => {
      const el = document.createElement("div");
      el.className = "pdf-item";
      el.innerHTML = `
        <div class="n-title">${esc(r.name)}.pdf</div>
        <div class="n-sub">${r.kind === "summary" ? "AI 요약" : "회의록"} · ${r.pages}쪽 · ${kb(r.size)} · ${MK.fmtDate(r.createdAt)}</div>
        <div class="pdf-btns"><button class="btn send">보내기</button><button class="btn ghost down">내려받기</button><button class="btn danger del">삭제</button></div>`;
      el.querySelector(".send").onclick = async () => sendPdf(await pdfGet(r.id));
      el.querySelector(".down").onclick = async () => download(await pdfGet(r.id));
      el.querySelector(".del").onclick = async () => {
        const ok = await MK.ask("PDF 삭제", `${r.name}.pdf를 삭제할까요?\n회의 기록은 그대로 남아요.`, [
          { label: "취소", value: false },
          { label: "삭제", value: true, main: true },
        ]);
        if (ok) { await pdfDel(r.id); MK.showPdfs(); }
      };
      box.appendChild(el);
    });
  };

  /* ---------------- 글 공유 (카카오톡 · 문자 · 이메일) ---------------- */
  MK.shareText = async (title, text) => {
    const full = title + "\n\n" + text + "\n\n— MeetKNOT.Ai";
    const how = await MK.ask("공유하기", `"${title}"\n어디로 보낼까요?`, [
      { label: "카카오톡 등", value: "app", main: true },
      { label: "문자", value: "sms" },
      { label: "이메일", value: "mail" },
      { label: "복사", value: "copy" },
      { label: "취소", value: "" },
    ]);
    if (how === "app") {
      if (navigator.share) { try { await navigator.share({ title, text: full }); } catch (e) {} }
      else how2copy();
    } else if (how === "sms") {
      location.href = "sms:?body=" + encodeURIComponent(full);
    } else if (how === "mail") {
      location.href = "mailto:?subject=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(full);
    } else if (how === "copy") {
      how2copy();
    }
    async function how2copy() {
      try { await navigator.clipboard.writeText(full); MK.toast("복사했어요. 원하는 곳에 붙여넣으세요."); }
      catch (e) { MK.toast("복사하지 못했어요."); }
    }
  };

  // 회의록을 글로 만들기 (공유용)
  MK.meetingText = (m) => {
    const L = [MK.fmtDate(m.date)];
    if (m.place) L.push("장소: " + m.place);
    if (m.attendees.length) L.push("참석자: " + m.attendees.join(", "));
    if (m.agenda) L.push("\n[안건]\n" + m.agenda);
    L.push("\n[회의 내용]");
    m.paragraphs.forEach((p, i) => L.push(`${i + 1}. (${p.time}) ${p.text}`));
    return L.join("\n");
  };

  MK.pdfStore = { all: pdfAll };
})();
