// 관리자 데이터 → 공개 페이지 HTML 조각
// 마크업은 현재 정적 페이지(company.html, events.html, media.html, index.html, 푸터)와 같은 구조를 따른다.
// 정적 페이지의 해당 영역 마크업을 바꾸면 이 파일도 같이 바꿔야 한다 (ADMIN.md 참고).
import { esc, dotDate, telHref } from './util.js';

// 렌더 컨텍스트: T = 번역 함수(한국어 페이지는 그대로 반환), lang = 'ko' | 'en'
const asset = (src, ctx) => (ctx.lang === 'en' && /^assets\//.test(src || '') ? `../${src}` : src || '');
// 줄바꿈: 한국어는 입력한 그대로 <br>, 영문은 문장 전체를 번역한다 (번역문에 줄바꿈을 넣으면 그대로 <br>)
const text = (value, ctx) => {
  if (ctx.lang !== 'en') return String(value || '').split('\n').map((line) => esc(line.trim())).filter(Boolean).join('<br />');
  return esc(ctx.T(value)).replace(/\n/g, '<br />');
};
const plain = (value, ctx) => esc(ctx.T(value));
const img = (image, ctx, extra = '', cls = '') => (image && image.src
  ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(asset(image.src, ctx))}"${image.w ? ` width="${esc(image.w)}"` : ''}${image.h ? ` height="${esc(image.h)}"` : ''} alt="${plain(image.alt || '', ctx)}"${extra} />`
  : '');
const timeTag = (date) => (date ? `<time datetime="${esc(date)}">${esc(dotDate(date))}</time>` : '');
const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

// 관리자 화면에서 새 문구를 미리 번역해 둘 수 있도록, 렌더러가 쓰는 한글 문장을 모은다
export function collect(render, data) {
  const strings = [];
  render(data, { lang: 'en', T: (value) => { if (value) strings.push(String(value)); return value; } });
  return strings;
}

/* ───────── 연혁 (company.html #history .timeline) ───────── */
export function renderHistory(items, ctx) {
  const years = new Map();
  (items || []).forEach((item, index) => {
    const year = String(item.year || '').trim();
    if (!year) return;
    if (!years.has(year)) years.set(year, []);
    years.get(year).push({ ...item, index });
  });
  return [...years.entries()].sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, rows]) => {
    rows.sort((a, b) => Number(b.month || 0) - Number(a.month || 0) || a.index - b.index);
    const list = rows.map((row) => {
      const month = String(row.month || '').padStart(2, '0');
      return `<li><time datetime="${esc(year)}-${esc(month)}">${esc(month)}</time><div><p>${text(row.text, ctx)}</p>${row.note ? `<small>${plain(row.note, ctx)}</small>` : ''}</div></li>`;
    }).join('\n');
    return `<div class="timeline-year"><h3>${esc(year)}</h3><ol>${list}</ol></div>`;
  }).join('\n');
}

/* ───────── 인증·특허 (company.html #certifications, #patents) ───────── */
const DOCUMENT_BLOCKS = [
  { group: 'cert', title: '인증, 확인서' },
  { group: 'award', title: '수상, 언론' },
];
function documentCard(doc, ctx) {
  const title = plain(doc.title, ctx);
  const dateLine = doc.dateText ? `<p>${plain(doc.dateText, ctx)}</p>` : '';
  const notes = (doc.notes || []).filter(Boolean).map((note) => `<p>${plain(note, ctx)}</p>`).join('');
  const caption = `<div class="document-caption"><h3>${title}</h3>${dateLine}${notes}</div>`;
  if (!doc.large?.src || !doc.thumb?.src) {
    // 이미지가 없는 항목: ISO는 인장 배지, 나머지는 글자 카드
    if (doc.group === 'iso') return `<article class="card document-card placeholder-card"><div class="document-badge"><div class="certification-seal"><span>${title}</span></div></div>${caption}</article>`;
    return `<article class="card document-card document-summary">${caption}</article>`;
  }
  const open = plain('확대해서 보기', ctx);
  const large = esc(asset(doc.large.src, ctx));
  // 링크로 두면 스크립트가 없어도 큰 이미지가 열린다. 스크립트가 있으면 라이트박스로 연다 (script.js)
  return `<a class="card document-card" href="${large}" data-lightbox-src="${large}" data-lightbox-title="${title}" data-lightbox-width="${esc(doc.large.w || '')}" data-lightbox-height="${esc(doc.large.h || '')}" aria-label="${title} — ${open}"><div class="document-thumb">${img({ ...doc.thumb, alt: doc.title }, ctx, ' loading="lazy"')}</div>${caption}<span class="document-open">${open}</span></a>`;
}
export function renderCertifications(docs, ctx) {
  const of = (group) => (docs || []).filter((doc) => doc.group === group);
  const iso = of('iso');
  let html = iso.length ? `<div class="iso-grid">${iso.map((doc) => documentCard(doc, ctx)).join('\n')}</div>` : '';
  DOCUMENT_BLOCKS.forEach(({ group, title }) => {
    const list = of(group);
    if (list.length) html += `<h3 class="block-title">${plain(title, ctx)}</h3><div class="document-grid">${list.map((doc) => documentCard(doc, ctx)).join('\n')}</div>`;
  });
  return html;
}
export function renderPatents(docs, ctx) {
  const list = (docs || []).filter((doc) => doc.group === 'patent' || doc.group === 'trademark');
  return list.map((doc) => documentCard(doc, ctx)).join('\n');
}
export const patentHeading = (docs, ctx) => plain(`특허 출원 ${(docs || []).filter((doc) => doc.group === 'patent').length}건`, ctx);

