// IPEUN 관리자 화면 (빌드 도구 없이 동작하는 순수 JS)
// 데이터는 Cloudflare Worker의 /api/admin/* 를 통해 D1에 저장되고, 공개 페이지에 바로 반영된다.
// 영문 페이지는 저장할 때 새 한글 문장을 자동 번역한다 (설정 > 영문 번역에서 확인·수정).

const app = document.getElementById('app');

const PAGES = [
  { key: 'index', label: '메인', path: '/index.html' },
  { key: 'company', label: '회사소개', path: '/company.html' },
  { key: 'technology', label: '기술소개', path: '/technology.html' },
  { key: 'alljet', label: 'All-Jet', path: '/alljet.html' },
  { key: 'invera', label: 'INVERA', path: '/invera.html' },
  { key: 'events', label: '전시·학회', path: '/events.html' },
  { key: 'media', label: '미디어', path: '/media.html' },
  { key: 'contact', label: '고객센터', path: '/contact.html' },
  { key: 'privacy', label: '개인정보처리방침', path: '/privacy.html' },
  { key: 'publications', label: '논문자료', path: '/publications.html' },
];
const NAV = [
  { group: '현황', items: [['dashboard', '대시보드'], ['inquiries', '문의 관리']] },
  { group: '콘텐츠', items: [['events', '전시·학회'], ['media', '미디어'], ['history', '연혁'], ['documents', '인증·특허'], ['popups', '팝업/배너']] },
  { group: '설정', items: [['seo', 'SEO · 메타태그'], ['site', '사이트 설정'], ['translations', '영문 번역']] },
];
const CONTENT_KEYS = ['site', 'seo', 'history', 'events', 'media', 'documents', 'popups'];
const DOC_GROUPS = [
  ['iso', 'ISO 인증 (상단 강조)'], ['cert', '인증, 확인서'], ['award', '수상, 언론'], ['patent', '특허'], ['trademark', '상표'],
];
const STATUS = ['신규', '처리중', '완료'];

const state = {
  content: {}, fromStatic: new Set(), dirty: new Set(), inquiries: [], analytics: null,
  translations: null, active: 'dashboard', range: 30, translator: '',
};

/* ───────── 작은 DOM 도우미 ───────── */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  });
  children.flat(Infinity).forEach((child) => {
    if (child == null || child === false) return;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  });
  return el;
}
let toastTimer;
function toast(text, type = '') {
  document.querySelector('.adm-toast')?.remove();
  const el = h('div', { class: `adm-toast ${type}`, role: 'status' }, text);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), type === 'err' ? 5000 : 2600);
}
const btn = (label, onClick, variant = '', extra = {}) => h('button', { type: 'button', class: `adm-btn ${variant}`, onClick, ...extra }, label);
// D1 의 datetime('now') 는 UTC → 한국 시간으로 표시
const kst = (value) => {
  const time = Date.parse(`${String(value || '').replace(' ', 'T')}Z`);
  return Number.isNaN(time) ? String(value || '') : new Date(time + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
};
const preview = (src) => (src && /^(assets|files)\//.test(src) ? `/${src}` : src);

/* ───────── API ───────── */
async function api(path, { method = 'GET', body, raw = false, headers = {} } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-ipeun-admin': '1' } : {}),
      ...headers,
    },
    body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    renderLogin('로그인이 만료되었습니다. 다시 로그인해주세요.');
    throw new Error('로그인이 필요합니다');
  }
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data;
}

/* ───────── 로그인 ───────── */
function renderLogin(message = '') {
  const input = h('input', { type: 'password', placeholder: '••••••••', autocomplete: 'current-password', required: true });
  const error = h('div', { class: 'err', role: 'alert' }, message);
  const submit = h('button', { class: 'adm-btn primary', style: 'width:100%;margin-top:18px', type: 'submit' }, '로그인');
  const form = h('form', { class: 'adm-login-card' },
    h('h1', {}, 'IPEUN 관리자'),
    h('p', {}, '비밀번호를 입력해 로그인하세요.'),
    h('div', { class: 'adm-field' }, h('label', {}, '비밀번호'), input),
    error, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    error.textContent = '';
    const response = await fetch('/api/admin/login', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    });
    const data = await response.json().catch(() => ({}));
    submit.disabled = false;
    if (!response.ok) { error.textContent = data.error || '로그인하지 못했습니다.'; input.select(); return; }
    start();
  });
  app.replaceChildren(h('div', { class: 'adm-login' }, form));
  input.focus();
}

/* ───────── 현재 사이트(정적 페이지)에서 처음 데이터 가져오기 ───────── */
const pageCache = new Map();
async function staticPage(path) {
  if (!pageCache.has(path)) {
    pageCache.set(path, fetch(`${path}?__static=1`, { credentials: 'same-origin' })
      .then((response) => response.text())
      .then((html) => new DOMParser().parseFromString(html, 'text/html')));
  }
  return pageCache.get(path);
}
const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const multiline = (el) => {
  if (!el) return '';
  const copy = el.cloneNode(true);
  copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return copy.textContent.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
};
const imageOf = (img) => (img ? {
  src: img.getAttribute('src'), w: Number(img.getAttribute('width')) || null, h: Number(img.getAttribute('height')) || null, alt: img.getAttribute('alt') || '',
} : null);

