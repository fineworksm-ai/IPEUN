# 작업 메모 (IPEUN)

## 관리자(admin)가 그리는 영역

이 사이트는 Cloudflare Worker(`worker/`)로 서빙되며, `/admin`에서 저장한 데이터로 일부 영역을 다시 그린다. 자세한 내용은 `ADMIN.md`를 본다.

- 아래 영역의 마크업(클래스, 구조)을 바꿀 때는 `worker/render.js`의 같은 영역 렌더 함수도 함께 바꾼다.
  - 푸터 `.footer-info`
  - `company.html`의 `#history`, `#certifications`, `#patents`, `#location`
  - `events.html`의 연도별 섹션
  - `index.html`의 `.home-news`
  - `media.html`의 `#press`
- 위 영역의 문구·항목은 관리자에서 저장한 뒤에는 HTML을 고쳐도 사이트에 보이지 않는다 (D1 데이터가 우선).
- 문의 폼(`contact.html`)의 `data-inquiry-form` 구조와 `script.js` 문의 처리 코드는 Worker가 붙이는 `data-inquiry-endpoint`, `[data-inquiry-consent]`와 연결돼 있다.
- 공개하면 안 되는 파일·폴더를 새로 만들면 `.assetsignore`에 추가한다.
- `.dev.vars`(로컬 비밀번호)는 커밋하지 않는다.
- 배포는 사용자가 요청할 때만 `npm run deploy`(Cloudflare Pages, https://ipeun.pages.dev)로 한다. `wrangler deploy`(Workers)로 배포하지 않는다.
