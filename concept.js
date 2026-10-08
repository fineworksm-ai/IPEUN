// 디자인 시안 — All-Jet 구간: 스크롤에 따라 제품 각도와 설명 단계를 바꾼다
(() => {
  const section = document.querySelector('[data-cx-scrub]');
  if (!section) return;
  const frames = [...section.querySelectorAll('[data-cx-frame]')];
  const steps = [...section.querySelectorAll('[data-cx-step]')];
  const bar = section.querySelector('[data-cx-progress]');
  let current = -1;
  let ticking = false;

  const update = () => {
    ticking = false;
    const rect = section.getBoundingClientRect();
    const travel = section.offsetHeight - window.innerHeight;
    const progress = Math.min(1, Math.max(0, -rect.top / travel));
    const index = Math.min(frames.length - 1, Math.floor(progress * frames.length));
    if (bar) bar.style.transform = `scaleX(${progress})`;
    if (index === current) return;
    current = index;
    frames.forEach((frame, i) => frame.classList.toggle('is-active', i === index));
    steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
  };

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
