// Cloudflare Pages 배포용 빌드
// 1) .assetsignore 에 없는 공개 파일만 deploy/pages/dist 로 복사 (_redirects 는 Pages 주소 방식과 충돌해서 제외)
// 2) worker/ 를 하나의 파일로 묶어 dist/_worker.js/index.js 로 둔다 (Pages advanced mode)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'deploy/pages/dist');
const patterns = readFileSync(path.join(root, '.assetsignore'), 'utf8').split('\n')
  .map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  .concat(['deploy', '_redirects']);
const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*/g, '[^/]*')}$`);
const rules = patterns.map((pattern) => ({ pattern, re: glob(pattern.replace(/^\/+|\/+$/g, '')), anchored: pattern.replace(/^\*\*\//, '').includes('/') }));
const ignored = (rel) => {
  const parts = rel.split('/');
  return rules.some(({ re, anchored }) => (anchored
    ? parts.some((_, i) => re.test(parts.slice(0, i + 1).join('/')))
    : parts.some((part) => re.test(part))));
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
let files = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (ignored(rel)) continue;
    if (statSync(full).isDirectory()) walk(full);
    else { mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true }); cpSync(full, path.join(dist, rel)); files += 1; }
  }
})(root);

// 없는 주소: Pages 는 404.html 이 없으면 메인 페이지를 200으로 보여준다 → 간단한 404 페이지를 둔다
if (!existsSync(path.join(dist, '404.html'))) {
  writeFileSync(path.join(dist, '404.html'), `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>페이지를 찾을 수 없습니다 | IPEUN</title>
  <link rel="icon" type="image/svg+xml" href="/assets/logo/favicon.svg" />
  <link rel="stylesheet" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
  <style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Pretendard,system-ui,sans-serif;color:#061713;background:#fff;text-align:center;padding:24px}h1{font-size:28px;margin:24px 0 10px}p{color:#65736e;margin:0 0 28px;line-height:1.7}a.home{display:inline-block;padding:14px 26px;border-radius:50px;background:#061713;color:#fff;text-decoration:none;font-weight:600}</style>
</head>
<body>
  <main>
    <img src="/assets/logo/ipeun.svg" width="160" height="36" alt="IPEUN" />
    <h1>페이지를 찾을 수 없습니다</h1>
    <p>주소가 바뀌었거나 삭제된 페이지입니다.<br />The page you are looking for could not be found.</p>
    <a class="home" href="/">메인으로 / Home</a>
  </main>
</body>
</html>
`);
}

const wrangler = path.join(root, 'node_modules/.bin/wrangler');
execFileSync(wrangler, ['deploy', '--dry-run', '--outdir', path.join(dist, '_worker.js')], { cwd: root, stdio: 'ignore' });
if (!existsSync(path.join(dist, '_worker.js/index.js'))) throw new Error('worker bundle missing');
for (const extra of readdirSync(path.join(dist, '_worker.js'))) {
  if (extra !== 'index.js') rmSync(path.join(dist, '_worker.js', extra), { recursive: true, force: true });
}
console.log(`pages build: ${files} public files + _worker.js → ${path.relative(root, dist)}`);
