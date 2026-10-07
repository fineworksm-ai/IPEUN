// IPEUN Cloudflare Worker
// - 정적 페이지 서빙 (+ 관리자에서 저장한 내용을 HTMLRewriter로 반영, 영문 페이지는 자동 번역 반영)
// - /admin  관리자 화면 (admin/ 정적 파일)
// - /api/*  관리자 API, 문의 접수
// - /files/* 관리자에서 올린 이미지
import { json, kstDate, getCookie, pageInfo } from './util.js';
import { serveVideo } from './video.js';
import { loadDictionary, translator, translateMissing, hasKorean } from './translate.js';
import {
  collect, renderHistory, renderCertifications, renderPatents, patentHeading, renderEventYears,
  renderLatestEvents, renderPress, renderFooterInfo, renderLocations, activePopups, renderPopups,
  INQUIRY_TEXT, inquiryConsent, structuredData,
} from './render.js';

const CONTENT_KEYS = ['site', 'seo', 'history', 'events', 'media', 'documents', 'popups'];
const PAGE_CONTENT = {
  index: ['events', 'popups'], company: ['history', 'documents'], events: ['events'], media: ['media'],
};
const SESSION_COOKIE = 'ipeun_admin';
const SESSION_HOURS = 12;
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|monitor|curl|wget|python|httpclient/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/en' || url.pathname === '/admin') return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
    // Workers(html_handling = "none"): 폴더 주소는 index.html 로. Pages 는 정적 서버가 알아서 처리한다
    if (env.PAGES_MODE !== '1' && url.pathname.endsWith('/') && !url.pathname.startsWith('/api/')) {
      const target = new URL(url);
      target.pathname = `${url.pathname}index.html`;
      request = new Request(target, request);
    }
    try {
      const response = await route(request, env, ctx, url);
      if (env.SITE_INDEXABLE === 'true') return response;
      // 임시 주소: 검색엔진에 노출하지 않는다
      const hidden = new Response(response.body, response);
      hidden.headers.set('x-robots-tag', 'noindex, nofollow');
      return hidden;
    } catch (error) {
      console.error(error);
      if (url.pathname.startsWith('/api/')) return json({ error: String(error?.message || error) }, 500);
      return env.ASSETS.fetch(assetRequest(request, env));
    }
  },
};

// Pages 정적 서버는 company.html 을 /company 로 돌려보낸다(308). 방문자 주소는 그대로 두고 안에서만 바꿔 요청한다
function assetRequest(request, env) {
  if (env.PAGES_MODE !== '1') return request;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
  if (pathname === url.pathname) return request;
  url.pathname = pathname;
  return new Request(url, request);
}

