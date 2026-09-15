/* ==================================================
   HEADER – EFEITO DE SCROLL (OTIMIZADO)
================================================== */
(() => {
  const header = document.getElementById('header');
  if (!header) return;

  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;

    requestAnimationFrame(() => {
      header.classList.toggle('scrolled', window.scrollY > 50);
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // aplica estado inicial
})();

/* ==================================================
   MENU HAMBURGUER (UMA ÚNICA VERSÃO)
================================================== */
function toggleMenu() {
  const nav = document.getElementById("navLinks");
  const btn = document.querySelector(".menu-toggle");
  if (!nav) return;

  const opening = !nav.classList.contains("active");
nav.classList.toggle("active", opening);
  document.body.classList.toggle("menu-open", opening);

  if (btn) btn.setAttribute("aria-expanded", String(opening));
}

function closeMenu() {
  const nav = document.getElementById("navLinks");
  const btn = document.querySelector(".menu-toggle");
  if (!nav) return;

  nav.classList.remove("active");;
  document.body.classList.remove("menu-open");

  if (btn) btn.setAttribute("aria-expanded", "false");
}

/* Necessário porque o HTML usa onclick */
window.toggleMenu = toggleMenu;
window.closeMenu = closeMenu;

/* Seletor de idioma dos artigos multilíngues.
   Usa captura para funcionar também em previews que interceptam links. */
document.addEventListener("DOMContentLoaded", () => {
  const languageGroups = [
    ["index.html", "index-en.html", "index-es.html"],
    ["consultoria.html", "logistics-consulting-brazil.html", "consultoria-logistica-brasil-es.html"],
    ["wms-importancia.html", "wms-implementation-brazil.html", "implementacion-wms-brasil.html"],
    ["custos-logisticos.html", "logistics-costs-brazil.html", "costos-logisticos-brasil.html"]
  ];
  const currentFile = window.location.pathname.split("/").pop().toLowerCase() || "index.html";
  const group = languageGroups.find((items) => items.includes(currentFile));

  if (group && !document.querySelector(".lang-switch")) {
    const host = document.querySelector(".bl-hero-wrap, .hero-box, .hero-text");
    if (host) {
      const labels = ["Português", "English", "Español"];
      const codes = ["pt-BR", "en", "es"];
      const switcherMarkup = document.createElement("div");
      switcherMarkup.className = "lang-switch";
      switcherMarkup.setAttribute("aria-label", "Choose article language");
      const languagePrompt = document.documentElement.lang.toLowerCase().startsWith("en")
        ? "Read in:"
        : document.documentElement.lang.toLowerCase().startsWith("es") ? "Leer en:" : "Leia em:";
      switcherMarkup.innerHTML = `<strong>${languagePrompt}</strong>${group.map((file, index) =>
        `<a ${file === currentFile ? 'class="active"' : ''} lang="${codes[index]}" hreflang="${codes[index]}" href="${file === 'index.html' ? './' : './' + file}">${labels[index]}</a>`
      ).join("")}`;
      host.insertBefore(switcherMarkup, host.firstChild);
    }
  }

  const switcher = document.querySelector(".lang-switch");
  if (!switcher) return;

  Object.assign(switcher.style, {
    display: "flex", alignItems: "center", justifyContent: "flex-end",
    gap: "7px", flexWrap: "wrap", marginBottom: "16px",
    fontSize: "12px", position: "relative", zIndex: "100", pointerEvents: "auto"
  });
  switcher.style.position = "relative";
  switcher.style.zIndex = "100";
  switcher.style.pointerEvents = "auto";

  switcher.querySelectorAll("a[href]").forEach((link) => {
    link.style.position = "relative";
    link.style.zIndex = "101";
    link.style.pointerEvents = "auto";
    link.style.cursor = "pointer";
    link.style.display = "inline-block";
    link.style.padding = "6px 10px";
    link.style.border = "1px solid rgba(255,255,255,.18)";
    link.style.borderRadius = "999px";
    if (link.classList.contains("active")) {
      link.style.background = "#2EA7FF";
      link.style.color = "#041024";
    }
  });

  const pageLanguage = document.documentElement.lang.toLowerCase();
  const foreignContact = pageLanguage.startsWith("en")
    ? "Hello, I would like to discuss logistics consulting for an operation in Brazil."
    : pageLanguage.startsWith("es")
      ? "Hola, me gustaría hablar sobre consultoría logística para una operación en Brasil."
      : "";
  if (foreignContact) {
    document.querySelectorAll('a[href*="diagnostico-logistico-online.html"]').forEach((link) => {
      link.href = `https://wa.me/5521996334768?text=${encodeURIComponent(foreignContact)}`;
      link.target = "_blank";
      link.rel = "noopener";
    });
  }
});

document.addEventListener("click", (event) => {
  const link = event.target.closest(".lang-switch a[href]");
  if (!link) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  window.location.assign(link.href);
}, true);

/* fecha ao clicar no fundo escuro */
document.addEventListener("click", (e) => {
  if (!document.body.classList.contains("menu-open")) return;

  const nav = document.getElementById("navLinks");
  const menuBtn = document.querySelector(".menu-toggle");
  if (!nav) return;

  const clickedInsideMenu = nav.contains(e.target);
  const clickedMenuButton = menuBtn && menuBtn.contains(e.target);

  if (!clickedInsideMenu && !clickedMenuButton) closeMenu();
}, { passive: true });

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

/* ==================================================
   SCROLL SUAVE PARA ÂNCORAS (COM OFFSET DO HEADER)
================================================== */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (!href || href.length <= 1) return;

    const target = document.querySelector(href);
    if (!target) return;

    e.preventDefault();

    const header = document.getElementById("header");
    const offset = header ? header.offsetHeight + 10 : 10;

    const y = target.getBoundingClientRect().top + window.pageYOffset - offset;

    window.scrollTo({ top: y, behavior: 'smooth' });
    closeMenu();
  });
});

