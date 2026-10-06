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
  const controls = slider.querySelector('.hero-controls');
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
    if (running) timer = setTimeout(() => showSlide(current + 1), 5000);
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
  // Touch must not leave a sticky hover pause, and navigation controls should
  // restart the full interval even while the clicked button retains focus.
  slider.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') { hovered = true; updateTimer(); }
  });
  slider.addEventListener('pointerleave', () => { hovered = false; updateTimer(); });
  controls.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') { hovered = false; updateTimer(); }
  });
  controls.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') { hovered = slider.contains(event.relatedTarget); updateTimer(); }
  });
  const hasContentFocus = () => slider.contains(document.activeElement) && !controls.contains(document.activeElement);
  slider.addEventListener('focusin', () => { focused = hasContentFocus(); updateTimer(); });
  slider.addEventListener('focusout', () => {
    setTimeout(() => { focused = hasContentFocus(); updateTimer(); }, 0);
  });
  document.addEventListener('visibilitychange', updateTimer);
  reducedMotion.addEventListener('change', updateTimer);
  showSlide(0);
  // Keep controls stable while letting each mobile image follow its own copy.
  const syncHeroVisual = () => {
    if (!window.matchMedia('(max-width: 600px)').matches) {
      slider.style.removeProperty('--hero-copy-height');
      slides.forEach(slide => slide.style.removeProperty('--slide-copy-height'));
      return;
    }
    const copyHeights = slides.map(slide => Math.ceil(slide.querySelector('.hero-copy').getBoundingClientRect().height));
    slides.forEach((slide, i) => slide.style.setProperty('--slide-copy-height', `${copyHeights[i]}px`));
    slider.style.setProperty('--hero-copy-height', `${Math.max(...copyHeights)}px`);
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
    consent:'Please agree to the collection and use of personal information.', sending:'Submitting your inquiry…',
    sent:'Your inquiry has been submitted. We will reply by email.', failed:'The inquiry could not be submitted. You can send it by email instead.',
  } : {
    purposes: { demo:'데모 요청', service:'A/S 접수', materials:'자료 요청', other:'기타 문의' },
    products: { alljet:'All-Jet', invera:'INVERA', unspecified:'기타 / 미정', '':'미선택' },
    subject:'[IPEUN 제품문의]', purpose:'문의 목적', product:'제품', name:'성함', organization:'병원, 기관명', email:'회신 이메일', details:'문의 내용', optional:'미입력',
    empty:'내용을 입력해주세요.', copied:'문의 내용을 복사했습니다. admin@i-peun.com으로 보낼 이메일에 붙여넣어주세요.',
    copyFailed:'자동 복사가 지원되지 않습니다. 위 내용을 선택해 직접 복사해주세요.',
    draft:'메일 앱에서 확인 후 직접 전송해주세요. 아직 접수된 상태는 아닙니다.',
    consent:'개인정보 수집·이용에 동의해주세요.', sending:'문의를 접수하고 있습니다…',
    sent:'문의가 접수되었습니다. 회신 이메일로 답변드리겠습니다.', failed:'문의를 접수하지 못했습니다. 아래 내용을 이메일로 보내주세요.',
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
  // 관리자 백엔드(Cloudflare Worker)가 있는 사이트에서는 폼에 data-inquiry-endpoint 가 붙고, 문의가 사이트에 접수된다
  const endpoint = inquiryForm.dataset.inquiryEndpoint;
  const consent = inquiryForm.querySelector('[data-inquiry-consent]');
  const submitButton = inquiryForm.querySelector('[data-inquiry-compose]');
  const sendStatus = document.createElement('p');
  sendStatus.className = 'field-help inquiry-send-status';
  sendStatus.setAttribute('role', 'status');
  if (endpoint) inquiryForm.querySelector('.inquiry-submit > div')?.append(sendStatus);
  const sendInquiry = async () => {
    if (consent && !consent.checked) { sendStatus.textContent = labels.consent; consent.focus(); return; }
    const data = new FormData(inquiryForm);
    const value = name => String(data.get(name) || '').trim();
    submitButton.disabled = true;
    sendStatus.textContent = labels.sending;
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lang: isEnglish ? 'en' : 'ko', purposes: selectedPurposes(), product: labels.products[value('product')],
          organization: value('organization'), name: value('name'), email: value('email'), message: value('message'),
          consent: consent ? consent.checked : true, website: value('website'),
        }),
      });
      if (!response.ok) throw new Error('failed');
      inquiryForm.reset();
      draft.hidden = true;
      sendStatus.textContent = labels.sent;
    } catch {
      sendStatus.textContent = labels.failed;
      updateDraft();
      draft.hidden = false;
      status.textContent = labels.draft;
    } finally {
      submitButton.disabled = false;
    }
  };
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
    if (endpoint) { sendInquiry(); return; }
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

