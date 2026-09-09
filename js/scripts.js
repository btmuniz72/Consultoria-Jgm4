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