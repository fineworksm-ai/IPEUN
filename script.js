const header = document.querySelector('[data-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const navigation = document.querySelector('[data-nav]');
const mobileMenuQuery = window.matchMedia('(max-width: 900px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isEnglish = document.documentElement.lang.startsWith('en');
const interfaceText = isEnglish
  ? { openMenu: 'Open menu', closeMenu: 'Close menu', playSlides: 'Play automatic slides', pauseSlides: 'Pause automatic slides' }
  : { openMenu: '메뉴 열기', closeMenu: '메뉴 닫기', playSlides: '자동 전환 재생', pauseSlides: '자동 전환 일시정지' };

// Real links also work without JavaScript; enhance them to retain the section.
const updateLanguageLinks = () => {
  document.querySelectorAll('[data-language-link]').forEach(link => {
    const target = new URL(link.dataset.languagePath, window.location.href);
    target.hash = window.location.hash;
    link.href = target.href;
  });
};
updateLanguageLinks();
window.addEventListener('hashchange', updateLanguageLinks);
document.querySelectorAll('[data-language-link]').forEach(link => link.addEventListener('click', updateLanguageLinks));

const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 24);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const setMenuOpen = (isOpen, restoreFocus = false) => {
  document.body.classList.toggle('menu-open', isOpen);
  menuToggle?.setAttribute('aria-expanded', String(isOpen));
  menuToggle?.setAttribute('aria-label', isOpen ? interfaceText.closeMenu : interfaceText.openMenu);
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
      updateLanguageLinks();
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
    pauseButton.setAttribute('aria-label', manuallyPaused ? interfaceText.playSlides : interfaceText.pauseSlides);
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
  // Reserve the same visual area for every slide, below the tallest copy.
  // Inactive slides retain their layout, so switching slides cannot move it.
  const syncHeroVisual = () => {
    if (!window.matchMedia('(max-width: 600px)').matches) { slider.style.removeProperty('--hero-visual-top'); return; }
    const origin = slider.getBoundingClientRect().top;
    const copyBottom = Math.max(...slides.map(slide => slide.querySelector('.hero-copy').getBoundingClientRect().bottom - origin));
    slider.style.setProperty('--hero-visual-top', `${Math.ceil(copyBottom + 52)}px`);
  };
  syncHeroVisual();
  document.fonts?.ready.then(syncHeroVisual);
  window.addEventListener('resize', syncHeroVisual, { passive: true });
  if ('ResizeObserver' in window) {
    const heroCopyObserver = new ResizeObserver(syncHeroVisual);
    slides.forEach(slide => heroCopyObserver.observe(slide.querySelector('.hero-copy')));
  }
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
const inquiryForm = document.querySelector('[data-inquiry-form]');
if (inquiryForm) {
  const labels = isEnglish ? {
    purposes: { demo:'Demo request', service:'A/S service request', materials:'Materials request', other:'Other inquiry' },
    products: { alljet:'All-Jet', invera:'INVERA', unspecified:'Other / undecided', '':'Not selected' },
    subject:'[IPEUN Product Inquiry]', purpose:'Purpose', product:'Product', name:'Name', organization:'Organization', email:'Reply email', details:'Inquiry details', optional:'Not provided',
    empty:'Please enter a value.', copied:'Inquiry details copied. Paste them into an email to admin@i-peun.com.',
    copyFailed:'Copying is unavailable. Select and copy the inquiry details above.',
    draft:'Review and send the message in your email app. The inquiry has not been submitted yet.',
  } : {
    purposes: { demo:'데모 요청', service:'A/S 접수', materials:'자료 요청', other:'기타 문의' },
    products: { alljet:'All-Jet', invera:'INVERA', unspecified:'기타 / 미정', '':'미선택' },
    subject:'[IPEUN 제품문의]', purpose:'문의 목적', product:'제품', name:'성함', organization:'병원·기관명', email:'회신 이메일', details:'문의 내용', optional:'미입력',
    empty:'내용을 입력해주세요.', copied:'문의 내용을 복사했습니다. admin@i-peun.com으로 보낼 이메일에 붙여넣어주세요.',
    copyFailed:'자동 복사가 지원되지 않습니다. 위 내용을 선택해 직접 복사해주세요.',
    draft:'메일 앱에서 확인 후 직접 전송해주세요. 아직 접수된 상태는 아닙니다.',
  };
  const purposes = [...inquiryForm.querySelectorAll('input[name="purpose"]')];
  const error = document.getElementById('purpose-error');
  const draft = inquiryForm.querySelector('[data-inquiry-draft]');
  const preview = inquiryForm.querySelector('[data-inquiry-preview]');
  const status = inquiryForm.querySelector('[data-inquiry-status]');
  const mailLink = inquiryForm.querySelector('[data-inquiry-mail]');
  const textFields = ['organization','name','message'].map(name => inquiryForm.elements.namedItem(name));
  const selectedPurposes = () => purposes.filter(input => input.checked).map(input => labels.purposes[input.value]);
  const updateDraft = () => {
    const data = new FormData(inquiryForm);
    const value = name => String(data.get(name) || '').trim();
    const chosen = selectedPurposes().join(' / ');
    const body = [
      `${labels.purpose}: ${chosen}`, `${labels.product}: ${labels.products[value('product')]}`,
      `${labels.name}: ${value('name')}`, `${labels.organization}: ${value('organization') || labels.optional}`,
      `${labels.email}: ${value('email')}`, '', `${labels.details}:`, value('message'),
    ].join('\n');
    preview.textContent = body;
    mailLink.href = `mailto:admin@i-peun.com?subject=${encodeURIComponent(`${labels.subject} ${chosen}`)}&body=${encodeURIComponent(body)}`;
  };
  inquiryForm.noValidate = true;
  inquiryForm.addEventListener('input', () => {
    if (selectedPurposes().length) { error.hidden = true; inquiryForm.querySelector('fieldset').removeAttribute('aria-invalid'); }
    textFields.forEach(field => field.setCustomValidity(field.value.trim() ? '' : labels.empty));
    if (!draft.hidden) updateDraft();
  });
  inquiryForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!selectedPurposes().length) {
      error.hidden = false;
      inquiryForm.querySelector('fieldset').setAttribute('aria-invalid','true');
      purposes[0].focus();
      return;
    }
    error.hidden = true;
    textFields.forEach(field => field.setCustomValidity(field.value.trim() ? '' : labels.empty));
    if (!inquiryForm.reportValidity()) return;
    updateDraft();
    draft.hidden = false;
    status.textContent = labels.draft;
    // Opens a draft only. Nothing is sent or stored by this website.
    mailLink.click();
  });
  inquiryForm.querySelector('[data-inquiry-copy]').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(preview.textContent);
      status.textContent = labels.copied;
    } catch { status.textContent = labels.copyFailed; }
  });
  inquiryForm.querySelector('[data-inquiry-compose]').disabled = false;
}

if (lightbox && typeof lightbox.showModal === 'function') {
  let lightboxTrigger;
  document.querySelectorAll('[data-lightbox-src]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
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