// INVERA 영상: 화면에 보이면 무음 자동 재생, 영상 클릭으로 일시정지, 하단 바(재생 위치 · 음소거 · 전체 화면)
{
  const say = (ko, en) => (isEnglish ? en : ko);
  document.querySelectorAll('[data-film]').forEach(frame => {
    const video = frame.querySelector('video');
    const seek = frame.querySelector('[data-film-seek]');
    const sound = frame.querySelector('[data-film-sound]');
    const fullscreen = frame.querySelector('[data-film-fullscreen]');
    let pausedByUser = false;
    let dragging = false;
    let resumeAfterDrag = false;

    const syncPaused = () => frame.classList.toggle('is-paused', video.paused);
    video.addEventListener('play', syncPaused);
    video.addEventListener('pause', syncPaused);
    if (reducedMotion.matches) {
      video.removeAttribute('autoplay');
      video.pause();
    } else if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) video.pause();
        else if (!pausedByUser && !dragging) video.play().catch(() => {});
      }, { threshold: 0.25 }).observe(video);
    }
    syncPaused();

    const togglePlay = () => {
      pausedByUser = !video.paused;
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    };
    video.addEventListener('click', togglePlay);
    video.addEventListener('keydown', event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      togglePlay();
    });

    const paint = ratio => {
      seek.value = String(Math.round(ratio * 1000));
      seek.style.setProperty('--progress', `${ratio * 100}%`);
    };
    video.addEventListener('timeupdate', () => {
      if (!dragging && video.duration) paint(video.currentTime / video.duration);
    });
    const seekTo = ratio => {
      ratio = Math.max(0, Math.min(1, ratio));
      paint(ratio);
      if (Number.isFinite(video.duration)) video.currentTime = ratio * video.duration;
    };
    const seekAtPointer = event => {
      const bounds = seek.getBoundingClientRect();
      seekTo((event.clientX - bounds.left) / bounds.width);
    };
    seek.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      dragging = true;
      resumeAfterDrag = !video.paused;
      video.pause();
      seek.focus({ preventScroll: true });
      seek.setPointerCapture(event.pointerId);
      seekAtPointer(event);
    });
    seek.addEventListener('pointermove', event => {
      if (dragging && seek.hasPointerCapture(event.pointerId)) seekAtPointer(event);
    });
    const finishDrag = () => {
      if (!dragging) return;
      dragging = false;
      if (resumeAfterDrag) video.play().catch(() => {});
      resumeAfterDrag = false;
    };
    seek.addEventListener('pointerup', event => {
      if (!dragging) return;
      seekAtPointer(event);
      finishDrag();
      if (seek.hasPointerCapture(event.pointerId)) seek.releasePointerCapture(event.pointerId);
    });
    seek.addEventListener('pointercancel', finishDrag);
    seek.addEventListener('lostpointercapture', finishDrag);
    seek.addEventListener('input', () => seekTo(Number(seek.value) / 1000));

    sound.addEventListener('click', () => {
      video.muted = !video.muted;
      if (!video.muted && video.paused) {
        pausedByUser = false;
        video.play().catch(() => {});
      }
      sound.setAttribute('aria-pressed', String(!video.muted));
      sound.setAttribute('aria-label', video.muted ? say('소리 켜기', 'Sound on') : say('소리 끄기', 'Sound off'));
    });

    fullscreen.addEventListener('click', () => {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (frame.requestFullscreen) frame.requestFullscreen();
      else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });
    const syncFullscreen = () => {
      const active = (document.fullscreenElement || document.webkitFullscreenElement) === frame;
      frame.classList.toggle('is-fullscreen', active);
      fullscreen.setAttribute('aria-label', active ? say('전체 화면 종료', 'Exit full screen') : say('전체 화면', 'Full screen'));
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
  });
}
