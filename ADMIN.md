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

- 주소: https://ipeun.fineworks-m.workers.dev (Fineworks Cloudflare 계정, 2026-10-06 첫 배포)
- D1: `ipeun` (id는 `wrangler.toml`)
- 검색 노출: `wrangler.toml`의 `SITE_INDEXABLE = "false"`
  - 임시 주소라서 모든 페이지에 `X-Robots-Tag: noindex`를 붙이고, robots.txt로 크롤링을 막는다.
  - 정식 도메인을 연결하는 날 `"true"`로 바꾸고 배포한다.
- 업데이트 배포: `npm run deploy`
- 비밀번호 변경: `npx wrangler secret put ADMIN_PASSWORD`

## 처음부터 다시 배포할 때

```bash
npx wrangler d1 create ipeun          # 출력된 database_id 를 wrangler.toml 에 넣는다
npm run db:init:remote                # 배포 DB에 테이블 생성
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET   # 긴 임의 문자열
# (선택) npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy                        # https://ipeun.<계정>.workers.dev
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
