(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function track(name, params) {
    try {
      if (typeof window.gtag === "function") window.gtag("event", name, params || {});
    } catch (e) {}
  }

  ready(function () {
    var checkout = document.querySelector(
      'a[href*="pay.kiwify.com.br"], a[href*="pay.hotmart.com"], a[href*="go.hotmart.com"]'
    );
    if (!checkout || document.getElementById("jgm4SalesBar")) return;

    var href = checkout.getAttribute("href");
    if (!href) return;

    var title = document.querySelector("h1");
    var label = "Garantir acesso";
    var pageName = title ? title.textContent.trim().replace(/\s+/g, " ").slice(0, 72) : "Oferta JGM4";

    var style = document.createElement("style");
    style.textContent = [
      ".jgm4-sales-bar{position:fixed;left:14px;right:14px;bottom:14px;z-index:99980;display:none;align-items:center;justify-content:space-between;gap:12px;max-width:920px;margin:0 auto;padding:12px 14px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(4,16,36,.94);box-shadow:0 18px 56px rgba(0,0,0,.38);backdrop-filter:blur(12px);color:#fff;font-family:Inter,Arial,sans-serif}",
      ".jgm4-sales-bar.is-visible{display:flex}",
      ".jgm4-sales-copy{min-width:0;display:grid;gap:2px}",
      ".jgm4-sales-copy strong{font-size:13.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".jgm4-sales-copy span{font-size:12px;color:rgba(255,255,255,.66)}",
      ".jgm4-sales-btn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:11px 16px;border-radius:11px;background:linear-gradient(135deg,#E10616,#ff3b4a);color:#fff;text-decoration:none;font-weight:900;font-size:13px;box-shadow:0 10px 28px rgba(225,6,22,.28)}",
      "@media(min-width:900px){.jgm4-sales-bar{left:50%;right:auto;transform:translateX(-50%);min-width:560px}}",
      "@media(max-width:420px){.jgm4-sales-copy strong{max-width:170px}.jgm4-sales-btn{padding:10px 12px}}"
    ].join("");
    document.head.appendChild(style);

    var bar = document.createElement("div");
    bar.className = "jgm4-sales-bar";
    bar.id = "jgm4SalesBar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Atalho para compra");
    bar.innerHTML =
      '<div class="jgm4-sales-copy"><strong>' + pageName.replace(/[<>&]/g, "") +
      '</strong><span>Acesso imediato + compra segura</span></div>' +
      '<a class="jgm4-sales-btn" href="' + href.replace(/"/g, "%22") +
      '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
    document.body.appendChild(bar);

    var button = bar.querySelector("a");
    button.addEventListener("click", function () {
      track("begin_checkout", {
        event_category: "sticky_sales_bar",
        event_label: window.location.pathname
      });
    });

    function update() {
      var show = window.scrollY > Math.max(360, window.innerHeight * 0.45);
      bar.classList.toggle("is-visible", show);
    }

    window.addEventListener("scroll", update, { passive: true });
    update();
  });
})();