async function route(request, env, ctx, url) {
  if (url.pathname === '/robots.txt' && env.SITE_INDEXABLE !== 'true') {
    // 검색엔진은 막고, 카카오톡·SNS 링크 미리보기 봇만 허용한다
    const previewBots = ['kakaotalk-scrap', 'facebookexternalhit', 'Twitterbot', 'Slackbot', 'LinkedInBot', 'TelegramBot', 'Discordbot'];
    const body = previewBots.map((bot) => `User-agent: ${bot}\nAllow: /\n`).join('\n') + '\nUser-agent: *\nDisallow: /\n';
    return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  if (url.pathname.startsWith('/assets/media/') && url.pathname.endsWith('.mp4')) return serveVideo(request, env);
  if (url.pathname.startsWith('/api/')) return api(request, env, url);
  if (url.pathname.startsWith('/files/')) return serveFile(env, url);
  if (url.pathname.startsWith('/admin/')) return adminAsset(request, env);
  return page(request, env, ctx, url);
}

/* ───────────────────────── 공개 페이지 ───────────────────────── */
async function page(request, env, ctx, url) {
  const response = await env.ASSETS.fetch(assetRequest(request, env));
  const type = response.headers.get('content-type') || '';
  if (request.method !== 'GET' || response.status !== 200 || !type.includes('text/html')) return response;

  const { key, lang } = pageInfo(new URL(request.url).pathname);
  // 관리자 화면에서 원본(정적) 내용을 불러올 때
  if (url.searchParams.has('__static') && await isAdmin(request, env)) {
    const raw = new Response(response.body, response);
    raw.headers.set('cache-control', 'no-store');
    return raw;
  }

  const visitor = recordVisit(request, env, ctx, url);
  if (!key) return withVisitor(response, visitor);

  const keys = ['site', 'seo', ...(PAGE_CONTENT[key] || [])];
  // DB를 못 읽어도 페이지는 정적 내용 + 공유 태그·구조화 데이터로 서빙한다
  const content = await loadContent(env, keys).catch((error) => { console.error('content:', error?.message); return {}; });
  const dictionary = lang === 'en' ? await loadDictionary(env).catch(() => null) : null;
  const T = dictionary ? translator(dictionary) : (value) => value;
  const rc = { lang, T };
  const rewriter = new HTMLRewriter();
  const inner = (html) => ({ element: (el) => el.setInnerContent(html, { html: true }) });

  // 검색·공유 메타
  const meta = content.seo?.pages?.[key];
  if (meta?.title) {
    const title = T(meta.title);
    rewriter.on('title', { element: (el) => el.setInnerContent(title) });
    rewriter.on('meta[property="og:title"]', { element: (el) => el.setAttribute('content', title) });
  }
  if (meta?.description) {
    const description = T(meta.description);
    rewriter.on('meta[name="description"]', { element: (el) => el.setAttribute('content', description) });
    rewriter.on('meta[property="og:description"]', { element: (el) => el.setAttribute('content', description) });
  }
  // 링크 공유 카드: 관리자에서 올린 이미지가 없으면 기본 공유 이미지(1200×630)
  const custom = content.seo?.ogImage?.src;
  const ogImage = new URL(custom || '/assets/og-share.jpg', url.origin).href;
  const pageUrl = `${url.origin}${url.pathname}`;
  const shareTags = [
    `<meta property="og:url" content="${pageUrl}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    custom ? '' : '<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${lang === 'en' ? 'IPEUN — needle-free precision jet technology, All-Jet and INVERA' : '이픈 — 바늘 없는 정밀 분사 기술, All-Jet과 INVERA'}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<script type="application/ld+json">${structuredData(key, lang, url.origin, content.site)}</script>`,
  ].filter(Boolean).join('\n');
  rewriter.on('meta[property="og:image"], meta[property="og:url"], meta[name="twitter:card"]', { element: (el) => el.remove() });
  rewriter.on('head', { element: (el) => el.append(`${shareTags}\n`, { html: true }) });

  // 회사 정보 (모든 페이지 푸터, 회사소개 오시는길)
  if (content.site) {
    rewriter.on('footer .footer-info', inner(renderFooterInfo(content.site, rc)));
    if (key === 'company') rewriter.on('#location .location-grid', inner(renderLocations(content.site, rc)));
  }

  if (key === 'company' && content.history) rewriter.on('#history .timeline', inner(renderHistory(content.history, rc)));
  if (key === 'company' && content.documents) {
    rewriter.on('#certifications .container > :not(.section-head)', { element: (el) => el.remove() });
    rewriter.on('#certifications .container > .section-head', { element: (el) => el.after(renderCertifications(content.documents, rc), { html: true }) });
    rewriter.on('#patents .document-grid', inner(renderPatents(content.documents, rc)));
    rewriter.on('#patents .section-head h2', inner(patentHeading(content.documents, rc)));
  }
  if (key === 'events' && content.events) {
    rewriter.on('main section[id^="year-"]', { element: (el) => el.remove() });
    rewriter.on('main section.page-intro', { element: (el) => el.after(renderEventYears(content.events, rc), { html: true }) });
  }
  if (key === 'index' && content.events) rewriter.on('.home-news .activity-grid', inner(renderLatestEvents(content.events, rc)));
  if (key === 'media' && content.media) rewriter.on('#press .press-grid', inner(renderPress(content.media, rc)));
  if (key === 'index' && content.popups) {
    const popups = activePopups(content.popups, kstDate());
    if (popups.length) rewriter.on('body', { element: (el) => el.append(renderPopups(popups, rc), { html: true }) });
  }

  // 고객센터: 메일 작성 방식 → 사이트 접수 방식 (script.js 가 data-inquiry-endpoint 를 보고 전송)
  if (key === 'contact') {
    const text = INQUIRY_TEXT[lang];
    rewriter.on('form[data-inquiry-form]', { element: (el) => el.setAttribute('data-inquiry-endpoint', '/api/inquiry') });
    rewriter.on('.inquiry-delivery-note', inner(text.note));
    rewriter.on('.inquiry-submit .field-help', inner(text.help));
    rewriter.on('[data-inquiry-compose]', inner(text.submit));
    rewriter.on('.inquiry-submit', { element: (el) => el.before(inquiryConsent(lang), { html: true }) });
  }

  const out = rewriter.transform(response);
  const final = new Response(out.body, out);
  final.headers.set('cache-control', 'no-cache');
  return withVisitor(final, visitor);
}

async function loadContent(env, keys) {
  const placeholders = keys.map(() => '?').join(',');
  const { results } = await env.DB.prepare(`SELECT key, value FROM content WHERE key IN (${placeholders})`).bind(...keys).all();
  const out = {};
  (results || []).forEach((row) => { try { out[row.key] = JSON.parse(row.value); } catch {} });
  return out;
}

/* ───────────────────────── 방문 집계 ───────────────────────── */
function recordVisit(request, env, ctx, url) {
  const agent = request.headers.get('user-agent') || '';
  if (!agent || BOT.test(agent) || request.headers.get('purpose') === 'prefetch') return null;
  const today = kstDate();
  const isNew = getCookie(request, 'ipeun_v') !== today;
  let path = url.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  ctx.waitUntil(env.DB.batch([
    env.DB.prepare('INSERT INTO stats (date, pageviews, visitors) VALUES (?, 1, ?) ON CONFLICT(date) DO UPDATE SET pageviews = pageviews + 1, visitors = visitors + ?')
      .bind(today, isNew ? 1 : 0, isNew ? 1 : 0),
    env.DB.prepare('INSERT INTO stats_pages (date, path, count) VALUES (?, ?, 1) ON CONFLICT(date, path) DO UPDATE SET count = count + 1').bind(today, path || '/'),
  ]).catch((error) => console.error('stats:', error?.message)));
  return isNew ? today : null;
}
function withVisitor(response, today) {
  if (!today) return response;
  const out = new Response(response.body, response);
  out.headers.append('set-cookie', `ipeun_v=${today}; Path=/; Max-Age=86400; SameSite=Lax`);
  return out;
}

/* ───────────────────────── 관리자 정적 파일 ───────────────────────── */
async function adminAsset(request, env) {
  const response = await env.ASSETS.fetch(assetRequest(request, env));
  const out = new Response(response.body, response);
  out.headers.set('x-robots-tag', 'noindex, nofollow');
  out.headers.set('cache-control', 'no-store');
  out.headers.set('x-frame-options', 'DENY');
  return out;
}

/* ───────────────────────── 이미지 ───────────────────────── */
async function serveFile(env, url) {
  const id = url.pathname.split('/').pop().split('.')[0];
  const row = await env.DB.prepare('SELECT mime, data FROM files WHERE id = ?').bind(id).first();
  if (!row) return new Response('Not found', { status: 404 });
  const bytes = Uint8Array.from(atob(row.data), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    headers: { 'content-type': row.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' },
  });
}

/* ───────────────────────── 로그인 세션 ───────────────────────── */
const encoder = new TextEncoder();
async function hmac(env, value) {
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD || '';
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const sameText = (a, b) => {
  const x = encoder.encode(a); const y = encoder.encode(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
};
async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const value = getCookie(request, SESSION_COOKIE);
  if (!value) return false;
  const [expires, signature] = value.split('.');
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return sameText(signature, await hmac(env, `session:${expires}`));
}
function sessionCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

/* ───────────────────────── API ───────────────────────── */
async function api(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/inquiry' && method === 'POST') return submitInquiry(request, env);
  if (path === '/api/admin/login' && method === 'POST') return login(request, env);
  if (path === '/api/admin/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', 0) });
  }
  if (!path.startsWith('/api/admin/')) return json({ error: 'not found' }, 404);
  if (!await isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  // 관리자 변경 요청은 관리자 화면에서 보낸 것만 받는다 (쿠키 SameSite=Strict + 전용 헤더)
  if (method !== 'GET' && request.headers.get('x-ipeun-admin') !== '1') return json({ error: 'forbidden' }, 403);

  if (path === '/api/admin/me') return json({ ok: true, translator: env.ANTHROPIC_API_KEY ? 'claude' : 'workers-ai' });
  if (path === '/api/admin/content' && method === 'GET') return json(await loadContent(env, CONTENT_KEYS));
  const contentMatch = path.match(/^\/api\/admin\/content\/([a-z]+)$/);
  if (contentMatch && method === 'PUT') return saveContent(request, env, contentMatch[1]);
  if (path === '/api/admin/translations' && method === 'GET') return listTranslations(env);
  if (path === '/api/admin/translations' && method === 'PUT') return saveTranslation(request, env);
  if (path === '/api/admin/translations/refresh' && method === 'POST') return refreshTranslations(request, env);
  if (path === '/api/admin/inquiries' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, created_at, lang, purposes, product, organization, name, email, message, status, memo FROM inquiries ORDER BY id DESC LIMIT 500').all();
    return json(results || []);
  }
  const inquiryMatch = path.match(/^\/api\/admin\/inquiries\/(\d+)$/);
  if (inquiryMatch && method === 'PUT') {
    const body = await request.json();
    await env.DB.prepare('UPDATE inquiries SET status = ?, memo = ? WHERE id = ?')
      .bind(String(body.status || '신규').slice(0, 20), String(body.memo || '').slice(0, 2000), inquiryMatch[1]).run();
    return json({ ok: true });
  }
  if (inquiryMatch && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM inquiries WHERE id = ?').bind(inquiryMatch[1]).run();
    return json({ ok: true });
  }
  if (path === '/api/admin/analytics' && method === 'GET') return analytics(env);
  if (path === '/api/admin/upload' && method === 'POST') return upload(request, env);
  return json({ error: 'not found' }, 404);
}

