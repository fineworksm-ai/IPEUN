import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = ['index', 'company', 'technology', 'alljet', 'invera', 'contact',
  'privacy', 'product', 'events', 'media', 'publications'];
const pages = names.flatMap(name => [name + '.html', 'en/' + name + '.html']);
const errors = [];
const todos = new Map();
const htmls = new Map(pages.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const forbidden = /source-note|image-review|원본 교체|인쇄용\.pdf|bizreg/g;
for (const [file, html] of htmls) {
  for (const match of html.matchAll(forbidden)) errors.push(`${file}: ${match[0]}`);
  if (/href="[^"]*publications\.html/.test(html)) errors.push(`${file}: publications link`);
  if (!file.endsWith('product.html') && !/<span class="nav-disabled is-disabled" aria-disabled="true">/.test(html)) errors.push(`${file}: inactive menu missing`);
  if (file.endsWith('publications.html') && !/<meta name="robots" content="noindex"/.test(html)) errors.push(`${file}: noindex missing`);
  for (const match of html.matchAll(/<!-- TODO[^]*?-->/g)) {
    const comment = match[0].slice(5, -3).trim();
    const locations = todos.get(comment) || [];
    locations.push(`${file}:${html.slice(0, match.index).split('\n').length}`);
    todos.set(comment, locations);
  }
  for (const match of html.matchAll(/(?:href|src|srcset|data-lightbox-src)="([^"\s]+)"/g)) {
    const raw = match[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(raw)) continue;
    const [pathname, hash] = raw.split('?')[0].split('#');
    const relative = pathname.startsWith('/') ? pathname.slice(1) : path.join(path.dirname(file), pathname);
    let target = pathname ? path.resolve(root, relative) : path.join(root, file);
    if (pathname && !path.extname(target)) target += '.html';
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) { errors.push(`${file}: missing ${raw}`); continue; }
    if (hash && path.extname(target) === '.html' && !new RegExp(`id="${hash}"`).test(fs.readFileSync(target, 'utf8'))) errors.push(`${file}: missing anchor ${raw}`);
  }
}
if (/source-note/.test(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'))) errors.push('styles.css: source-note');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools/document-assets.json'), 'utf8'));
assert.equal(new Set(manifest.records.map(r => r.name)).size, manifest.records.length);
for (const name of ["iso13485-kr", "iso13485-en", "iso14001-kr", "iso14001-en", "venture", "alljet-trademark", "alljet-trademark-mark"]) assert.ok(manifest.records.some(r => r.name === name));
for (const record of manifest.records) {
  assert.equal(record.variants.thumb.width, 600);
  assert.ok(record.variants.large.width <= 1600);
  const original = record.sourcePage ? path.join(root, record.original) : path.join(root, 'tmp/documents-original', record.original);
  if (fs.existsSync(original)) assert.equal(createHash('sha256').update(fs.readFileSync(original)).digest('hex'), record.originalSha256);
  for (const variant of Object.values(record.variants)) assert.equal(fs.statSync(path.join(root, variant.path)).size, variant.bytes);
}
const redactionPlan = JSON.parse(fs.readFileSync(path.join(root, 'tools/document-redactions.json'), 'utf8'));
for (const entry of redactionPlan.records) {
  const record = manifest.records.find(r => r.name === entry.name);
  assert.ok(record?.redacted, `${entry.name}: unredacted document`);
  assert.equal(record.originalSha256, entry.originalSha256);
  for (const kind of ['thumb', 'large']) {
    assert.equal(record.variants[kind].path, `assets/documents/${entry.name}-redacted-values-${kind}.webp`);
    assert.ok(!fs.existsSync(path.join(root, `assets/documents/${entry.name}-${kind}.webp`)), `${entry.name}: unsafe public original`);
  }
}
assert.equal(fs.readdirSync(path.join(root, 'assets/documents')).length, manifest.records.length * 2);
assert.ok(!fs.existsSync(path.join(root, 'image-review.html')));
assert.ok(!fs.existsSync(path.join(root, 'en/image-review.html')));