const EXTRACT = {
  async site() {
    const [home, company] = await Promise.all([staticPage('/index.html'), staticPage('/company.html')]);
    const info = home.querySelector('footer .footer-info');
    const lines = [...(info?.querySelectorAll(':scope > p') || [])];
    const first = txt(lines[0]).split('|').map((part) => part.trim());
    const contact = lines.find((line) => line.querySelector('a[href^="tel:"]'));
    let addresses = [...company.querySelectorAll('#location .location-card')]
      .map((card) => ({ label: txt(card.querySelector('h3')), address: txt(card.querySelector('.location-address')) }));
    if (!addresses.length) {
      addresses = lines.slice(1).filter((line) => !line.querySelector('a') && !line.classList.contains('copyright'))
        .map((line) => { const [label, ...rest] = txt(line).split(':'); return { label: label.trim(), address: rest.join(':').trim() }; });
    }
    return {
      company: first[0] || '', ceo: (first[1] || '').split(':').pop().trim(), bizNo: (first[2] || '').split(':').pop().trim(),
      addresses,
      tel: txt(contact?.querySelector('a[href^="tel:"]')), fax: (txt(contact).match(/F\s*([\d-]+)/) || [])[1] || '',
      email: txt(contact?.querySelector('a[href^="mailto:"]')), copyright: txt(info?.querySelector('.copyright')),
    };
  },
  async seo() {
    const pages = {};
    await Promise.all(PAGES.map(async (page) => {
      const doc = await staticPage(page.path);
      pages[page.key] = { title: txt(doc.querySelector('title')), description: doc.querySelector('meta[name="description"]')?.getAttribute('content') || '' };
    }));
    return { pages, ogImage: null };
  },
  async history() {
    const doc = await staticPage('/company.html');
    const out = [];
    doc.querySelectorAll('#history .timeline-year').forEach((block) => {
      const year = txt(block.querySelector('h3'));
      block.querySelectorAll('li').forEach((li) => out.push({
        year, month: txt(li.querySelector('time')), text: multiline(li.querySelector('p')), note: txt(li.querySelector('small')),
      }));
    });
    return out;
  },
  async events() {
    const doc = await staticPage('/events.html');
    return [...doc.querySelectorAll('article.event-story')].map((article) => ({
      id: article.id,
      date: article.querySelector('.event-heading time')?.getAttribute('datetime') || '',
      title: txt(article.querySelector('h2')),
      summary: txt(article.querySelector('.event-heading p')),
      photos: [...article.querySelectorAll('figure.event-photo')].map((figure) => ({
        ...imageOf(figure.querySelector('img')), caption: txt(figure.querySelector('figcaption')), portrait: figure.classList.contains('is-portrait'),
      })),
    }));
  },
  async media() {
    const doc = await staticPage('/media.html');
    return [...doc.querySelectorAll('#press .press-card')].map((card) => {
      const img = card.querySelector('img');
      return {
        outlet: txt(card.querySelector('.press-meta span')),
        date: card.querySelector('.press-meta time')?.getAttribute('datetime') || '',
        title: txt(card.querySelector('h3')),
        summary: txt(card.querySelector('.press-copy > p:not(.press-meta)')),
        url: card.querySelector('a.text-link')?.getAttribute('href') || '',
        image: img ? { ...imageOf(img), product: Boolean(img.closest('.press-product')) } : null,
      };
    });
  },
  async documents() {
    const doc = await staticPage('/company.html');
    const out = [];
    const card = (el, group) => {
      const lines = [...el.querySelectorAll('.document-caption p')];
      const img = el.querySelector('img');
      return {
        group, title: txt(el.querySelector('h3')), dateText: txt(lines[0]), notes: lines.slice(1).map(txt).filter(Boolean),
        thumb: img ? { src: img.getAttribute('src'), w: Number(img.getAttribute('width')) || null, h: Number(img.getAttribute('height')) || null } : null,
        large: el.dataset.lightboxSrc ? { src: el.dataset.lightboxSrc, w: Number(el.dataset.lightboxWidth) || null, h: Number(el.dataset.lightboxHeight) || null } : null,
      };
    };
    let group = 'iso';
    [...(doc.querySelector('#certifications .container')?.children || [])].forEach((el) => {
      if (el.classList.contains('section-head')) return;
      if (el.matches('h3.block-title')) { group = txt(el).includes('수상') ? 'award' : 'cert'; return; }
      if (el.classList.contains('iso-grid')) group = 'iso';
      el.querySelectorAll('.document-card').forEach((item) => out.push(card(item, group)));
    });
    doc.querySelectorAll('#patents .document-card').forEach((item) => {
      out.push(card(item, txt(item.querySelector('h3')).includes('상표') ? 'trademark' : 'patent'));
    });
    return out;
  },
  async popups() { return []; },
};

/* ───────── 시작 ───────── */
async function start() {
  app.replaceChildren(h('div', { class: 'adm-loading' }, '데이터 불러오는 중…'));
  try {
    const me = await api('/api/admin/me');
    state.translator = me.translator;
    await loadAll();
    renderShell();
  } catch (error) {
    if (!document.querySelector('.adm-login')) app.replaceChildren(h('div', { class: 'adm-loading' }, `불러오지 못했습니다: ${error.message}`));
  }
}
async function loadAll() {
  pageCache.clear();
  const [content, inquiries, analytics] = await Promise.all([
    api('/api/admin/content'), api('/api/admin/inquiries'), api('/api/admin/analytics'),
  ]);
  state.content = {};
  state.fromStatic = new Set();
  state.dirty = new Set();
  for (const key of CONTENT_KEYS) {
    if (content[key] != null) state.content[key] = content[key];
    else {
      state.content[key] = await EXTRACT[key]().catch(() => (key === 'site' || key === 'seo' ? {} : []));
      state.fromStatic.add(key);
    }
  }
  if (Array.isArray(state.content.history)) sortHistory(state.content.history);
  if (Array.isArray(state.content.events)) state.content.events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  state.inquiries = inquiries;
  state.analytics = analytics;
  state.translations = null;
}
const sortHistory = (list) => list.sort((a, b) => Number(b.year) - Number(a.year) || Number(b.month) - Number(a.month));

