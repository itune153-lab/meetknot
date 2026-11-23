/* =========================================================
   MeetKNOT.Ai — 녹음(음성 → 글자) 엔진 v2
   - 실시간 글자 표시
   - 같은 문장 반복 방지
   - 끊기면 바로 다시 듣기 (작은 소리로 끊겨도 빨리 복구)
   - 안드로이드: 한 문장씩 듣고 바로 다시 듣는 안정 모드
   - 다시 듣기가 3초 안에 안 붙으면 새로 연결
   - 화면 꺼짐 방지, 진단 기록
   ========================================================= */
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const IS_ANDROID = /Android/i.test(navigator.userAgent);

  const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
  const hhmmss = () => new Date().toTimeString().slice(0, 8);

  // 한 번의 듣기 안에서 나온 확정 문장들을 합친다 (겹침 제거)
  function mergeFinals(list) {
    let out = "";
    for (let t of list) {
      t = clean(t);
      if (!t) continue;
      if (!out) { out = t; continue; }
      if (t.startsWith(out)) { out = t; continue; }
      if (out.endsWith(t)) continue;
      if (t.length >= 6 && out.includes(t)) continue;
      out = joinNoOverlap(out, t);
    }
    return out;
  }

  function joinNoOverlap(a, b) {
    const max = Math.min(60, a.length, b.length);
    for (let k = max; k >= 6; k--) {
      if (a.slice(-k) === b.slice(0, k)) return clean(a + b.slice(k));
    }
    return a + " " + b;
  }

  class Recorder {
    constructor(opts) {
      this.onText = opts.onText || (() => {});
      this.onState = opts.onState || (() => {});
      this.onDiag = opts.onDiag || (() => {});
      this.lang = opts.lang || "ko-KR";
      this.supported = !!SR;
      this.want = false;
      this.rec = null;
      this.live = false;          // 지금 실제로 듣고 있는가 (onstart 받음)
      this.committed = "";
      this.sessionFinal = "";
      this.interim = "";
      this.restarts = 0;
      this.lastStart = 0;
      this.fastFails = 0;
      this.lastEvent = 0;
      this.log = [];
      this.wakeLock = null;
      this.timer = null;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.want) {
          this.keepScreenOn();
          this.note("화면 다시 켜짐");
          this.kick();
        }
      });
    }

    // ---------- 진단 ----------
    note(msg) {
      this.log.push(hhmmss() + " " + msg);
      if (this.log.length > 4) this.log.shift();
      this.onDiag({
        mode: IS_ANDROID ? "안드로이드 안정 모드" : "연속 모드",
        state: this.want ? (this.live ? "듣는 중" : "연결 중") : "멈춤",
        restarts: this.restarts,
        log: this.log.slice(),
      });
    }

    start(initialText) {
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
      this.log = [];
      this.keepScreenOn();
      this.onState("on");
      this.note("녹음 시작");
      this.startSession();
      // 1초마다 상태 확인: 연결이 안 붙거나 멈춰 있으면 새로 연결
      clearInterval(this.timer);
      this.timer = setInterval(() => this.check(), 1000);
    }

    check() {
      if (!this.want) return;
      const idle = Date.now() - this.lastEvent;
      if (!this.rec) { this.kick(); return; }
      if (!this.live && idle > 3000) { this.note("연결 지연 → 새로 연결"); this.restartNow(); return; }
      if (this.live && idle > (IS_ANDROID ? 9000 : 15000)) { this.note("응답 없음 → 새로 연결"); this.restartNow(); }
    }

    kick() { if (this.want && !this.rec) this.startSession(); }

    restartNow() {
      const r = this.rec;
      this.commitSession(true);
      this.rec = null;
      this.live = false;
      if (r) {
        r.onend = r.onresult = r.onerror = r.onstart = null;
        try { r.abort(); } catch (e) {}
      }
      this.restarts++;
      setTimeout(() => this.kick(), 100);
    }

    stop() {
      return new Promise((resolve) => {
        this.want = false;
        clearInterval(this.timer);
        this.releaseScreen();
        const finish = () => {
          this.commitSession(true);
          const text = this.committed;
          this.rec = null;
          this.live = false;
          this.onText(text, "");
          this.onState("off");
          this.note("녹음 멈춤");
          resolve(text);
        };
        if (!this.rec) return finish();
        const r = this.rec;
        let done = false;
        const once = () => { if (!done) { done = true; r.onend = r.onerror = null; finish(); } };
        r.onend = once;
        setTimeout(once, 1500);
        try { r.stop(); } catch (e) { once(); }
      });
    }

    startSession() {
      const r = new SR();
      r.lang = this.lang;
      r.continuous = !IS_ANDROID;   // 안드로이드는 한 문장씩
      r.interimResults = true;
      r.maxAlternatives = 1;
      this.rec = r;
      this.live = false;
      this.sessionFinal = "";
      this.interim = "";
      this.lastStart = Date.now();
      this.lastEvent = Date.now();

      r.onstart = () => { this.live = true; this.lastEvent = Date.now(); this.note("듣기 시작"); };

      r.onresult = (e) => {
        this.lastEvent = Date.now();
        const finals = [];
        let interim = "";
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finals.push(res[0].transcript);
          else interim += res[0].transcript;
        }
        this.sessionFinal = mergeFinals(finals);
        interim = clean(interim);
        if (interim && this.sessionFinal.endsWith(interim)) interim = "";
        this.interim = interim;
        this.onText(this.joinCommitted(mergeFinals([this.sessionFinal])), this.interim);
      };

      r.onerror = (e) => {
        this.lastEvent = Date.now();
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          this.want = false;
          clearInterval(this.timer);
          this.releaseScreen();
          this.note("마이크 차단됨");
          this.onState("error", "마이크 사용이 막혀 있어요. 주소창 왼쪽 자물쇠 → 권한 → 마이크 '허용'으로 바꿔주세요.");
          return;
        }
        if (e.error !== "no-speech" && e.error !== "aborted") this.note("오류: " + e.error);
      };

      r.onend = () => {
        // 작은 소리라 확정이 안 된 말도 버리지 않고 저장
        this.commitSession(true);
        this.rec = null;
        this.live = false;
        if (!this.want) return;
        const lived = Date.now() - this.lastStart;
        this.fastFails = lived < 800 ? this.fastFails + 1 : 0;
        const wait = this.fastFails > 3 ? 800 : 60;
        this.restarts++;
        setTimeout(() => this.kick(), wait);
      };

      try { r.start(); } catch (e) { this.note("시작 실패 → 다시"); this.rec = null; setTimeout(() => this.kick(), 300); }
    }

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
      if (this.committed.endsWith(add)) return this.committed;
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
