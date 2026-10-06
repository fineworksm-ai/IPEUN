// 공통 유틸
export const esc = (value = '') => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
export const decodeEntities = (value = '') => String(value).replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e]);

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

// 한국 시간 기준 YYYY-MM-DD
export const kstDate = (time = Date.now()) => new Date(time + 9 * 3600 * 1000).toISOString().slice(0, 10);

export const getCookie = (request, name) => {
  const match = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

// "2026-07-07" → "2026.07.07", "2026-07" → "2026.07"
export const dotDate = (value = '') => String(value).replace(/-/g, '.');

// 페이지 경로 → { key: 'company', lang: 'ko' | 'en' }
export const PAGES = ['index', 'company', 'technology', 'alljet', 'invera', 'events', 'media', 'contact', 'privacy', 'publications', 'product'];
export function pageInfo(pathname) {
  let path = pathname;
  let lang = 'ko';
  if (path === '/en' || path.startsWith('/en/')) { lang = 'en'; path = path.slice(3) || '/'; }
  let key = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.html$/, '') || 'index';
  if (!PAGES.includes(key)) key = null;
  return { key, lang };
}

// "031-522-4764" → "+82315224764"
export const telHref = (tel = '') => {
  const digits = String(tel).replace(/\D/g, '');
  return digits ? `+82${digits.replace(/^0/, '')}` : '';
};
