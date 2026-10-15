// 영문 페이지 문구 수정 (관리자 > 영문 번역)
// 관리자가 고친 문구는 { common: { 원래 영문: 새 영문 }, index: {...}, company: {...} } 로 저장한다 (content 키 'entext')
// - common: 메뉴·푸터처럼 모든 영문 페이지에 나오는 문구
// - 페이지 키: 그 페이지에만 적용
// 페이지를 다 만든 뒤(관리자 데이터 반영 후) 마지막에 글자 단위로 바꾼다. 원래 문구가 바뀌면 그 수정은 더 이상 적용되지 않는다.
import { esc, decodeEntities } from './util.js';

export const normText = (value) => decodeEntities(String(value || '')).replace(/\s+/g, ' ').trim();

export function overridesFor(entext, key) {
  const pages = entext?.overrides || {};
  const map = new Map();
  [pages.common, pages[key]].forEach((part) => Object.entries(part || {}).forEach(([from, to]) => {
    if (to != null && String(to).trim()) map.set(normText(from), String(to));
  }));
  return map;
}

export function applyEnglishText(response, map) {
  if (!map.size) return response;
  let buffer = '';
  let skip = 0;
  return new HTMLRewriter()
    // 스크립트·스타일 안의 글자는 건드리지 않는다
    .on('script, style', { element: (el) => { skip += 1; el.onEndTag(() => { skip -= 1; }); } })
    .onDocument({
      text(chunk) {
        if (skip) return;
        buffer += chunk.text;
        if (!chunk.lastInTextNode) { chunk.remove(); return; }
        const raw = buffer;
        buffer = '';
        const next = map.get(normText(raw));
        if (next == null) { chunk.replace(raw, { html: true }); return; }
        const lead = raw.match(/^\s*/)[0];
        const trail = raw.match(/\s*$/)[0];
        chunk.replace(`${lead}${esc(next.trim()).replace(/\n/g, '<br />')}${trail}`, { html: true });
      },
    })
    .transform(response);
}
