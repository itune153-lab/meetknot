/* =========================================================
   MeetKNOT.Ai — 홈 화면 설치 (앱처럼 아이콘으로 실행)
   ========================================================= */
(function () {
  const MK = window.MK;
  const $ = (id) => document.getElementById(id);
  const VERSION = "1.0.0 (2026.11.23)";
  $("appVer").textContent = VERSION;

  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isInApp = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua);
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let deferred = null;

  // ---------- 서비스 워커 등록 (설치 조건 + 오프라인 대비) ----------
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }

  function refresh() {
    const text = $("installText");
    const btn = $("installBtn");
    btn.classList.add("hidden");
    if (isStandalone()) {
      text.textContent = "✓ 지금 홈 화면 앱으로 실행 중이에요.";
    } else if (isInApp) {
      text.textContent = "카카오톡 안에서는 설치할 수 없어요. 위쪽 노란 줄의 '크롬으로 열기'를 누른 뒤 다시 와주세요.";
    } else if (isIOS) {
      text.textContent = "Safari 아래쪽 공유 버튼(□↑) → '홈 화면에 추가'를 누르세요.";
    } else if (deferred) {
      text.textContent = "아래 버튼을 누르면 홈 화면에 MeetKNOT 아이콘이 생겨요. 아이콘으로 열면 주소창 없이 앱처럼 열려요.";
      btn.classList.remove("hidden");
    } else {
      text.textContent = "크롬 오른쪽 위 ⋮ 메뉴 → '홈 화면에 추가' 또는 '앱 설치'를 누르세요. 이미 설치했다면 홈 화면의 MeetKNOT 아이콘으로 열어주세요.";
    }
  }

  function showBanner() {
    const dismissed = localStorage.getItem("mk_install_dismiss") === "1";
    $("installBanner").classList.toggle("hidden", !deferred || dismissed || isStandalone());
  }

  async function install() {
    if (!deferred) { refresh(); return; }
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) {}
    deferred = null;
    showBanner();
    refresh();
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();      // 크롬 기본 안내 대신 앱 안의 버튼으로
    deferred = e;
    showBanner();
    refresh();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    showBanner();
    refresh();
    MK.toast && MK.toast("설치됐어요! 홈 화면의 MeetKNOT 아이콘으로 열어주세요.");
  });

  $("installBtn").onclick = install;
  $("installBanner").onclick = (e) => {
    if (e.target.tagName === "I") { localStorage.setItem("mk_install_dismiss", "1"); showBanner(); return; }
    install();
  };

  // 설정 화면이 열릴 때마다 안내 새로고침
  const orig = MK.showSetting;
  MK.showSetting = () => { orig && orig(); refresh(); };
  refresh();
})();