/* ───────── 화면 틀 ───────── */
function renderShell() {
  const nav = h('nav', { class: 'adm-nav' }, NAV.map((group) => h('div', { class: 'adm-navgroup' },
    h('div', { class: 'adm-navgroup-t' }, group.group),
    group.items.map(([key, label]) => h('button', {
      type: 'button', class: `adm-navitem${state.active === key ? ' active' : ''}`, 'data-nav': key,
      onClick: () => { state.active = key; renderShell(); window.scrollTo(0, 0); },
    }, label,
    key === 'inquiries' && state.inquiries.some((item) => item.status === '신규') ? h('span', { class: 'dot', title: '새 문의' }) : null,
    state.dirty.has(key) ? h('span', { class: 'changed' }, '● 미저장') : null)))));
  const sidebar = h('aside', { class: 'adm-sidebar' },
    h('div', { class: 'adm-logo' }, 'IPEUN ', h('span', {}, 'admin')),
    nav,
    h('div', { class: 'adm-side-foot' },
      h('a', { href: '/', target: '_blank', rel: 'noopener' }, '사이트 보기 ↗'),
      h('button', { type: 'button', onClick: logout }, '로그아웃')));
  const bar = h('div', { class: 'adm-content-bar' },
    h('span', { class: 'save-hint' }, '수정 후 각 화면의 ', h('b', {}, '저장'), ' 버튼을 눌러야 사이트에 반영됩니다. 영문 페이지는 저장할 때 자동 번역됩니다.'),
    h('button', { type: 'button', class: 'adm-reload', onClick: reload }, '↻ 새로고침'));
  const inner = h('div', { class: 'adm-content-inner' });
  app.replaceChildren(h('div', { class: 'adm-shell' }, sidebar, h('main', { class: 'adm-content' }, bar, inner)));
  inner.append(VIEWS[state.active]());
}
function touch(key) {
  if (state.dirty.has(key)) return;
  state.dirty.add(key);
  const item = document.querySelector(`[data-nav="${key}"]`);
  if (item && !item.querySelector('.changed')) item.append(h('span', { class: 'changed' }, '● 미저장'));
}
async function reload() {
  if (state.dirty.size && !confirm('저장하지 않은 변경 내용이 사라집니다. 새로고침할까요?')) return;
  await start();
  toast('최신 데이터를 불러왔습니다');
}
async function logout() {
  if (state.dirty.size && !confirm('저장하지 않은 변경 내용이 있습니다. 로그아웃할까요?')) return;
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
  state.dirty.clear();
  renderLogin();
}
window.addEventListener('beforeunload', (event) => { if (state.dirty.size) { event.preventDefault(); event.returnValue = ''; } });

// SEO 저장 전 검사: 빈 제목·중복 제목은 막고, 너무 짧은 설명은 확인을 받는다
function checkSeo() {
  const pages = state.content.seo?.pages || {};
  const label = Object.fromEntries(PAGES.map((page) => [page.key, page.label]));
  const seen = new Map();
  const short = [];
  for (const [key, meta] of Object.entries(pages)) {
    const title = String(meta.title || '').trim();
    if (!title) return { error: `'${label[key] || key}' 페이지 제목이 비어 있습니다.` };
    if (seen.has(title)) return { error: `'${label[seen.get(title)]}'와 '${label[key]}' 페이지 제목이 같습니다. 페이지마다 다르게 적어주세요.` };
    seen.set(title, key);
    if (String(meta.description || '').trim().length < 50) short.push(label[key] || key);
  }
  return { short };
}

async function save(key, button) {
  if (key === 'events') ensureEventIds();
  if (key === 'seo') {
    const check = checkSeo();
    if (check.error) { toast(check.error, 'err'); return; }
    if (check.short.length && !confirm(`설명이 50자보다 짧은 페이지가 있습니다 (${check.short.join(', ')}).\n검색 결과에 보이는 문장이라 80~120자를 권장합니다. 그래도 저장할까요?`)) return;
  }
  if (button) { button.disabled = true; button.textContent = '저장 중…'; }
  try {
    const result = await api(`/api/admin/content/${key}`, { method: 'PUT', body: state.content[key] });
    state.dirty.delete(key);
    state.fromStatic.delete(key);
    state.translations = null;
    if (result.translateError) toast(`저장되었습니다. 영문 자동 번역은 실패했습니다: ${result.translateError}`, 'err');
    else toast(result.translated ? `저장되었습니다 · 영문 ${result.translated}건 자동 번역` : '저장되었습니다 (사이트 반영)');
    renderShell();
  } catch (error) {
    toast(`저장 실패: ${error.message}`, 'err');
    if (button) { button.disabled = false; button.textContent = '저장'; }
  }
}
const saveBtn = (key) => { const button = btn('저장', () => save(key, button), 'primary'); return button; };

function head(title, desc, ...right) {
  return h('div', { class: 'adm-sechead' }, h('div', {}, h('h2', {}, title), desc ? h('p', {}, desc) : null), right.length ? h('div', { class: 'right' }, right) : null);
}
function staticNotice(key) {
  if (!state.fromStatic.has(key)) return null;
  return h('div', { class: 'adm-notice info' }, '현재 사이트에 있는 내용을 불러왔습니다. 저장하면 이 화면의 내용으로 사이트가 관리됩니다.');
}

