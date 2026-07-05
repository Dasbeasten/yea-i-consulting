/* Yea I cookie consent + gated Microsoft Clarity loader.
   No non-essential cookies fire until the visitor clicks Accept.
   Reject means Clarity never loads. Choice is remembered and reversible.
   Clarity project ID xhmnlqqza3 is set below. */
(function () {
  "use strict";

  var CLARITY_ID = "xhmnlqqza3";
  var STORAGE_KEY = "yeai-consent";      // values: "accepted" | "rejected"
  var clarityLoaded = false;

  function readChoice() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function saveChoice(v) {
    try { localStorage.setItem(STORAGE_KEY, v); } catch (e) {}
  }

  // Small helper so page code can fire funnel events safely whether or not
  // Clarity is loaded. Calls are ignored until consent turns Clarity on.
  window.yeaiTrack = function (name) {
    try { if (window.clarity) window.clarity("event", name); } catch (e) {}
    try { if (window.gtag) window.gtag("event", name); } catch (e) {}
  };

  function loadClarity() {
    if (clarityLoaded || !CLARITY_ID || CLARITY_ID.indexOf("PASTE_") === 0) return;
    clarityLoaded = true;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", CLARITY_ID);
    try { window.clarity("consent"); } catch (e) {}
    // page-specific event, fired once Clarity is on
    if (document.body && document.body.getAttribute("data-page") === "diagnostic") {
      window.yeaiTrack("diagnostic_viewed");
    }
  }

  function hideBanner() {
    var b = document.getElementById("cookie-banner");
    if (b) b.parentNode.removeChild(b);
  }

  function accept() { saveChoice("accepted"); hideBanner(); loadClarity(); }
  function reject() { saveChoice("rejected"); hideBanner(); }

  function buildBanner() {
    var wrap = document.createElement("div");
    wrap.id = "cookie-banner";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Cookie choices");
    wrap.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:640px;" +
      "margin:0 auto;background:#0f2e2b;color:#f4f1ea;border-radius:14px;" +
      "padding:20px 22px;box-shadow:0 10px 40px rgba(0,0,0,.35);" +
      "font-family:inherit;font-size:.92rem;line-height:1.55;";
    wrap.innerHTML =
      '<p style="margin:0 0 14px">We use Microsoft Clarity to see how the site is used, ' +
      'which helps us make it better. It only runs if you agree. ' +
      'See our <a href="/cookies.html" style="color:#f4f1ea;text-decoration:underline">cookie policy</a>.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button id="ck-accept" style="flex:1;min-width:130px;cursor:pointer;border:0;border-radius:8px;' +
      'padding:11px 16px;font:inherit;font-weight:600;background:#f4f1ea;color:#0f2e2b">Accept</button>' +
      '<button id="ck-reject" style="flex:1;min-width:130px;cursor:pointer;border:1px solid rgba(244,241,234,.5);' +
      'border-radius:8px;padding:11px 16px;font:inherit;font-weight:600;background:transparent;color:#f4f1ea">Reject</button>' +
      '</div>';
    document.body.appendChild(wrap);
    document.getElementById("ck-accept").addEventListener("click", accept);
    document.getElementById("ck-reject").addEventListener("click", reject);
  }

  // let people change their mind later (required)
  window.yeaiOpenCookieSettings = function () {
    saveChoice("");
    if (!document.getElementById("cookie-banner")) buildBanner();
  };

  function addFooterSettingsLink() {
    try {
      if (document.getElementById("ck-settings-link")) return;
      var ck = document.querySelector('footer a[href^="/cookies"]');
      if (!ck) return;
      var link = document.createElement("a");
      link.id = "ck-settings-link";
      link.href = "#";
      link.textContent = "Cookie settings";
      if (ck.className) link.className = ck.className;
      var st = ck.getAttribute("style");
      if (st) link.setAttribute("style", st);
      link.addEventListener("click", function (e) { e.preventDefault(); window.yeaiOpenCookieSettings(); });
      ck.insertAdjacentElement("afterend", link);
      link.insertAdjacentText("beforebegin", " \u00b7 ");
    } catch (e) {}
  }

  function init() {
    addFooterSettingsLink();
    var choice = readChoice();
    if (choice === "accepted") { loadClarity(); return; }
    if (choice === "rejected") { return; }
    buildBanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
