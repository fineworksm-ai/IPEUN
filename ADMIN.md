# IPEUN 관리자 (admin)

사이트를 Cloudflare Worker로 서빙하면서 `/admin` 관리자 화면을 제공한다. fineworks 관리자와 같은 구성이다.

- 관리자 주소: `/admin/` (비밀번호 로그인, 12시간 유지)
- 데이터 저장: Cloudflare D1 (`ipeun` 데이터베이스)
- 영문 페이지: 관리자에서 한글로 저장하면, 새 문장만 자동 번역해서 `/en/` 페이지에 반영한다.
  - 번역 우선순위: 관리자에서 직접 고친 번역 > 기존 사이트 번역(`translations/en.json`) > 자동 번역
  - 번역기: `ANTHROPIC_API_KEY` 시크릿이 있으면 Claude, 없으면 Cloudflare Workers AI

## 메뉴

| 그룹 | 메뉴 | 사이트에 반영되는 곳 |
|---|---|---|
| 현황 | 대시보드 | 방문자·페이지뷰 (Worker가 직접 집계, 봇 제외) |
| | 문의 관리 | 고객센터 제품문의 폼 접수 내역 |
| 콘텐츠 | 전시·학회 | `events.html` 연도별 행사, `index.html` 새로운 소식(최신 3건) |
| | 미디어 | `media.html` 보도자료 |
| | 연혁 | `company.html` #history |
| | 인증·특허 | `company.html` #certifications, #patents |
| | 팝업/배너 | `index.html` 팝업 |
| 설정 | SEO · 메타태그 | 각 페이지 `<title>`, description, og 태그 |
| | 사이트 설정 | 모든 페이지 푸터, `company.html` #location |
| | 영문 번역 | 관리자 문장의 영문 번역 확인·수정 |

## 동작 방식

- 메뉴별로 **처음 저장하기 전까지는 정적 HTML이 그대로 보인다.**
  - 관리자 화면은 그 메뉴를 처음 열 때 현재 페이지(`?__static=1`)에서 내용을 읽어 온다.
  - 한 번 저장하면 그 영역은 D1 데이터로 렌더링된다 (`worker/render.js`, HTMLRewriter).
- 고객센터 문의 폼
  - Worker가 서빙할 때는 사이트에 접수되는 방식으로 바뀐다: 개인정보 수집·이용 동의 체크박스, 접수 버튼.
  - 정적 호스팅에서는 지금처럼 이메일 작성 방식으로 동작한다 (`script.js`가 `data-inquiry-endpoint` 유무로 판단).
- 이미지: 관리자에서 올린 이미지는 브라우저에서 WebP로 줄여 D1에 저장하고 `/files/...`로 서빙한다.
- 공개하면 안 되는 파일(`tmp/`, `tools/`, `translations/`, `worker/`, `db/`, `.dev.vars` 등)은 `.assetsignore`로 업로드에서 제외한다.

## 로컬 개발

```bash
npm install
cp .dev.vars.example .dev.vars   # 또는 직접 작성: ADMIN_PASSWORD=..., SESSION_SECRET=...
npm run db:init                  # 로컬 D1 테이블 생성 (../.ipeun-dev-state)
npm run dev                      # http://localhost:8787 , 관리자 http://localhost:8787/admin/
```

- 로컬 D1 저장 위치는 저장소 밖(`../.ipeun-dev-state`)이다. 저장소 안에 두면 파일이 바뀔 때마다 개발 서버가 재시작된다.
- 자동 번역(Workers AI)은 로컬에서도 Cloudflare 원격으로 호출된다 (무료 사용량 안에서 과금될 수 있음).

## 배포 현황

- 주소: **https://ipeun.pages.dev** (Cloudflare Pages 프로젝트 `ipeun`, Fineworks Cloudflare 계정)
- 데이터: D1 `ipeun` (id는 `deploy/pages/wrangler.toml`)
- 검색 노출: `SITE_INDEXABLE = "true"`지만 **i-peun.com 에서만** 노출된다 (`worker/index.js` `indexable`).
  - `*.pages.dev` 임시 주소는 항상 `X-Robots-Tag: noindex` + 크롤링 차단 robots.txt.
  - i-peun.com: robots.txt 허용(/admin/, /api/ 제외), `/sitemap.xml`은 Worker가 만든다(`SITEMAP_PAGES`).
- 주소 정리 (Worker): `www.i-peun.com` → `i-peun.com` 301, 예전 사이트 주소 `/certifications`·`/terms` 301 (`OLD_PATHS`).
- 예전 Worker `ipeun`(ipeun.fineworks-m.workers.dev)은 2026-10-06에 workers.dev 주소를 껐다. Worker 자체는 남아 있다.

## 배포

```bash
npm run deploy        # = npm run build:pages → wrangler pages deploy (deploy/pages)
```

- `build:pages`
  - `.assetsignore`에 없는 공개 파일만 `deploy/pages/dist`로 복사한다.
  - `worker/`를 `dist/_worker.js`로 묶는다.
  - 없는 주소용 `404.html`을 만든다.
  - `_redirects`는 Pages 주소 방식과 충돌해서 빼고, 같은 기능은 Pages가 기본으로 처리한다 (`/invera` → invera.html).
- 비밀번호 변경: `npx wrangler pages secret put ADMIN_PASSWORD --project-name ipeun` 후 다시 배포
- (선택) Claude 번역: `npx wrangler pages secret put ANTHROPIC_API_KEY --project-name ipeun` 후 다시 배포
- 저장소 루트의 `wrangler.toml`은 로컬 개발(`npm run dev`)용이다. `workers_dev = false`라서 실수로 `wrangler deploy`를 해도 workers.dev 주소가 생기지 않는다.

## 처음부터 다시 만들 때

```bash
npx wrangler d1 create ipeun                     # 새 id를 deploy/pages/wrangler.toml 에 넣는다
npm run db:init:remote
npx wrangler pages project create ipeun --production-branch main
npx wrangler pages secret put ADMIN_PASSWORD --project-name ipeun
npx wrangler pages secret put SESSION_SECRET --project-name ipeun
npm run deploy
```

## 주의: 정적 HTML과의 연결

다음 영역은 관리자 데이터로 다시 그려진다. **이 영역의 마크업(클래스, 구조)을 바꾸면 `worker/render.js`도 같이 바꿔야 한다.**

- 푸터: `footer .footer-info`
- 회사소개 `company.html`
  - `#history .timeline`
  - `#certifications .container`(섹션 제목 아래)
  - `#patents .document-grid`, `#patents .section-head h2`
  - `#location .location-grid`
- 전시·학회 `events.html`
  - `main section[id^="year-"]` (페이지 상단 `section.page-intro` 뒤에 다시 삽입)
- 메인 `index.html`: `.home-news .activity-grid`
- 미디어 `media.html`: `#press .press-grid`

알려진 차이:
- 영문 페이지에 수동으로 넣은 줄바꿈(`<br>`)은 관리자 데이터로 렌더링되는 영역에서는 사라진다. 필요하면 관리자 > 영문 번역에서 번역문에 줄바꿈을 넣는다.
- 정적 HTML의 `<!-- TODO -->` 주석은 관리자 데이터로 렌더링되는 영역에서는 출력되지 않는다.