// Exercise actual application listeners in a DOM unit fixture, not a live browser.
function lightboxUnit(file, supported = true) {
  const html = htmls.get(file);
  const triggers = [...html.matchAll(/<button class="card document-card" ([^]*?)>/g)].map(match => {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    return { dataset: { lightboxSrc: attrs['data-lightbox-src'], lightboxTitle: attrs['data-lightbox-title'], lightboxWidth: attrs['data-lightbox-width'], lightboxHeight: attrs['data-lightbox-height'] },
      listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; }, focus() { this.focused = true; } };
  });
  assert.equal(triggers.length, manifest.records.length);
  const classes = new Set();
  const classList = { add: name => classes.add(name), remove: name => classes.delete(name), toggle: () => {}, contains: name => classes.has(name) };
  const content = { children: [], replaceChildren(...children) { this.children = children; } };
  const caption = { textContent: '' };
  const close = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
  const dialog = { open: false, listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; },
    querySelector: selector => selector.includes('content') ? content : selector.includes('caption') ? caption : close,
    close() { this.open = false; this.listeners.close(); },
    getBoundingClientRect: () => ({ left:24, top:24, right:1000, bottom:1000 }) };
  if (supported) dialog.showModal = () => { dialog.open = true; };
  const document = { documentElement: { lang: file.startsWith('en/') ? 'en' : 'ko', classList }, body: { classList },
    querySelector: selector => selector === '[data-lightbox]' ? dialog : null,
    querySelectorAll: selector => selector === '[data-lightbox-src]' ? triggers : [],
    addEventListener() {}, createElement: () => ({}) };
  const window = { scrollY:0, matchMedia: () => ({ matches:false, addEventListener() {} }), addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'script.js'), 'utf8'), { document, window, URL, console, setTimeout, clearTimeout });
  if (!supported) { assert.ok(triggers.every(t => !t.listeners.click)); return triggers.length; }
  for (const trigger of triggers) {
    let prevented = false;
    trigger.listeners.click({ preventDefault: () => { prevented = true; } });
    assert.ok(prevented && dialog.open && classes.has('lightbox-open'));
    assert.equal(content.children[0].src, trigger.dataset.lightboxSrc);
    assert.equal(content.children[0].alt, trigger.dataset.lightboxTitle);
    assert.equal(content.children[0].width, Number(trigger.dataset.lightboxWidth));
    assert.equal(caption.textContent, trigger.dataset.lightboxTitle);
    dialog.listeners.click({ target:dialog, clientX:100, clientY:100 });
    assert.ok(dialog.open);
    close.listeners.click();
    assert.ok(!dialog.open && !classes.has('lightbox-open') && trigger.focused);
    assert.equal(content.children.length, 0);
    trigger.listeners.click({ preventDefault() {} });
    dialog.listeners.click({ target:dialog, clientX:0, clientY:0 });
    assert.ok(!dialog.open);
  }
  return triggers.length;
}
const lightboxCases = lightboxUnit('company.html') + lightboxUnit('en/company.html');
const fallbackCases = lightboxUnit('company.html', false) + lightboxUnit('en/company.html', false);
const httpChecks = [];
if (process.argv.includes('--http')) {
  for (const variant of manifest.records.flatMap(record => Object.values(record.variants))) {
    const response = await fetch('http://localhost:3000/' + variant.path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/webp/);
    assert.equal((await response.arrayBuffer()).byteLength, variant.bytes);
    httpChecks.push(variant.path);
  }
  for (const pathname of ['/', '/company.html', '/en/company.html']) assert.equal((await fetch('http://localhost:3000' + pathname)).status, 200);
  for (const pathname of ['/image-review.html', '/en/image-review.html', '/assets/documents/bizreg.png', '/tmp/documents-original/bizreg.png']) assert.equal((await fetch('http://localhost:3000' + pathname)).status, 404);
  for (const entry of redactionPlan.records) for (const kind of ['thumb', 'large']) {
    assert.equal((await fetch(`http://localhost:3000/assets/documents/${entry.name}-${kind}.webp`)).status, 404);
  }
}
console.log(JSON.stringify({ pages: pages.length, errors, lightboxUnitCases:lightboxCases,
  fallbackUnitCases:fallbackCases, imageHttpChecks:httpChecks.length,
  originalBytes:manifest.originalBytes, thumbnailBytes:manifest.thumbnailBytes, largeBytes:manifest.largeBytes,
  todos:[...todos].map(([comment, locations]) => ({comment, locations})) }, null, 2));
if (errors.length) process.exitCode = 1;