/* ───────── 입력 컴포넌트 ───────── */
function field(label, value, onInput, opts = {}) {
  const input = opts.textarea ? h('textarea', { rows: opts.rows || 3, placeholder: opts.placeholder || '' })
    : h('input', { type: opts.type || 'text', placeholder: opts.placeholder || '' });
  input.value = value ?? '';
  const labelEl = h('label', {}, label);
  const count = opts.count ? h('span', { class: 'count' }) : null;
  if (count) labelEl.append(' ', count);
  const update = () => { if (count) count.textContent = `(${input.value.length}자 · 권장 ${opts.count})`; };
  input.addEventListener('input', () => { onInput(input.value); update(); });
  update();
  return h('div', { class: `adm-field${opts.full ? ' full' : ''}` }, labelEl, input);
}
function toggle(label, checked, onChange) {
  const input = h('input', { type: 'checkbox' });
  input.checked = Boolean(checked);
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'adm-toggle' }, input, h('span', { class: 'track' }), h('span', {}, label));
}
function select(options, value, onChange) {
  const el = h('select', { class: 'adm-select' }, options.map(([v, label]) => h('option', { value: v }, label)));
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

// 이미지는 브라우저에서 줄여(WebP) 올린다
async function shrink(file, maxSide) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  let quality = 0.86;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = h('canvas', { width, height });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && blob.size <= 1300000) return { blob, width, height };
    if (quality > 0.62) quality -= 0.08; else scale *= 0.8;
  }
  throw new Error('이미지를 충분히 줄이지 못했습니다');
}
async function uploadImage(file, maxSide = 2000) {
  const { blob, width, height } = await shrink(file, maxSide);
  const result = await api('/api/admin/upload', {
    method: 'POST', raw: true, body: blob,
    headers: { 'content-type': blob.type || 'image/webp', 'x-width': String(width), 'x-height': String(height) },
  });
  return { src: result.src, w: width, h: height };
}
function imageInput(value, onChange, { ratio = '4 / 3', maxSide = 2000, uploader } = {}) {
  const prev = h('div', { class: 'adm-img-prev', style: `aspect-ratio:${ratio}` });
  const path = h('input', { class: 'adm-img-path', placeholder: '이미지 경로 (assets/... 또는 /files/...)' });
  const paint = (image) => {
    prev.replaceChildren(image?.src ? h('img', { src: preview(image.src), alt: '' }) : h('span', {}, '이미지 없음'));
    path.value = image?.src || '';
  };
  paint(value);
  const label = h('span', {}, '이미지 업로드');
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    label.textContent = '업로드 중…';
    try {
      const next = uploader ? await uploader(chosen) : { ...(value || {}), ...(await uploadImage(chosen, maxSide)) };
      value = uploader ? next.thumb : next;
      onChange(next);
      paint(value);
      toast('이미지를 올렸습니다. 저장을 눌러야 사이트에 반영됩니다.');
    } catch (error) {
      toast(`이미지 업로드 실패: ${error.message}`, 'err');
    } finally {
      label.textContent = '이미지 업로드';
      file.value = '';
    }
  });
  path.addEventListener('change', () => {
    value = path.value ? { ...(value || {}), src: path.value } : null;
    onChange(value);
    paint(value);
  });
  return h('div', { class: 'adm-img' }, prev, h('label', { class: 'adm-upload' }, label, file), path);
}
const move = (list, index, dir) => {
  const target = index + dir;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
};
function rowCtrl(index, total, { onUp, onDown, onDelete, extra } = {}) {
  return h('div', { class: 'adm-row-ctrl' },
    h('span', { class: 'no' }, `#${index + 1}`), extra,
    onUp ? btn('↑', onUp, 'sm', { disabled: index === 0 }) : null,
    onDown ? btn('↓', onDown, 'sm', { disabled: index === total - 1 }) : null,
    btn('삭제', onDelete, 'sm danger'));
}

/* ───────── 화면들 ───────── */
const VIEWS = {};

