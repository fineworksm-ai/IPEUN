import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Serve only public website files, never .git, source documents or backups.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = new Set(['index.html', 'company.html', 'technology.html', 'alljet.html',
  'invera.html', 'contact.html', 'privacy.html', 'product.html', 'events.html',
  'media.html', 'publications.html']);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.avif': 'image/avif', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
};
const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  try {
    let filename = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1);
    if (!filename) filename = 'index.html';
    if (filename === 'en' || filename === 'en/') filename = 'en/index.html';
    const aliases = { product:'product.html', alljet:'alljet.html', invera:'invera.html', 'en/product':'en/product.html', 'en/alljet':'en/alljet.html', 'en/invera':'en/invera.html' };
    filename = aliases[filename.replace(/\/$/, '')] || filename;
    const parts = filename.split('/');
    const extension = path.extname(filename);
    const allowed = pages.has(filename) || ['styles.css', 'script.js'].includes(filename)
      || (parts[0] === 'en' && parts.length === 2 && pages.has(parts[1]))
      || (parts[0] === 'assets' && Object.hasOwn(mimeTypes, extension)
        && !['.html', '.css', '.js'].includes(extension));
    if (!allowed || parts.some(part => !part || part.startsWith('.') || part === '_unused')
        || filename.includes('\\') || filename.includes('\0')) throw new Error('Not public');
    const actual = await realpath(path.join(root, filename));
    if (!actual.startsWith(root + path.sep)) throw new Error('Outside website');
    const body = await readFile(actual);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extension], 'Content-Length': body.length,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : 'Not found');
  }
});
server.listen(3000, '127.0.0.1', () => console.log('IPEUN: http://localhost:3000'));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
