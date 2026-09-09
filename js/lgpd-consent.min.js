(function () {
  var CONSENT_KEY = "jgm4_cookie_consent";
  var PREF_KEY = "jgm4_cookie_preferences";
  var VERSION = "2026-05-11";

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function parsePreferences() {
    var raw = read(PREF_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function getConsentMode() {
    var status = read(CONSENT_KEY);
    var prefs = parsePreferences();

    if (status === "accepted") {
      return { analytics: true, marketing: true };
    }

    if (status === "custom" && prefs) {
      return {
        analytics: prefs.analytics === true,
        marketing: prefs.marketing === true
      };
    }

    return { analytics: false, marketing: false };
  }

  function consentPayload(mode) {
    return {
      "analytics_storage": mode.analytics ? "granted" : "denied",
      "ad_storage": mode.marketing ? "granted" : "denied",
      "ad_user_data": mode.marketing ? "granted" : "denied",
      "ad_personalization": mode.marketing ? "granted" : "denied",
      "functionality_storage": "granted",
      "security_storage": "granted"
    };
  }

  function applyConsent(command, mode) {
    var payload = consentPayload(mode);
    if (command === "default") payload.wait_for_update = 500;
    window.gtag("consent", command, payload);
    window.jgm4Consent = {
      version: VERSION,
      analytics: mode.analytics,
      marketing: mode.marketing,
      necessary: true
    };
  }

  applyConsent("default", getConsentMode());

  function saveConsent(status, prefs) {
    write(CONSENT_KEY, status);
    write(PREF_KEY, JSON.stringify({
      version: VERSION,
      updatedAt: new Date().toISOString(),
      necessary: true,
      analytics: !!prefs.analytics,
      marketing: !!prefs.marketing
    }));
    applyConsent("update", { analytics: !!prefs.analytics, marketing: !!prefs.marketing });
    window.gtag("event", "cookie_consent_update", {
      event_category: "privacy",
      event_label: status,
      analytics_consent: !!prefs.analytics,
      marketing_consent: !!prefs.marketing
    });
  }

  function policyUrl() {
    return "https://www.jgm4consultoria.com.br/pages/politica.html";
  }

  function injectStyles() {
    if (document.getElementById("jgm4-consent-style")) return;
    var css = ""
      + ".jgm4-consent{position:fixed;left:18px;right:18px;bottom:18px;z-index:99999;display:none;max-width:980px;margin:0 auto;padding:18px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(4,16,36,.96);box-shadow:0 18px 60px rgba(0,0,0,.38);color:#fff;font-family:Inter,Arial,sans-serif;gap:18px;align-items:center;backdrop-filter:blur(10px)}"
      + ".jgm4-consent.is-visible{display:flex}"
      + ".jgm4-consent__text{flex:1;min-width:240px}"
      + ".jgm4-consent__text strong{display:block;margin-bottom:4px;color:#fff;font-size:15px}"
      + ".jgm4-consent__text p{margin:0;color:rgba(255,255,255,.76);font-size:13.5px;line-height:1.55}"
      + ".jgm4-consent__text a{color:#7dd3fc;font-weight:800;text-decoration:none}"
      + ".jgm4-consent__text a:hover{text-decoration:underline}"
      + ".jgm4-consent__actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end}"
      + ".jgm4-consent__btn{appearance:none;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:10px 14px;background:rgba(255,255,255,.08);color:#fff;font:800 13px Inter,Arial,sans-serif;cursor:pointer;transition:transform .14s,filter .14s,background .14s}"
      + ".jgm4-consent__btn:hover{transform:translateY(-1px);filter:brightness(1.08)}"
      + ".jgm4-consent__btn--accept{border-color:#E10616;background:linear-gradient(135deg,#E10616,#ff3b4a)}"
      + ".jgm4-consent__btn--ghost{background:transparent}"
      + ".jgm4-consent-settings{position:fixed;left:18px;bottom:18px;z-index:9998;border:1px solid rgba(255,255,255,.22);border-radius:9px;padding:8px 11px;background:rgba(4,16,36,.88);color:rgba(255,255,255,.78);font:700 11px Inter,Arial,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.22)}"
      + ".jgm4-consent-settings[hidden]{display:none}"
      + ".jgm4-modal{position:fixed;inset:0;z-index:100000;display:none;place-items:center;padding:18px;background:rgba(0,0,0,.62);font-family:Inter,Arial,sans-serif}"
      + ".jgm4-modal.is-visible{display:grid}"
      + ".jgm4-modal__box{width:min(560px,100%);border:1px solid rgba(255,255,255,.14);border-radius:14px;background:#071A38;color:#fff;box-shadow:0 24px 70px rgba(0,0,0,.45);padding:22px}"
      + ".jgm4-modal__box h2{margin:0 0 8px;font-size:20px;line-height:1.2}"
      + ".jgm4-modal__box p{margin:0 0 16px;color:rgba(255,255,255,.74);font-size:14px;line-height:1.55}"
      + ".jgm4-option{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 0;border-top:1px solid rgba(255,255,255,.10)}"
      + ".jgm4-option strong{display:block;font-size:14px;margin-bottom:4px}"
      + ".jgm4-option span{display:block;color:rgba(255,255,255,.68);font-size:12.5px;line-height:1.45}"
      + ".jgm4-switch{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;color:rgba(255,255,255,.82);font-size:13px;font-weight:800}"
      + ".jgm4-switch input{width:20px;height:20px;accent-color:#2EA7FF}"
      + ".jgm4-modal__actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}"
      + "@media(max-width:720px){.jgm4-consent{left:12px;right:12px;bottom:12px;flex-direction:column;align-items:stretch}.jgm4-consent__actions{width:100%;flex-direction:column}.jgm4-consent__btn{width:100%}.jgm4-modal__actions{flex-direction:column}.jgm4-modal__actions .jgm4-consent__btn{width:100%}.jgm4-consent-settings{left:12px;bottom:84px}}";
    var style = document.createElement("style");
    style.id = "jgm4-consent-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function removeLegacyBanners() {
    var legacy = document.querySelectorAll("#cookieBanner, .cookie-banner");
    legacy.forEach(function (el) {
      if (!el.classList.contains("jgm4-consent")) el.remove();
    });
  }

  function buildBanner() {
    removeLegacyBanners();
    if (document.getElementById("jgm4ConsentBanner")) return;

    var banner = document.createElement("div");
    banner.className = "jgm4-consent";
    banner.id = "jgm4ConsentBanner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", "Preferências de cookies e privacidade");
    banner.innerHTML = ''
      + '<div class="jgm4-consent__text">'
      + '<strong>Controle de cookies e privacidade</strong>'
      + '<p>Usamos tecnologias essenciais para o funcionamento do site e, com sua autorização, ferramentas de análise e publicidade para entender o uso da JGM4 e melhorar nossos serviços. Você pode aceitar, rejeitar ou ajustar suas preferências a qualquer momento. <a href="' + policyUrl() + '">Política de Privacidade</a>.</p>'
      + '</div>'
      + '<div class="jgm4-consent__actions">'
      + '<button class="jgm4-consent__btn jgm4-consent__btn--ghost" type="button" data-consent="reject">Apenas necessários</button>'
      + '<button class="jgm4-consent__btn" type="button" data-consent="customize">Personalizar</button>'
      + '<button class="jgm4-consent__btn jgm4-consent__btn--accept" type="button" data-consent="accept">Aceitar todos</button>'
      + '</div>';

    var modal = document.createElement("div");
    modal.className = "jgm4-modal";
    modal.id = "jgm4ConsentModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Personalizar cookies");
    modal.innerHTML = ''
      + '<div class="jgm4-modal__box">'
      + '<h2>Personalizar cookies</h2>'
      + '<p>Você pode alterar sua decisão depois limpando os dados do navegador ou voltando à política de privacidade. Cookies necessários ficam sempre ativos.</p>'
      + '<div class="jgm4-option"><div><strong>Necessários</strong><span>Segurança, preferências de consentimento e funcionamento básico do site.</span></div><label class="jgm4-switch"><input type="checkbox" checked disabled> Ativo</label></div>'
      + '<div class="jgm4-option"><div><strong>Análise</strong><span>Medição de visitas, páginas acessadas, eventos e desempenho dos conteúdos.</span></div><label class="jgm4-switch"><input type="checkbox" id="jgm4Analytics"> Permitir</label></div>'
      + '<div class="jgm4-option"><div><strong>Publicidade</strong><span>Medição de campanhas, conversões e melhoria dos anúncios no Google Ads.</span></div><label class="jgm4-switch"><input type="checkbox" id="jgm4Marketing"> Permitir</label></div>'
      + '<div class="jgm4-modal__actions">'
      + '<button class="jgm4-consent__btn jgm4-consent__btn--ghost" type="button" data-consent="modal-close">Voltar</button>'
      + '<button class="jgm4-consent__btn" type="button" data-consent="modal-save">Salvar escolhas</button>'
      + '<button class="jgm4-consent__btn jgm4-consent__btn--accept" type="button" data-consent="accept">Aceitar todos</button>'
      + '</div>'
      + '</div>';

    document.body.appendChild(banner);
    document.body.appendChild(modal);

    var settings = document.createElement("button");
    settings.type = "button";
    settings.className = "jgm4-consent-settings";
    settings.textContent = "Preferências de cookies";
    settings.setAttribute("data-consent", "settings");
    settings.setAttribute("aria-label", "Abrir preferências de cookies");
    document.body.appendChild(settings);

    var current = getConsentMode();
    var analytics = document.getElementById("jgm4Analytics");
    var marketing = document.getElementById("jgm4Marketing");
    if (analytics) analytics.checked = current.analytics;
    if (marketing) marketing.checked = current.marketing;

    function hideAll() {
      banner.classList.remove("is-visible");
      modal.classList.remove("is-visible");
      settings.hidden = false;
    }

    function openPreferences() {
      if (analytics) analytics.checked = getConsentMode().analytics;
      if (marketing) marketing.checked = getConsentMode().marketing;
      modal.classList.add("is-visible");
      settings.hidden = true;
    }

    document.addEventListener("click", function (event) {
      var action = event.target && event.target.getAttribute("data-consent");
      if (!action) return;

      if (action === "reject") {
        saveConsent("rejected", { analytics: false, marketing: false });
        hideAll();
      }

      if (action === "accept") {
        saveConsent("accepted", { analytics: true, marketing: true });
        hideAll();
      }

      if (action === "customize") {
        openPreferences();
      }

      if (action === "settings") {
        openPreferences();
      }

      if (action === "modal-close") {
        modal.classList.remove("is-visible");
        settings.hidden = false;
      }

      if (action === "modal-save") {
        saveConsent("custom", {
          analytics: !!(analytics && analytics.checked),
          marketing: !!(marketing && marketing.checked)
        });
        hideAll();
      }
    });

    if (!read(CONSENT_KEY)) {
      banner.classList.add("is-visible");
      settings.hidden = true;
    }
  }

  window.jgm4OpenCookiePreferences = function () {
    var settings = document.querySelector(".jgm4-consent-settings");
    if (settings) settings.click();
  };

  window.jgm4ResetCookieConsent = function () {
    try {
      localStorage.removeItem(CONSENT_KEY);
      localStorage.removeItem(PREF_KEY);
    } catch (e) {}
    applyConsent("update", { analytics: false, marketing: false });
    buildBanner();
    var banner = document.getElementById("jgm4ConsentBanner");
    if (banner) banner.classList.add("is-visible");
    var settings = document.querySelector(".jgm4-consent-settings");
    if (settings) settings.hidden = true;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      injectStyles();
      buildBanner();
    });
  } else {
    injectStyles();
    buildBanner();
  }
})();
