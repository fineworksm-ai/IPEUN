import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Emit apply_patch input. Usage: node tools/generate-english.mjs index.html [ko|en]
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = process.argv[2];
const language = process.argv[3] || 'en';
if (!['index.html', 'company.html', 'technology.html', 'alljet.html', 'invera.html',
      'contact.html', 'privacy.html', 'product.html', 'events.html', 'media.html',
      'publications.html'].includes(page) || !['ko', 'en'].includes(language)) {
  throw new Error('Provide a supported page and ko or en.');
}
const translations = JSON.parse(readFileSync(path.join(root, 'translations/en.json'), 'utf8'));
const original = readFileSync(path.join(root, page), 'utf8');
let html = original
  .replace(/<nav class="language-switch"[\s\S]*?<\/nav>/g, '')
  .replace(/\s*<link[^>]*data-language-alternate[^>]*>/g, '')
  .replace(/<!-- 영문 3차:[\s\S]*?-->/g, '')
  .replace(/styles\.css\?v=[^"\s]+/g, 'styles.css?v=20261006-mobile-hero-7')
  .replace(/src="(?:\.\.\/)?script\.js(?:\?v=[^"]*)?"/g, 'src="script.js?v=20261006-mobile-hero-7"');
const translate = value => {
  const text = value.trim();
  if (!/[가-힣]/.test(text)) return value;
  if (!Object.hasOwn(translations, text)) throw new Error(`Missing translation: ${text}`);
  return value.replace(text, translations[text]);
};
if (language === 'en') {
  html = html.split(/(<!--[\s\S]*?-->)/).map(part => part.startsWith('<!--') ? part : part
    .replace(/>([^<>]+)</g, (_, value) => `>${translate(value)}<`)
    .replace(/((?:alt|aria-label|aria-roledescription|data-lightbox-title|content)=")([^"]*)(")/g,
      (_, start, value, end) => start + translate(value) + end)).join('');
  html = html.replace('<html lang="ko">', '<html lang="en">')
    .replace('content="ko_KR"', 'content="en_US"')
    .replace(/(src|srcset|href)="assets\//g, '$1="../assets/')
    .replace('href="styles.css?', 'href="../styles.css?')
    .replace('src="script.js?', 'src="../script.js?');
  if (page === 'company.html') html = html.replace('<main id="main-content">',
    '<!-- TODO(client confirmation): Verify official English spellings of the CEO name and program titles. -->\n<main id="main-content">');
}
const languagePage = page === 'publications.html' ? 'index.html' : page;
const koreanPath = language === 'en' ? `../${languagePage}` : languagePage;
const englishPath = language === 'en' ? languagePage : `en/${languagePage}`;
const switcher = `<nav class="language-switch" aria-label="${language === 'en' ? 'Language' : '언어 선택'}"><a class="language-option" href="${koreanPath}" data-language-link data-language-path="${koreanPath}" lang="ko" hreflang="ko" aria-label="${language === 'en' ? 'View in Korean' : '한국어로 보기'}"${language === 'ko' ? ' aria-current="page"' : ''}>KR</a><span aria-hidden="true">|</span><a class="language-option" href="${englishPath}" data-language-link data-language-path="${englishPath}" lang="en" hreflang="en" aria-label="${language === 'en' ? 'View in English' : '영어로 보기'}"${language === 'en' ? ' aria-current="page"' : ''}>EN</a></nav>`;
html = html.replace('<div class="header-actions">', `<div class="header-actions">${switcher}`);
if (page !== 'publications.html') html = html.replace('</head>', `  <link rel="alternate" hreflang="ko" href="${koreanPath}" data-language-alternate />\n  <link rel="alternate" hreflang="en" href="${englishPath}" data-language-alternate />\n</head>`);
const target = language === 'en' ? `en/${page}` : page;
const lines = html.trimEnd().split('\n');
if (!existsSync(path.join(root, target))) {
  console.log(`*** Begin Patch\n*** Add File: ${target}\n${lines.map(line => '+' + line).join('\n')}\n*** End Patch`);
} else {
  const existing = readFileSync(path.join(root, target), 'utf8');
  console.log(`*** Begin Patch\n*** Update File: ${target}\n@@\n${existing.trimEnd().split('\n').map(line => '-' + line).join('\n')}\n${lines.map(line => '+' + line).join('\n')}\n*** End Patch`);
}
