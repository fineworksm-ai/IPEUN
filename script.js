const header = document.querySelector('[data-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const navigation = document.querySelector('[data-nav]');
const mobileMenuQuery = window.matchMedia('(max-width: 900px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 24);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const setMenuOpen = (isOpen, restoreFocus = false) => {
  document.body.classList.toggle('menu-open', isOpen);
  menuToggle?.setAttribute('aria-expanded', String(isOpen));
  menuToggle?.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
  document.querySelector('main')?.toggleAttribute('inert', isOpen);
  document.querySelector('footer')?.toggleAttribute('inert', isOpen);
  if (!isOpen) {
    navigation?.querySelectorAll('.nav-group').forEach(group => {
      group.classList.remove('is-expanded');
      group.querySelector('[data-submenu-toggle]')?.setAttribute('aria-expanded', 'false');
    });
  }
  if (restoreFocus) menuToggle?.focus({ preventScroll: true });
};
menuToggle?.addEventListener('click', () => setMenuOpen(!document.body.classList.contains('menu-open')));
navigation?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenuOpen(false)));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('menu-open')) setMenuOpen(false, true);
});
mobileMenuQuery.addEventListener('change', event => { if (!event.matches) setMenuOpen(false); });

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: .08, rootMargin: '0px 0px -24px' });
  document.querySelectorAll('.reveal').forEach(element => revealObserver.observe(element));
} else {
  document.documentElement.classList.remove('js');
}

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', event => {
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', '#' + id);
    }
  });
});

const slider = document.querySelector('[data-slider]');
if (slider) {
  const slides = [...slider.querySelectorAll('[data-slide]')];
  const dots = [...slider.querySelectorAll('[data-slide-to]')];
  const pauseButton = slider.querySelector('[data-slide-pause]');
  let current = 0;
  let timer;
  let manuallyPaused = false;
  let hovered = false;
  let focused = false;
  const updateTimer = () => {
    clearTimeout(timer);
    const running = !reducedMotion.matches && !manuallyPaused && !hovered && !focused && !document.hidden;
    slider.classList.toggle('is-running', running);
    pauseButton.hidden = reducedMotion.matches;
    pauseButton.setAttribute('aria-label', manuallyPaused ? '자동 전환 재생' : '자동 전환 일시정지');
    pauseButton.textContent = manuallyPaused ? '▶' : 'Ⅱ';
    if (running) timer = setTimeout(() => showSlide(current + 1), 6000);
  };
  const showSlide = index => {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === current;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
    });
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
    slider.querySelector('[data-slide-count]').textContent = String(current + 1).padStart(2, '0');
    updateTimer();
  };
  slider.querySelector('[data-slide-prev]').addEventListener('click', () => showSlide(current - 1));
  slider.querySelector('[data-slide-next]').addEventListener('click', () => showSlide(current + 1));
  dots.forEach(dot => dot.addEventListener('click', () => showSlide(Number(dot.dataset.slideTo))));
  pauseButton.addEventListener('click', () => { manuallyPaused = !manuallyPaused; updateTimer(); });
  slider.addEventListener('mouseenter', () => { hovered = true; updateTimer(); });
  slider.addEventListener('mouseleave', () => { hovered = false; updateTimer(); });
  slider.addEventListener('focusin', () => { focused = true; updateTimer(); });
  slider.addEventListener('focusout', () => {
    setTimeout(() => { focused = slider.contains(document.activeElement); updateTimer(); }, 0);
  });
  document.addEventListener('visibilitychange', updateTimer);
  reducedMotion.addEventListener('change', updateTimer);
  showSlide(0);
}

navigation?.querySelectorAll('[data-submenu-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const group = button.closest('.nav-group');
    const opening = !group.classList.contains('is-expanded');
    navigation.querySelectorAll('.nav-group').forEach(item => {
      item.classList.remove('is-expanded');
      item.querySelector('[data-submenu-toggle]')?.setAttribute('aria-expanded', 'false');
    });
    group.classList.toggle('is-expanded', opening);
    button.setAttribute('aria-expanded', String(opening));
  });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || !document.body.classList.contains('menu-open')) return;
  const focusable = [...header.querySelectorAll('a, button')].filter(element =>
    !element.closest('[inert]') && element.getClientRects().length && getComputedStyle(element).visibility === 'visible'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

const lightbox = document.querySelector('[data-lightbox]');
if (lightbox) {
  let lightboxTrigger;
  document.querySelectorAll('[data-lightbox-src]').forEach(button => {
    button.addEventListener('click', () => {
      lightboxTrigger = button;
      const image = document.createElement('img');
      image.src = button.dataset.lightboxSrc;
      image.alt = button.dataset.lightboxTitle;
      image.width = Number(button.dataset.lightboxWidth);
      image.height = Number(button.dataset.lightboxHeight);
      lightbox.querySelector('[data-lightbox-content]').replaceChildren(image);
      lightbox.querySelector('[data-lightbox-caption]').textContent = button.dataset.lightboxTitle;
      lightbox.showModal();
      document.body.classList.add('lightbox-open');
    });
  });
  lightbox.querySelector('[data-lightbox-close]').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', event => {
    const bounds = lightbox.getBoundingClientRect();
    if (event.target === lightbox && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) lightbox.close();
  });
  lightbox.addEventListener('close', () => {
    document.body.classList.remove('lightbox-open');
    lightbox.querySelector('[data-lightbox-content]').replaceChildren();
    lightboxTrigger?.focus({ preventScroll: true });
  });
}
