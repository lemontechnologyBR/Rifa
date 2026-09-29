/**
 * Banner "Instalar app" — só na index do tenant.
 * Mostra em viewport estreita / touch (funciona no DevTools) + beforeinstallprompt no Android.
 */
(function () {
  var cfg = window.__PWA_INSTALL__;
  if (!cfg || !cfg.enabled) return;

  var STORAGE_KEY = 'pwa_install_dismiss_v2_' + (cfg.slug || 'platform');
  var DISMISS_DAYS = 7;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function wasDismissed() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var until = Number(raw);
      if (!Number.isFinite(until) || Date.now() > until) {
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function isIos() {
    var ua = window.navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function shouldOfferInstall() {
    if (isStandalone()) return false;
    var ua = window.navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    // DevTools / janela estreita
    if (window.matchMedia('(max-width: 900px)').matches) return true;
    if (window.innerWidth <= 900) return true;
    return false;
  }

  var deferredPrompt = null;
  var bar = null;
  var iosSheet = null;

  function hideBar() {
    if (!bar) return;
    bar.classList.remove('is-visible');
    bar.setAttribute('hidden', '');
    bar.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('pwa-install-visible');
  }

  function showBar() {
    if (!bar || wasDismissed() || isStandalone()) return;
    bar.removeAttribute('hidden');
    bar.setAttribute('aria-hidden', 'false');
    bar.classList.add('is-visible');
    document.documentElement.classList.add('pwa-install-visible');
  }

  function showHelpSheet() {
    if (!iosSheet) return;
    var iosSteps = iosSheet.querySelectorAll('.pwa-install-step-ios');
    var andSteps = iosSheet.querySelectorAll('.pwa-install-step-android');
    var showIos = isIos();
    iosSteps.forEach(function (el) { el.hidden = !showIos; });
    andSteps.forEach(function (el) { el.hidden = showIos; });
    iosSheet.removeAttribute('hidden');
    iosSheet.classList.add('is-visible');
  }

  function hideHelpSheet() {
    if (!iosSheet) return;
    iosSheet.setAttribute('hidden', '');
    iosSheet.classList.remove('is-visible');
  }

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + DISMISS_DAYS * 864e5));
    } catch (_) { /* ignore */ }
    hideBar();
    hideHelpSheet();
  }

  function onInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        deferredPrompt = null;
        if (choice && choice.outcome === 'accepted') hideBar();
        else dismiss();
      }).catch(function () {
        deferredPrompt = null;
      });
      return;
    }
    showHelpSheet();
  }

  function bind() {
    bar = document.getElementById('pwa-install-bar');
    iosSheet = document.getElementById('pwa-install-ios');
    if (!bar) return;

    var btn = document.getElementById('pwa-install-btn');
    var dismissBtn = document.getElementById('pwa-install-dismiss');
    var iosClose = document.getElementById('pwa-install-ios-close');
    var iosOk = document.getElementById('pwa-install-ios-ok');

    if (btn) btn.addEventListener('click', onInstallClick);
    if (dismissBtn) dismissBtn.addEventListener('click', dismiss);
    if (iosClose) iosClose.addEventListener('click', hideHelpSheet);
    if (iosOk) iosOk.addEventListener('click', function () {
      hideHelpSheet();
      dismiss();
    });
    if (iosSheet) {
      iosSheet.addEventListener('click', function (e) {
        if (e.target === iosSheet) hideHelpSheet();
      });
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      showBar();
    });

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      hideBar();
      try { localStorage.setItem(STORAGE_KEY, String(Date.now() + 365 * 864e5)); } catch (_) { /* ignore */ }
    });

    if (shouldOfferInstall()) {
      // imediato + reforço (caso CSS/layout atrase)
      showBar();
      setTimeout(showBar, 400);
      setTimeout(showBar, 1200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