/* ───────── 전시·학회 (events.html 연도별 섹션, index.html 새로운 소식) ───────── */
function eventPhoto(photo, ctx) {
  return `<figure class="event-photo${photo.portrait ? ' is-portrait' : ''}">${img(photo, ctx, ' loading="lazy"')}${photo.caption ? `<figcaption>${plain(photo.caption, ctx)}</figcaption>` : ''}</figure>`;
}
function eventStory(event, ctx) {
  const photos = (event.photos || []).filter((photo) => photo.src);
  let gallery = '';
  if (photos.length && photos.every((photo) => photo.portrait)) {
    gallery = `<div class="event-photo-grid event-photo-grid-portrait">${photos.map((photo) => eventPhoto(photo, ctx)).join('')}</div>`;
  } else if (photos.length) {
    const [lead, ...rest] = photos;
    const mixed = rest.some((photo) => photo.portrait) && rest.some((photo) => !photo.portrait);
    gallery = eventPhoto(lead, ctx) + (rest.length ? `<div class="event-photo-grid${mixed ? ' buyers-photo-grid' : ''}">${rest.map((photo) => eventPhoto(photo, ctx)).join('')}</div>` : '');
  }
  return `<article class="event-story" id="${esc(event.id)}"><div class="event-heading">${timeTag(event.date)}<h2>${plain(event.title, ctx)}</h2>${event.summary ? `<p>${plain(event.summary, ctx)}</p>` : ''}</div>\n${gallery}</article>`;
}
export function renderEventYears(events, ctx) {
  const years = new Map();
  [...(events || [])].filter((event) => event.date).sort(byDateDesc).forEach((event) => {
    const year = event.date.slice(0, 4);
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(event);
  });
  return [...years.entries()].map(([year, list], index) => `<section class="section${index % 2 ? ' section-paper' : ''}" id="year-${esc(year)}"><div class="container"><p class="eyebrow">${esc(year)}</p>\n${list.map((event) => eventStory(event, ctx)).join('\n')}\n</div></section>`).join('\n');
}
export function renderLatestEvents(events, ctx) {
  return [...(events || [])].filter((event) => event.date).sort(byDateDesc).slice(0, 3).map((event) => {
    const cover = (event.photos || []).find((photo) => photo.src);
    return `<a href="events.html#${esc(event.id)}" class="card activity-card"><div class="activity-cover">${img(cover, ctx, ' loading="lazy"')}</div><div class="activity-copy">${timeTag(event.date)}<h3>${plain(event.title, ctx)}</h3></div></a>`;
  }).join('');
}

/* ───────── 미디어 (media.html #press .press-grid) ───────── */
export function renderPress(items, ctx) {
  return [...(items || [])].sort(byDateDesc).map((item) => {
    const image = item.image?.src ? item.image : null;
    let cover = '';
    if (image && item.image.product) cover = `<div class="press-cover press-product">${img(image, ctx, ' loading="lazy"')}</div>`;
    else if (image) cover = img(image, ctx, ' loading="lazy"', 'press-cover');
    const link = item.url ? `<a class="text-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${plain('기사 원문 보기', ctx)} <span aria-hidden="true">↗</span></a>` : '';
    return `<article class="card press-card">${cover}<div class="press-copy"><p class="press-meta"><span>${plain(item.outlet, ctx)}</span>${timeTag(item.date)}</p><h3>${plain(item.title, ctx)}</h3>${item.summary ? `<p>${plain(item.summary, ctx)}</p>` : ''}${link}</div></article>`;
  }).join('\n');
}

/* ───────── 사이트 설정: 푸터, 오시는길 ───────── */
export function renderFooterInfo(site, ctx) {
  const lines = [`<p>${plain(`${site.company} | 대표이사: ${site.ceo} | 사업자등록번호: ${site.bizNo}`, ctx)}</p>`];
  (site.addresses || []).forEach((place) => lines.push(`<p>${plain(`${place.label}: ${place.address}`, ctx)}</p>`));
  const contact = [];
  if (site.tel) contact.push(`T <a href="tel:${esc(telHref(site.tel))}">${esc(site.tel)}</a>`);
  if (site.fax) contact.push(`F ${esc(site.fax)}`);
  if (site.email) contact.push(`M <a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`);
  if (contact.length) lines.push(`<p>${contact.join(' | ')}</p>`);
  lines.push(`<div class="footer-links"><a href="privacy.html">${plain('개인정보처리방침', ctx)}</a></div>`);
  if (site.copyright) lines.push(`<p class="copyright">${esc(site.copyright)}</p>`);
  return `\n${lines.join('\n')}\n`;
}
export function renderLocations(site, ctx) {
  return (site.addresses || []).map((place) => {
    const query = encodeURIComponent(place.address || '');
    return `<article class="card location-card"><h3>${plain(place.label, ctx)}</h3><p class="location-address">${plain(place.address, ctx)}</p><div class="section-actions directions-actions"><a class="text-link" href="https://map.kakao.com/link/search/${query}" target="_blank" rel="noopener noreferrer">${plain('카카오맵에서 보기', ctx)} <span aria-hidden="true">↗</span></a><a class="text-link" href="https://map.naver.com/p/search/${query}" target="_blank" rel="noopener noreferrer">${plain('네이버지도에서 보기', ctx)} <span aria-hidden="true">↗</span></a></div></article>`;
  }).join('');
}