// 대시보드
const PAGE_LABEL = Object.fromEntries(PAGES.flatMap((page) => [[`/${page.key}`, page.label], [`/en/${page.key}`, `${page.label} (EN)`]]));
PAGE_LABEL['/'] = '메인'; PAGE_LABEL['/en'] = '메인 (EN)';
VIEWS.dashboard = () => {
  const daily = state.analytics?.daily || [];
  const range = state.range;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const days = [];
  for (let i = range - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() + 9 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10);
    const row = daily.find((item) => item.date === date);
    days.push({ date, v: row?.visitors || 0, p: row?.pageviews || 0 });
  }
  const sum = (key) => days.reduce((total, day) => total + day[key], 0);
  const todayRow = daily.find((item) => item.date === today);
  const kpis = [
    ['오늘 방문자', todayRow?.visitors || 0],
    [`최근 ${range}일 방문자`, sum('v')],
    [`최근 ${range}일 페이지뷰`, sum('p')],
    ['일 평균 방문자', Math.round(sum('v') / range)],
  ];
  const seg = h('div', { class: 'adm-seg' }, [7, 14, 30, 90].map((n) => h('button', {
    type: 'button', class: state.range === n ? 'on' : '', onClick: () => { state.range = n; renderShell(); },
  }, `${n}일`)));
  const pages = state.analytics?.pages || [];
  const max = Math.max(1, ...pages.map((page) => page.views));
  const recent = state.inquiries.slice(0, 5);
  return h('div', {},
    head('대시보드', '사이트 방문 현황과 최근 문의를 확인하세요. 관리자로 로그인한 기기(브라우저)의 방문은 집계하지 않습니다.', seg, h('span', { class: 'adm-live' }, '● 실시간 집계')),
    h('div', { class: 'adm-stats' }, kpis.map(([label, n]) => h('div', { class: 'adm-stat' }, h('div', { class: 'n' }, n.toLocaleString()), h('div', { class: 'l' }, label)))),
    h('div', { class: 'adm-panel' }, h('div', { class: 'adm-panel-h' }, h('h3', {}, '일별 방문자', h('small', {}, `최근 ${range}일`))), chart(days)),
    h('div', { class: 'adm-two' },
      h('div', { class: 'adm-panel' }, h('div', { class: 'adm-panel-h' }, h('h3', {}, '많이 본 페이지', h('small', {}, '최근 30일'))),
        pages.length ? h('div', { class: 'adm-barlist' }, pages.map((page) => h('div', { class: 'adm-bar-row' },
          h('span', { class: 'adm-bar-label', title: page.path }, PAGE_LABEL[page.path] || page.path),
          h('div', { class: 'adm-bar-track' }, h('div', { class: 'adm-bar-fill', style: `width:${(page.views / max) * 100}%` })),
          h('span', { class: 'adm-bar-val' }, page.views.toLocaleString())))) : h('p', { class: 'adm-empty' }, '아직 집계된 방문이 없습니다.')),
      h('div', { class: 'adm-panel' }, h('div', { class: 'adm-panel-h' }, h('h3', {}, '최근 문의'), btn('전체 보기', () => { state.active = 'inquiries'; renderShell(); }, 'sm')),
        recent.length ? recent.map((item) => h('div', { class: 'adm-inq-row', onClick: () => { state.active = 'inquiries'; renderShell(); } },
          h('span', { class: `adm-badge s-${item.status}` }, item.status),
          h('span', { class: 'msg' }, `${item.organization} · ${item.name} — ${item.message}`),
          h('span', { class: 'date' }, kst(item.created_at).slice(0, 10)))) : h('p', { class: 'adm-empty' }, '접수된 문의가 없습니다.'))));
};
function chart(days) {
  const W = 900; const H = 230; const L = 40; const R = 12; const T = 16; const B = 28;
  const max = Math.max(4, ...days.map((day) => day.v));
  const top = Math.ceil(max / 4) * 4;
  const x = (i) => L + (days.length === 1 ? 0 : (i * (W - L - R)) / (days.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const add = (tag, attrs, text) => {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text != null) el.textContent = text;
    svg.append(el);
    return el;
  };
  for (let i = 0; i <= 4; i += 1) {
    const value = (top / 4) * i;
    add('line', { x1: L, x2: W - R, y1: y(value), y2: y(value), stroke: '#f1f1f4' });
    add('text', { x: L - 8, y: y(value) + 4, 'text-anchor': 'end', class: 'adm-axis' }, value);
  }
  const step = Math.ceil(days.length / 8);
  days.forEach((day, i) => {
    if (i % step === 0 || i === days.length - 1) add('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'adm-axis' }, `${Number(day.date.slice(5, 7))}/${Number(day.date.slice(8))}`);
  });
  const points = days.map((day, i) => `${x(i)},${y(day.v)}`).join(' ');
  add('polygon', { points: `${x(0)},${y(0)} ${points} ${x(days.length - 1)},${y(0)}`, fill: 'rgba(0,168,140,.1)' });
  add('polyline', { points, fill: 'none', stroke: '#00a88c', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
  const dot = add('circle', { r: 5, fill: '#00a88c', stroke: '#fff', 'stroke-width': 2, opacity: 0 });
  const wrap = h('div', { class: 'adm-chart' }, svg);
  const tip = h('div', { class: 'adm-chart-tip', hidden: true });
  wrap.append(tip);
  svg.addEventListener('mousemove', (event) => {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(days.length - 1, Math.round(((px - L) / (W - L - R)) * (days.length - 1))));
    const day = days[i];
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(day.v)); dot.setAttribute('opacity', 1);
    tip.hidden = false;
    tip.replaceChildren(h('b', {}, day.date), `방문자 ${day.v} · 페이지뷰 ${day.p}`);
    tip.style.left = `${(x(i) / W) * 100}%`;
    tip.style.top = `${(y(day.v) / H) * 100}%`;
  });
  svg.addEventListener('mouseleave', () => { tip.hidden = true; dot.setAttribute('opacity', 0); });
  return wrap;
}

// 문의 관리
VIEWS.inquiries = () => {
  const list = state.inquiries;
  return h('div', {},
    head('문의 관리', `총 ${list.length}건 · 고객센터 제품문의 폼으로 접수된 문의입니다.`),
    list.length ? list.map((item) => {
      const memo = h('textarea', { rows: 2, placeholder: '담당자 메모 (사이트에 표시되지 않음)' });
      memo.value = item.memo || '';
      const persist = async (patch) => {
        Object.assign(item, patch);
        try { await api(`/api/admin/inquiries/${item.id}`, { method: 'PUT', body: { status: item.status, memo: item.memo } }); toast('저장되었습니다'); } catch (error) { toast(`저장 실패: ${error.message}`, 'err'); }
      };
      return h('div', { class: 'adm-card block' },
        h('div', { class: 'adm-inq-head' },
          select(STATUS.map((s) => [s, s]), item.status, (status) => { persist({ status }); }),
          h('span', { class: 'date' }, `${kst(item.created_at)} · ${item.lang === 'en' ? '영문 페이지' : '국문 페이지'}`),
          btn('삭제', async () => {
            if (!confirm('이 문의를 삭제할까요? 되돌릴 수 없습니다.')) return;
            try { await api(`/api/admin/inquiries/${item.id}`, { method: 'DELETE' }); state.inquiries = state.inquiries.filter((x) => x.id !== item.id); renderShell(); toast('삭제했습니다'); } catch (error) { toast(error.message, 'err'); }
          }, 'sm danger')),
        h('dl', { class: 'adm-inq-body' },
          h('dt', {}, '문의 목적'), h('dd', {}, item.purposes || '-'),
          h('dt', {}, '관심 제품'), h('dd', {}, item.product || '-'),
          h('dt', {}, '병원, 기관명'), h('dd', {}, item.organization || '-'),
          h('dt', {}, '성함'), h('dd', {}, item.name || '-'),
          h('dt', {}, '회신 이메일'), h('dd', {}, h('a', { href: `mailto:${item.email}`, style: 'text-decoration:underline' }, item.email)),
          h('dt', {}, '문의 내용'), h('dd', {}, item.message || '-')),
        h('div', { class: 'adm-field' }, h('label', {}, '메모'), memo),
        h('div', { class: 'adm-row-ctrl' }, h('span', { class: 'no' }, `#${item.id}`), btn('메모 저장', () => persist({ memo: memo.value }), 'sm')));
    }) : h('p', { class: 'adm-empty' }, '접수된 문의가 없습니다.'));
};

// 전시·학회
function ensureEventIds() {
  const used = new Set();
  state.content.events.forEach((event) => {
    let id = String(event.id || '').trim().replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!id) id = `event-${String(event.date || 'new').replace(/-/g, '')}`;
    let unique = id; let n = 2;
    while (used.has(unique)) unique = `${id}-${n++}`;
    used.add(unique);
    event.id = unique;
  });
}
VIEWS.events = () => {
  const list = state.content.events;
  const rerender = () => { touch('events'); renderShell(); };
  return h('div', {},
    head('전시·학회', '전시·학회 페이지와 메인 "이픈의 새로운 소식"(최신 3건)에 날짜순으로 표시됩니다.',
      btn('+ 행사 추가', () => { list.unshift({ id: '', date: new Date().toISOString().slice(0, 10), title: '', summary: '', photos: [] }); rerender(); }),
      saveBtn('events')),
    staticNotice('events'),
    list.length ? list.map((event, index) => {
      const set = (patch) => { Object.assign(event, patch); touch('events'); };
      event.photos ||= [];
      return h('div', { class: 'adm-card block' },
        h('div', { class: 'adm-fields' },
          field('날짜', event.date, (date) => set({ date }), { type: 'date' }),
          field('주소 이름 (영문, 링크용)', event.id, (id) => set({ id }), { placeholder: '예: forum-2026 (비워두면 자동)' }),
          field('행사명', event.title, (title) => set({ title }), { full: true }),
          field('소개 문장', event.summary, (summary) => set({ summary }), { textarea: true, full: true, rows: 2 }),
          h('div', { class: 'adm-photos' }, event.photos.map((photo, i) => h('div', { class: 'adm-photo' },
            imageInput(photo, (next) => { Object.assign(photo, next || { src: '' }); touch('events'); }, { ratio: '4 / 3' }),
            field('사진 설명 (캡션)', photo.caption, (caption) => { photo.caption = caption; touch('events'); }),
            field('대체 텍스트 (시각장애인용)', photo.alt, (alt) => { photo.alt = alt; touch('events'); }),
            h('div', { class: 'ctrl' },
              toggle('세로 사진', photo.portrait, (portrait) => { photo.portrait = portrait; touch('events'); }),
              btn('←', () => { move(event.photos, i, -1); rerender(); }, 'sm', { disabled: i === 0, title: '앞으로' }),
              btn('→', () => { move(event.photos, i, 1); rerender(); }, 'sm', { disabled: i === event.photos.length - 1, title: '뒤로' }),
              btn('삭제', () => { event.photos.splice(i, 1); rerender(); }, 'sm danger')))),
          h('div', { class: 'adm-photo', style: 'justify-content:center;align-items:center;min-height:120px' },
            btn('+ 사진 추가', () => { event.photos.push({ src: '', caption: '', alt: '', portrait: false }); rerender(); }))),
          rowCtrl(index, list.length, { onDelete: () => { if (confirm('이 행사를 삭제할까요?')) { list.splice(index, 1); rerender(); } } })),
        h('p', { class: 'adm-hint' }, '첫 번째 사진이 크게 표시되고 나머지는 아래에 나란히 표시됩니다. 사진이 모두 세로 사진이면 나란히 표시됩니다.'));
    }) : h('p', { class: 'adm-empty' }, '등록된 행사가 없습니다.'));
};

// 미디어
VIEWS.media = () => {
  const list = state.content.media;
  const rerender = () => { touch('media'); renderShell(); };
  return h('div', {},
    head('미디어', '미디어 페이지 보도자료에 날짜순으로 표시됩니다.',
      btn('+ 기사 추가', () => { list.unshift({ outlet: '', date: new Date().toISOString().slice(0, 10), title: '', summary: '', url: '', image: null }); rerender(); }),
      saveBtn('media')),
    staticNotice('media'),
    list.length ? list.map((item, index) => {
      const set = (patch) => { Object.assign(item, patch); touch('media'); };
      return h('div', { class: 'adm-card' },
        h('div', {}, imageInput(item.image, (image) => set({ image: { ...image, product: item.image?.product || false } }), { ratio: '4 / 3' }),
          h('div', { style: 'margin-top:8px' }, toggle('배경 없는 제품 사진', item.image?.product, (product) => set({ image: { ...(item.image || {}), product } })))),
        h('div', { class: 'adm-fields' },
          field('언론사', item.outlet, (outlet) => set({ outlet })),
          field('날짜', item.date, (date) => set({ date }), { type: 'date' }),
          field('기사 제목', item.title, (title) => set({ title }), { full: true }),
          field('요약', item.summary, (summary) => set({ summary }), { textarea: true, full: true, rows: 2 }),
          field('기사 주소 (URL)', item.url, (url) => set({ url }), { full: true, placeholder: 'https://' }),
          rowCtrl(index, list.length, { onDelete: () => { if (confirm('이 기사를 삭제할까요?')) { list.splice(index, 1); rerender(); } } })));
    }) : h('p', { class: 'adm-empty' }, '등록된 기사가 없습니다.'));
};

// 연혁
VIEWS.history = () => {
  const list = state.content.history;
  const rerender = () => { touch('history'); renderShell(); };
  const rows = [];
  let lastYear = null;
  list.forEach((item, index) => {
    if (item.year !== lastYear) { rows.push(h('div', { class: 'adm-hist-year' }, item.year || '연도 미입력')); lastYear = item.year; }
    const input = (key, placeholder) => {
      const el = h('input', { placeholder });
      el.value = item[key] || '';
      el.addEventListener('input', () => { item[key] = el.value; touch('history'); });
      return el;
    };
    const textarea = h('textarea', { rows: 1, placeholder: '내용 (줄바꿈 가능)' });
    textarea.value = item.text || '';
    textarea.addEventListener('input', () => { item.text = textarea.value; touch('history'); });
    rows.push(h('div', { class: 'adm-hist-row' },
      input('year', '연도'), input('month', '월'), textarea, input('note', '번호 등 (선택)'),
      h('div', { class: 'ctrl' }, btn('삭제', () => { list.splice(index, 1); rerender(); }, 'sm danger'))));
  });
  return h('div', {},
    head('연혁', '회사소개 > 연혁에 연도·월 순서(최신순)로 표시됩니다. 연도나 월을 바꾸면 저장 후 자동으로 정렬됩니다.',
      btn('+ 항목 추가', () => { list.unshift({ year: String(new Date().getFullYear()), month: String(new Date().getMonth() + 1).padStart(2, '0'), text: '', note: '' }); rerender(); }),
      btn('정렬', () => { sortHistory(list); rerender(); }),
      saveBtn('history')),
    staticNotice('history'),
    h('div', { class: 'adm-card block' }, h('div', { class: 'adm-hist-row', style: 'font-size:12px;color:#71717a;font-weight:600' }, h('span', {}, '연도'), h('span', {}, '월'), h('span', {}, '내용'), h('span', {}, '번호 등'), h('span', {})), rows));
};

// 인증·특허
VIEWS.documents = () => {
  const list = state.content.documents;
  const rerender = () => { touch('documents'); renderShell(); };
  const uploader = async (file) => {
    const [thumb, large] = await Promise.all([uploadImage(file, 600), uploadImage(file, 1600)]);
    return { thumb, large };
  };
  return h('div', {},
    head('인증·특허', '회사소개 > 인증과 수상, 특허 출원에 표시됩니다. 특허 개수("특허 출원 N건")는 자동으로 계산됩니다.', saveBtn('documents')),
    staticNotice('documents'),
    DOC_GROUPS.map(([group, label]) => {
      const items = list.map((doc, index) => ({ doc, index })).filter(({ doc }) => doc.group === group);
      return h('div', {},
        h('div', { class: 'adm-sechead', style: 'margin:28px 0 12px' }, h('h3', { class: 'adm-sub', style: 'margin:0' }, `${label} (${items.length})`),
          btn('+ 추가', () => { list.push({ group, title: '', dateText: '', notes: [], thumb: null, large: null }); rerender(); }, 'sm')),
        items.map(({ doc, index }, position) => {
          const set = (patch) => { Object.assign(doc, patch); touch('documents'); };
          const swap = (dir) => { const other = items[position + dir]; if (!other) return; [list[index], list[other.index]] = [list[other.index], list[index]]; rerender(); };
          return h('div', { class: 'adm-card' },
            imageInput(doc.thumb, (next) => (next?.thumb ? set(next) : set({ thumb: next, large: next ? { ...(doc.large || {}), src: doc.large?.src || next.src } : null })), { ratio: '3 / 4', uploader }),
            h('div', { class: 'adm-fields' },
              h('div', { class: 'adm-field' }, h('label', {}, '구분'), select(DOC_GROUPS, doc.group, (value) => { doc.group = value; rerender(); })),
              field('날짜 표시', doc.dateText, (dateText) => set({ dateText }), { placeholder: '예: 2026.07 / 2024.09 출원' }),
              field('이름', doc.title, (title) => set({ title }), { full: true }),
              field('설명 (한 줄에 하나)', (doc.notes || []).join('\n'), (value) => set({ notes: value.split('\n').map((s) => s.trim()).filter(Boolean) }), { textarea: true, full: true, rows: 2, placeholder: '예: 의료기기 품질경영시스템\n출원번호 10-2024-0121731' }),
              rowCtrl(position, items.length, {
                onUp: () => swap(-1), onDown: () => swap(1),
                onDelete: () => { if (confirm('이 항목을 삭제할까요?')) { list.splice(index, 1); rerender(); } },
              })));
        }));
    }),
    h('p', { class: 'adm-hint' }, '이미지를 올리면 목록용(가로 600px)과 확대용(가로 1600px) 두 가지가 자동으로 만들어집니다. 이미지가 없는 항목은 글자만 있는 카드로 표시됩니다.'));
};

// 팝업/배너
VIEWS.popups = () => {
  const list = state.content.popups;
  const rerender = () => { touch('popups'); renderShell(); };
  return h('div', {},
    head('팝업/배너', '메인 페이지 왼쪽 아래에 표시되는 팝업입니다. 기간과 노출 여부를 지정할 수 있습니다.',
      btn('+ 팝업 추가', () => { list.unshift({ title: '', image: null, link: '', active: true, start: '', end: '' }); rerender(); }),
      saveBtn('popups')),
    list.length ? list.map((popup, index) => {
      const set = (patch) => { Object.assign(popup, patch); touch('popups'); };
      return h('div', { class: 'adm-card' },
        imageInput(popup.image, (image) => set({ image }), { ratio: '1 / 1', maxSide: 1200 }),
        h('div', { class: 'adm-fields' },
          field('제목 (화면 읽기용)', popup.title, (title) => set({ title }), { full: true }),
          field('클릭 시 이동할 주소', popup.link, (link) => set({ link }), { full: true, placeholder: 'contact.html 또는 https://' }),
          field('시작일', popup.start, (start) => set({ start }), { type: 'date' }),
          field('종료일', popup.end, (end) => set({ end }), { type: 'date' }),
          rowCtrl(index, list.length, {
            extra: toggle('노출', popup.active, (active) => set({ active })),
            onDelete: () => { if (confirm('이 팝업을 삭제할까요?')) { list.splice(index, 1); rerender(); } },
          })));
    }) : h('p', { class: 'adm-empty' }, '등록된 팝업이 없습니다.'));
};

// SEO
VIEWS.seo = () => {
  const seo = state.content.seo;
  seo.pages ||= {};
  return h('div', {},
    head('SEO · 메타태그', '검색 결과와 카카오톡 등 링크 공유 시 보이는 제목·설명입니다. 영문 페이지는 자동 번역됩니다.', saveBtn('seo')),
    staticNotice('seo'),
    PAGES.map((page) => {
      const meta = seo.pages[page.key] ||= { title: '', description: '' };
      return h('div', { class: 'adm-card block' },
        h('h3', { class: 'adm-sub' }, `${page.label} `, h('a', { href: page.path, target: '_blank', rel: 'noopener', style: 'font-weight:500;color:#71717a;font-size:12.5px' }, `${page.path} ↗`)),
        h('div', { class: 'adm-fields' },
          field('페이지 제목', meta.title, (title) => { meta.title = title; touch('seo'); }, { full: true, count: '30~40자' }),
          field('설명 (description)', meta.description, (description) => { meta.description = description; touch('seo'); }, { full: true, textarea: true, rows: 2, count: '80~120자' })));
    }),
    h('div', { class: 'adm-card block' },
      h('h3', { class: 'adm-sub' }, '링크 공유 이미지 (OG 이미지)'),
      h('p', { class: 'adm-hint', style: 'margin:0 0 12px' }, '카카오톡·페이스북 등에 링크를 공유할 때 보이는 대표 이미지입니다. 권장 크기 1200 × 630px.'),
      h('div', { style: 'max-width:420px' }, imageInput(seo.ogImage, (ogImage) => { seo.ogImage = ogImage; touch('seo'); }, { ratio: '1200 / 630', maxSide: 1200 }))));
};

// 사이트 설정
VIEWS.site = () => {
  const site = state.content.site;
  site.addresses ||= [];
  const set = (patch) => { Object.assign(site, patch); touch('site'); };
  const rerender = () => { touch('site'); renderShell(); };
  return h('div', {},
    head('사이트 설정', '모든 페이지 하단(푸터)과 회사소개 > 오시는길에 표시되는 회사 정보입니다.', saveBtn('site')),
    staticNotice('site'),
    h('div', { class: 'adm-card block' }, h('h3', { class: 'adm-sub' }, '회사 정보'),
      h('div', { class: 'adm-fields' },
        field('회사명', site.company, (company) => set({ company })),
        field('대표이사', site.ceo, (ceo) => set({ ceo })),
        field('사업자등록번호', site.bizNo, (bizNo) => set({ bizNo })),
        field('저작권 문구', site.copyright, (copyright) => set({ copyright })))),
    h('div', { class: 'adm-card block' }, h('div', { class: 'adm-sechead', style: 'margin-bottom:14px' }, h('h3', { class: 'adm-sub', style: 'margin:0' }, '주소 (오시는길)'),
      btn('+ 주소 추가', () => { site.addresses.push({ label: '', address: '' }); rerender(); }, 'sm')),
    site.addresses.map((place, index) => h('div', { class: 'adm-fields', style: 'grid-template-columns:160px 1fr auto;align-items:end;margin-bottom:10px' },
      field('이름', place.label, (label) => { place.label = label; touch('site'); }, { placeholder: '본사' }),
      field('주소', place.address, (address) => { place.address = address; touch('site'); }),
      h('div', { style: 'display:flex;gap:6px' },
        btn('↑', () => { move(site.addresses, index, -1); rerender(); }, 'sm', { disabled: index === 0 }),
        btn('삭제', () => { site.addresses.splice(index, 1); rerender(); }, 'sm danger'))))),
    h('div', { class: 'adm-card block' }, h('h3', { class: 'adm-sub' }, '연락처'),
      h('div', { class: 'adm-fields' },
        field('전화', site.tel, (tel) => set({ tel }), { placeholder: '031-522-4764' }),
        field('팩스', site.fax, (fax) => set({ fax })),
        field('이메일', site.email, (email) => set({ email }), { type: 'email' }))),
    h('p', { class: 'adm-hint' }, '문의 폼의 안내 문구에 있는 이메일 주소(admin@i-peun.com)는 페이지 문구라서 여기서 바뀌지 않습니다.'));
};

// 영문 번역
VIEWS.translations = () => {
  const wrap = h('div', {});
  const status = { base: '기존 번역', auto: '자동 번역', manual: '직접 수정', missing: '번역 없음' };
  let filter = 'all';
  let query = '';
  const listEl = h('div', {});
  const paint = () => {
    const rows = (state.translations || []).filter((row) => (filter === 'all' || row.source === filter)
      && (!query || row.ko.includes(query) || String(row.en || '').toLowerCase().includes(query.toLowerCase())));
    listEl.replaceChildren(...(rows.length ? rows.map((row) => {
      const area = h('textarea', { rows: 2, placeholder: '영문 번역 입력' });
      area.value = row.en || '';
      const saveRow = async (en) => {
        try {
          await api('/api/admin/translations', { method: 'PUT', body: { ko: row.ko, en } });
          state.translations = null;
          await loadTranslations();
          toast(en ? '번역을 저장했습니다 (직접 수정)' : '자동 번역으로 되돌렸습니다');
        } catch (error) { toast(error.message, 'err'); }
      };
      return h('div', { class: 'adm-tr-row' },
        h('div', { class: 'ko' }, row.ko),
        area,
        h('div', { class: 'side' },
          h('span', { class: `adm-badge t-${row.source}` }, status[row.source] || row.source),
          btn('저장', () => saveRow(area.value.trim()), 'sm'),
          row.source === 'manual' ? btn('되돌리기', () => saveRow(''), 'sm') : null));
    }) : [h('p', { class: 'adm-empty' }, state.translations ? '해당하는 문장이 없습니다.' : '불러오는 중…')]));
  };
  const loadTranslations = async () => {
    try { state.translations = await api('/api/admin/translations'); } catch (error) { toast(error.message, 'err'); state.translations = []; }
    paint();
  };
  const run = async (force, button) => {
    button.disabled = true;
    const label = button.textContent;
    button.textContent = '번역 중…';
    try {
      const result = await api('/api/admin/translations/refresh', { method: 'POST', body: { force } });
      toast(`자동 번역 ${result.translated || 0}건 완료`);
      await loadTranslations();
    } catch (error) { toast(`번역 실패: ${error.message}`, 'err'); }
    button.disabled = false;
    button.textContent = label;
  };
  const missingBtn = btn('번역 없는 문장 번역', () => run(false, missingBtn));
  const redoBtn = btn('자동 번역 다시 하기', () => run(true, redoBtn));
  const search = h('input', { class: 'adm-search', placeholder: '검색' });
  search.addEventListener('input', () => { query = search.value.trim(); paint(); });
  wrap.append(
    head('영문 번역', `관리자에서 입력한 한글 문장의 영문 번역입니다. 저장할 때 새 문장은 자동 번역되고(${state.translator === 'claude' ? 'Claude' : 'Cloudflare AI'}), 여기서 직접 고치면 그 번역이 우선 적용됩니다.`, missingBtn, redoBtn),
    h('div', { class: 'adm-notice info' }, '“기존 번역”은 현재 영문 사이트에 쓰인 번역입니다. 관리자에서 아직 저장하지 않은 메뉴의 문장은 이 목록에 나오지 않습니다.'),
    h('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap' },
      select([['all', '전체'], ['missing', '번역 없음'], ['auto', '자동 번역'], ['manual', '직접 수정'], ['base', '기존 번역']], filter, (value) => { filter = value; paint(); }),
      search),
    h('div', { class: 'adm-card block' }, listEl));
  if (state.translations) paint(); else loadTranslations();
  return wrap;
};

/* ───────── 시작 ───────── */
(async () => {
  const response = await fetch('/api/admin/me', { credentials: 'same-origin' });
  if (response.ok) start(); else renderLogin();
})();
