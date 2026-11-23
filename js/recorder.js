/* =========================================================
   MeetKNOT.Ai — 녹음(음성 → 글자) 엔진
   - 실시간 글자 표시
   - 같은 문장 반복 방지
   - 조용해도 자동으로 다시 듣기 (긴 발표도 계속)
   - 화면 꺼짐 방지
   ========================================================= */
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // 공백 정리
  const clean = (t) => (t || "").replace(/\s+/g, " ").trim();

  // 한 번의 듣기 안에서 나온 확정 문장들을 합친다.
  // (안드로이드 크롬은 앞 문장을 다시 포함해서 보내는 경우가 있어 겹침을 걸러낸다)
  function mergeFinals(list) {
    let out = "";
    for (let t of list) {
      t = clean(t);
      if (!t) continue;
      if (!out) { out = t; continue; }
      if (t.startsWith(out)) { out = t; continue; }          // 누적형: 새것이 앞부분을 포함
      if (out.endsWith(t)) continue;                          // 똑같은 꼬리 반복
      if (t.length >= 6 && out.includes(t)) continue;         // 긴 문장 통째 반복
      out = joinNoOverlap(out, t);
    }
    return out;
  }

  // a 끝과 b 앞이 겹치면 겹친 부분을 한 번만 남긴다
  function joinNoOverlap(a, b) {
    const max = Math.min(60, a.length, b.length);
    for (let k = max; k >= 6; k--) {
      if (a.slice(-k) === b.slice(0, k)) return clean(a + b.slice(k));
    }
    return a + " " + b;
  }

  class Recorder {
    constructor(opts) {
      this.onText = opts.onText || (() => {});      // (확정글, 임시글)
      this.onState = opts.onState || (() => {});    // ("on" | "off" | "error", 메시지)
      this.onInfo = opts.onInfo || (() => {});      // 진단 정보
      this.lang = opts.lang || "ko-KR";
      this.supported = !!SR;
      this.want = false;          // 사용자가 녹음 중으로 원하는가
      this.rec = null;
      this.committed = "";        // 이번 녹음에서 확정된 글
      this.sessionFinal = "";     // 현재 듣기 회차의 확정 글
      this.interim = "";          // 아직 확정 안 된 글 (회색)
      this.restarts = 0;
      this.lastStart = 0;
      this.fastFails = 0;
      this.wakeLock = null;
      this.watchdog = null;
      this.lastEvent = 0;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.want) {
          this.keepScreenOn();
          if (!this.rec) this.startSession();
        }
      });
    }

    start() {
      if (!this.supported) {
        this.onState("error", "이 브라우저는 음성 인식을 지원하지 않아요. 크롬으로 열어주세요.");
        return;
      }
      if (this.want) return;
      this.want = true;
      this.committed = "";
      this.sessionFinal = "";
      this.interim = "";
      this.restarts = 0;
      this.fastFails = 0;
      this.keepScreenOn();
      this.startSession();
      this.onState("on");
      // 15초 동안 아무 반응이 없으면 다시 듣기 시작 (멈춤 방지)
      clearInterval(this.watchdog);
      this.watchdog = setInterval(() => {
        if (this.want && Date.now() - this.lastEvent > 15000) {
          this.lastEvent = Date.now();
          try { this.rec && this.rec.abort(); } catch (e) {}
        }
      }, 3000);
    }

    // 녹음을 멈추고 최종 글을 돌려준다
    stop() {
      return new Promise((resolve) => {
        this.want = false;
        clearInterval(this.watchdog);
        this.releaseScreen();
        const finish = () => {
          this.commitSession(true);
          const text = this.committed;
          this.rec = null;
          this.onText(text, "");
          this.onState("off");
          resolve(text);
        };
        if (!this.rec) return finish();
        const r = this.rec;
        let done = false;
        const once = () => { if (!done) { done = true; finish(); } };
        r.onend = once;
        setTimeout(once, 1500); // 응답이 늦어도 1.5초 뒤에는 끝낸다
        try { r.stop(); } catch (e) { once(); }
      });
    }

    startSession() {
      const r = new SR();
      r.lang = this.lang;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      this.rec = r;
      this.sessionFinal = "";
      this.interim = "";
      this.lastStart = Date.now();
      this.lastEvent = Date.now();

      r.onresult = (e) => {
        this.lastEvent = Date.now();
        const finals = [];
        let interim = "";
        // 매번 처음부터 다시 계산 → 같은 글이 두 번 붙지 않음
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finals.push(res[0].transcript);
          else interim += res[0].transcript;
        }
        this.sessionFinal = mergeFinals(finals);
        interim = clean(interim);
        // 임시 글이 이미 확정된 글과 같으면 숨김
        if (interim && this.sessionFinal.endsWith(interim)) interim = "";
        this.interim = interim;
        this.onText(this.joinCommitted(this.sessionFinal), this.interim);
      };

      r.onerror = (e) => {
        this.lastEvent = Date.now();
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          this.want = false;
          clearInterval(this.watchdog);
          this.releaseScreen();
          this.onState("error", "마이크 사용이 막혀 있어요. 주소창 왼쪽 자물쇠 → 권한 → 마이크 '허용'으로 바꿔주세요.");
        } else if (e.error === "network") {
          this.onInfo("인터넷 연결이 불안정해요. 다시 연결 중…");
        }
        // no-speech, aborted 등은 조용히 다시 듣기
      };

      r.onend = () => {
        this.commitSession(false);
        this.rec = null;
        if (!this.want) return;
        // 너무 빨리 계속 끊기면 조금 쉬었다가 다시
        const lived = Date.now() - this.lastStart;
        this.fastFails = lived < 1000 ? this.fastFails + 1 : 0;
        const wait = this.fastFails > 3 ? 1000 : 150;
        this.restarts++;
        this.onInfo("자동 재연결 " + this.restarts + "회");
        setTimeout(() => { if (this.want && !this.rec) this.startSession(); }, wait);
      };

      try { r.start(); } catch (e) { /* 이미 시작된 경우 무시 */ }
    }

    // 현재 회차의 글을 확정 글에 붙인다 (겹침 제거)
    commitSession(includeInterim) {
      let add = this.sessionFinal;
      if (includeInterim && this.interim) add = mergeFinals([add, this.interim]);
      this.committed = this.joinCommitted(add);
      this.sessionFinal = "";
      this.interim = "";
    }

    joinCommitted(add) {
      add = clean(add);
      if (!add) return this.committed;
      if (!this.committed) return add;
      if (this.committed.endsWith(add)) return this.committed;   // 재연결 직후 같은 말 반복
      if (add.startsWith(this.committed)) return add;
      return joinNoOverlap(this.committed, add);
    }

    async keepScreenOn() {
      try {
        if ("wakeLock" in navigator && !this.wakeLock) {
          this.wakeLock = await navigator.wakeLock.request("screen");
          this.wakeLock.addEventListener("release", () => { this.wakeLock = null; });
        }
      } catch (e) {}
    }

    releaseScreen() {
      try { this.wakeLock && this.wakeLock.release(); } catch (e) {}
      this.wakeLock = null;
    }
  }

  window.MeetRecorder = Recorder;
})();