/* ───────── 팝업 (index.html) ───────── */
export function activePopups(popups, today) {
  return (popups || []).filter((popup) => popup.active && popup.image?.src
    && (!popup.start || popup.start <= today) && (!popup.end || popup.end >= today));
}
export function renderPopups(popups, ctx) {
  if (!popups.length) return '';
  const label = ctx.lang === 'en' ? { hide: "Don't show today", close: 'Close', dialog: 'Notice' } : { hide: '오늘 하루 보지 않기', close: '닫기', dialog: '공지' };
  const items = popups.map((popup, index) => {
    const picture = img({ ...popup.image, alt: popup.title || '' }, ctx);
    const body = popup.link ? `<a href="${esc(popup.link)}">${picture}</a>` : picture;
    return `<div class="ipeun-popup" role="dialog" aria-label="${plain(popup.title || label.dialog, ctx)}" data-popup="${index}" style="--i:${index}">${body}<div class="ipeun-popup-bar"><button type="button" data-popup-hide>${label.hide}</button><button type="button" data-popup-close>${label.close}</button></div></div>`;
  }).join('');
  return `<div class="ipeun-popups" hidden>${items}</div>
<style>.ipeun-popups{position:fixed;z-index:200;left:24px;bottom:24px;display:flex;gap:16px;align-items:flex-end}.ipeun-popup{width:min(360px,calc(100vw - 48px));overflow:hidden;border-radius:16px;background:#fff;box-shadow:0 18px 50px rgba(6,23,19,.22)}.ipeun-popup img{display:block;width:100%;height:auto}.ipeun-popup-bar{display:flex;justify-content:space-between;padding:12px 16px;font-size:14px}.ipeun-popup-bar button{border:0;background:none;color:#061713;cursor:pointer;font:inherit}@media(max-width:600px){.ipeun-popups{left:16px;right:16px;bottom:16px;flex-direction:column}.ipeun-popup{width:100%}}</style>
<script>(()=>{const box=document.querySelector('.ipeun-popups');if(!box)return;const key='ipeun-popup-hide';let hide='';try{hide=localStorage.getItem(key)||''}catch{}const today=new Date(Date.now()+324e5).toISOString().slice(0,10);if(hide===today)return;box.hidden=false;const close=()=>{box.remove()};box.addEventListener('click',e=>{if(e.target.closest('[data-popup-close]'))close();if(e.target.closest('[data-popup-hide]')){try{localStorage.setItem(key,today)}catch{}close()}});document.addEventListener('keydown',e=>{if(e.key==='Escape')close()},{once:true})})();</script>`;
}

/* ───────── 고객센터 문의 폼: 사이트에 저장되는 접수 방식으로 전환 ───────── */
export const INQUIRY_TEXT = {
  ko: {
    note: '작성하신 내용은 이픈 담당자에게 바로 전달됩니다.',
    help: '접수 후 회신 이메일로 답변드립니다.',
    submit: '문의 접수하기',
    consent: '문의 처리를 위한 개인정보(이름, 기관명, 이메일, 문의 내용) 수집·이용에 동의합니다.',
    policy: '개인정보처리방침 보기',
  },
  en: {
    note: 'Your inquiry will be delivered directly to the IPEUN team.',
    help: 'We will reply to the email address you provide.',
    submit: 'Submit inquiry',
    consent: 'I agree to the collection and use of my personal information (name, organization, email, inquiry details) to process this inquiry.',
    policy: 'View privacy policy',
  },
};
export function inquiryConsent(lang) {
  const t = INQUIRY_TEXT[lang];
  return `<label class="inquiry-consent"><input type="checkbox" name="consent" value="yes" data-inquiry-consent /><span>${esc(t.consent)} <a href="privacy.html" target="_blank" rel="noopener">${esc(t.policy)}</a></span></label><input class="inquiry-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
<style>.inquiry-consent{display:flex;gap:10px;align-items:flex-start;margin:4px 0 24px;font-size:15px;line-height:1.6;color:var(--muted,#65736e)}.inquiry-consent input{width:18px;height:18px;margin-top:3px;flex:0 0 18px;accent-color:var(--ink,#061713)}.inquiry-consent a{text-decoration:underline;color:inherit}.inquiry-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}</style>`;
}