async function login(request, env) {
  if (!env.ADMIN_PASSWORD) return json({ error: '관리자 비밀번호가 설정되지 않았습니다 (ADMIN_PASSWORD).' }, 503);
  const { password = '' } = await request.json().catch(() => ({}));
  const ok = sameText(await hmac(env, `pw:${password}`), await hmac(env, `pw:${env.ADMIN_PASSWORD}`));
  if (!ok) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
  }
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  const value = `${expires}.${await hmac(env, `session:${expires}`)}`;
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, value, SESSION_HOURS * 3600) });
}

// 저장할 때 해당 콘텐츠가 영문 페이지에서 쓰는 문장을 모아, 번역이 없는 것만 자동 번역한다
function stringsFor(key, value) {
  if (value == null) return [];
  switch (key) {
    case 'site': return [...collect(renderFooterInfo, value), ...collect(renderLocations, value)];
    case 'seo': return Object.values(value.pages || {}).flatMap((meta) => [meta.title, meta.description]).filter(Boolean);
    case 'history': return collect(renderHistory, value);
    case 'events': return [...collect(renderEventYears, value), ...collect(renderLatestEvents, value)];
    case 'media': return collect(renderPress, value);
    case 'documents': return [...collect(renderCertifications, value), ...collect(renderPatents, value), ...collect(patentHeading, value)];
    case 'popups': return (value || []).map((popup) => popup.title).filter(Boolean);
    default: return [];
  }
}