/* ==================================================
   CARROSSEL (só roda se existir na página)
================================================== */
(() => {
  const track = document.getElementById('carouselTrack');
  if (!track) return;

  let currentSlide = 0;
  const indicators = document.querySelectorAll('.indicator');
  const totalSlides = indicators.length || 4;

  function updateCarousel() {
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    indicators.forEach((el, index) => el.classList.toggle('active', index === currentSlide));
  }

  function nextSlide() {
    currentSlide = (currentSlide + 1) % totalSlides;
    updateCarousel();
  }

  updateCarousel();
  setInterval(nextSlide, 5000);

  // se você usa botões, exponha:
  window.nextSlide = nextSlide;
  window.prevSlide = () => { currentSlide = (currentSlide - 1 + totalSlides) % totalSlides; updateCarousel(); };
  window.goToSlide = (i) => { currentSlide = i; updateCarousel(); };
})();

/* Doca Certa nas versões internacionais da página inicial */
document.addEventListener('DOMContentLoaded', () => {
  const lang = document.documentElement.lang;
  const target = document.getElementById(lang === 'es' ? 'proceso' : 'process');
  if (!target || !['en', 'es'].includes(lang) || document.getElementById('docacerta-international')) return;

  const copy = lang === 'es' ? {
    eyebrow: 'Una solución vinculada a JGM4',
    title: 'Doca Certa: programación de entregas y muelles',
    text: 'Organice proveedores, transportistas, horarios y capacidad de los muelles en una agenda compartida. Doca Certa conecta tecnología con la experiencia logística práctica de JGM4.',
    items: [['Recepción previsible','Reduzca llegadas simultáneas y prepare la operación antes de cada vehículo.'],['Control de muelles','Coordine ventanas con la capacidad real y mejore la visibilidad.'],['Conozca Doca Certa','Una solución de programación de entregas vinculada a JGM4.']],
    button: 'Visitar el sistema'
  } : {
    eyebrow: 'A solution connected to JGM4',
    title: 'Doca Certa: delivery and dock scheduling',
    text: "Organize suppliers, carriers, time slots and dock capacity in one shared schedule. Doca Certa connects technology to JGM4's practical logistics expertise.",
    items: [['Predictable receiving','Reduce overlapping arrivals and prepare the operation before each vehicle.'],['Dock control','Coordinate delivery windows with actual capacity and improve visibility.'],['Meet Doca Certa','A delivery scheduling solution connected to JGM4.']],
    button: 'Visit the system'
  };
  const section = document.createElement('section');
  section.className = 'content';
  section.id = 'docacerta-international';
  section.innerHTML = `<div class="wrap"><div class="head"><small>${copy.eyebrow}</small><h2>${copy.title}</h2><p>${copy.text}</p></div><div class="grid">${copy.items.map((item,index)=>`<div class="card"><i class="fa-solid ${index===0?'fa-calendar-check':index===1?'fa-truck-ramp-box':'fa-arrow-up-right-from-square'}"></i><h3>${item[0]}</h3><p>${item[1]}</p>${index===2?`<a class="btn" href="https://docacerta.com.br/home" target="_blank" rel="noopener noreferrer">${copy.button}</a>`:''}</div>`).join('')}</div></div>`;
  target.before(section);
});

/* ==================================================
   TRACKING GLOBAL PARA ELEMENTOS COM data-track
================================================== */
(() => {
  if (window.__jgm4DataTrackBound) return;
  window.__jgm4DataTrackBound = true;

  function pageId() {
    const path = window.location.pathname || "/";
    const file = path.split("/").filter(Boolean).pop() || "home";
    return file.replace(/\.html$/i, "") || "home";
  }

  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-track]");
    if (!el) return;

    const label = el.getAttribute("data-track");
    if (!label) return;
    if (el.__jgm4DataTrackHandled) return;
    el.__jgm4DataTrackHandled = true;

    const payload = {
      event_category: "engagement",
      event_label: label,
      page_path: window.location.pathname,
      page_id: pageId()
    };

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "jgm4_data_track",
      track_label: label,
      page_path: payload.page_path,
      page_id: payload.page_id
    });

    if (typeof window.gtag === "function") {
      window.gtag("event", "click", payload);
    }
  }, true);
})();