async function saveContent(request, env, key) {
  if (!CONTENT_KEYS.includes(key)) return json({ error: 'unknown section' }, 404);
  const value = await request.json();
  if (key === 'seo') {
    const problem = validateSeo(value);
    if (problem) return json({ error: problem }, 400);
  }
  const text = JSON.stringify(value);
  if (text.length > 900000) return json({ error: '내용이 너무 큽니다.' }, 413);
  await env.DB.prepare("INSERT INTO content (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, text).run();
  try {
    const result = await translateMissing(env, stringsFor(key, value));
    return json({ ok: true, ...result });
  } catch (error) {
    console.error('translate:', error);
    return json({ ok: true, translated: 0, translateError: String(error?.message || error) });
  }
}

// 관리자 SEO 값 검증: 빈 제목, 페이지 간 같은 제목은 저장하지 않는다 (전 페이지 타이틀이 같아지는 사고 방지)
function validateSeo(value) {
  const pages = value?.pages || {};
  const seen = new Map();
  for (const [page, meta] of Object.entries(pages)) {
    const title = String(meta?.title || '').trim();
    if (!title) return `'${page}' 페이지 제목이 비어 있습니다.`;
    if (seen.has(title)) return `'${seen.get(title)}'와 '${page}' 페이지 제목이 같습니다: ${title}`;
    seen.set(title, page);
  }
  return null;
}

async function managedStrings(env) {
  const content = await loadContent(env, CONTENT_KEYS);
  return [...new Set(CONTENT_KEYS.flatMap((key) => stringsFor(key, content[key])).map((value) => String(value).replace(/\s+/g, ' ').trim()))]
    .filter(hasKorean);
}
async function listTranslations(env) {
  const strings = await managedStrings(env);
  const dictionary = await loadDictionary(env);
  return json(strings.map((ko) => ({ ko, ...dictionary.lookup(ko) })));
}
async function saveTranslation(request, env) {
  const { ko, en } = await request.json();
  if (!ko) return json({ error: 'ko required' }, 400);
  if (!en || !String(en).trim()) {
    await env.DB.prepare('DELETE FROM translations WHERE ko = ?').bind(ko).run();
  } else {
    await env.DB.prepare("INSERT INTO translations (ko, en, source, updated_at) VALUES (?, ?, 'manual', datetime('now')) ON CONFLICT(ko) DO UPDATE SET en = excluded.en, source = 'manual', updated_at = excluded.updated_at")
      .bind(ko, String(en).trim()).run();
  }
  return json({ ok: true });
}
async function refreshTranslations(request, env) {
  const body = await request.json().catch(() => ({}));
  const strings = Array.isArray(body.ko) && body.ko.length ? body.ko : await managedStrings(env);
  const result = await translateMissing(env, strings, { force: body.force ? strings : [] });
  return json({ ok: true, ...result });
}

async function analytics(env) {
  const daily = (await env.DB.prepare('SELECT date, pageviews, visitors FROM stats ORDER BY date DESC LIMIT 180').all()).results || [];
  const since = kstDate(Date.now() - 29 * 86400 * 1000);
  const pages = (await env.DB.prepare('SELECT path, SUM(count) AS views FROM stats_pages WHERE date >= ? GROUP BY path ORDER BY views DESC LIMIT 10').bind(since).all()).results || [];
  return json({ daily: daily.reverse(), pages });
}

const IMAGE_TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };
async function upload(request, env) {
  const mime = (request.headers.get('content-type') || '').split(';')[0];
  if (!IMAGE_TYPES[mime]) return json({ error: 'webp, jpg, png, gif 이미지만 올릴 수 있습니다.' }, 415);
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > 1400000) return json({ error: '이미지가 너무 큽니다 (1.4MB 이하).' }, 413);
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const width = Number(request.headers.get('x-width')) || null;
  const height = Number(request.headers.get('x-height')) || null;
  await env.DB.prepare('INSERT INTO files (id, mime, width, height, data) VALUES (?, ?, ?, ?, ?)')
    .bind(id, mime, width, height, btoa(binary)).run();
  return json({ ok: true, src: `/files/${id}.${IMAGE_TYPES[mime]}`, w: width, h: height });
}

/* ───────────────────────── 문의 접수 (공개) ───────────────────────── */
async function submitInquiry(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'invalid' }, 400);
  if (body.website) return json({ ok: true }); // 스팸 봇 (숨김 칸을 채움)
  const clip = (value, max) => String(value || '').trim().slice(0, max);
  const data = {
    lang: body.lang === 'en' ? 'en' : 'ko',
    purposes: (Array.isArray(body.purposes) ? body.purposes : []).map((p) => clip(p, 30)).slice(0, 6).join(', '),
    product: clip(body.product, 40),
    organization: clip(body.organization, 100),
    name: clip(body.name, 80),
    email: clip(body.email, 180),
    message: clip(body.message, 2000),
  };
  if (!body.consent || !data.purposes || !data.organization || !data.name || !data.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return json({ error: '필수 항목을 확인해주세요.' }, 400);
  }
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE email = ? AND created_at > datetime('now', '-10 minutes')").bind(data.email).first();
  if ((recent?.n || 0) >= 3) return json({ error: '잠시 후 다시 시도해주세요.' }, 429);
  await env.DB.prepare('INSERT INTO inquiries (lang, purposes, product, organization, name, email, message) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(data.lang, data.purposes, data.product, data.organization, data.name, data.email, data.message).run();
  return json({ ok: true });
}

