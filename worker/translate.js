// 한글 → 영문 자동 번역
// 우선순위: 관리자가 직접 고친 번역(manual) > 기존 사이트 번역 사전(translations/en.json) > 자동 번역(auto)
// 번역기: ANTHROPIC_API_KEY 시크릿이 있으면 Claude, 없으면 Cloudflare Workers AI
import Anthropic from '@anthropic-ai/sdk';
import BASE_RAW from '../translations/en.json';
import { decodeEntities } from './util.js';

const HANGUL = /[가-힣]/;
export const hasKorean = (value) => HANGUL.test(value || '');
const norm = (value) => decodeEntities(String(value || '')).replace(/\s+/g, ' ').trim();

// 기존 en.json 은 HTML 텍스트용이라 &amp; 같은 엔티티가 들어 있다 → 평문으로 바꿔 둔다
const BASE = new Map(Object.entries(BASE_RAW).map(([ko, en]) => [norm(ko), decodeEntities(en)]));

export async function loadDictionary(env) {
  const { results } = await env.DB.prepare('SELECT ko, en, source FROM translations').all();
  const rows = new Map((results || []).map((row) => [row.ko, row]));
  const lookup = (value) => {
    const key = norm(value);
    if (!hasKorean(key)) return { en: value, source: 'none' };
    const row = rows.get(key);
    if (row && row.source === 'manual') return { en: row.en, source: 'manual' };
    if (BASE.has(key)) return { en: BASE.get(key), source: 'base' };
    if (row) return { en: row.en, source: 'auto' };
    return { en: null, source: 'missing' };
  };
  return { lookup, rows };
}

// 렌더러에 넘기는 번역 함수. 번역이 없으면 한글을 그대로 둔다.
export const translator = (dictionary) => (value) => {
  if (value == null || value === '') return value;
  const { en } = dictionary.lookup(value);
  return en == null ? value : en;
};

// 수집된 문장 중 번역이 없는 것만 번역해서 저장한다
export async function translateMissing(env, strings, { force = [] } = {}) {
  const dictionary = await loadDictionary(env);
  const forced = new Set(force.map(norm));
  // 강제 재번역도 자동 번역(auto)만 대상. 직접 수정(manual)과 기존 사이트 번역(base)은 건드리지 않는다
  const todo = [...new Set(strings.map(norm))].filter((ko) => {
    if (!hasKorean(ko)) return false;
    const { source } = dictionary.lookup(ko);
    return source === 'missing' || (forced.has(ko) && source === 'auto');
  });
  if (!todo.length) return { translated: 0, provider: null };
  const provider = env.ANTHROPIC_API_KEY ? 'claude' : 'workers-ai';
  let translated = 0;
  for (let i = 0; i < todo.length; i += 40) {
    const chunk = todo.slice(i, i + 40);
    const result = provider === 'claude' ? await withClaude(env, chunk) : await withWorkersAI(env, chunk);
    const statements = chunk.map((ko, index) => [ko, String(result[index] || '').trim()])
      .filter(([, en]) => en && !hasKorean(en))
      .map(([ko, en]) => env.DB.prepare(
        "INSERT INTO translations (ko, en, source, updated_at) VALUES (?, ?, 'auto', datetime('now')) "
        + "ON CONFLICT(ko) DO UPDATE SET en = excluded.en, updated_at = excluded.updated_at WHERE translations.source = 'auto'",
      ).bind(ko, en));
    if (statements.length) await env.DB.batch(statements);
    translated += statements.length;
  }
  return { translated, provider };
}

// 기존 사이트 번역에서 문체 예시를 뽑아 둔다 (길이가 적당한 문장 위주)
const EXAMPLES = [...BASE.entries()].filter(([ko]) => ko.length > 12 && ko.length < 70).slice(0, 30);

const SYSTEM = [
  'You translate Korean website copy for IPEUN (주식회사 이픈), a Korean company that develops needle-free injection devices for medical and aesthetic use, into natural, concise corporate English for the company website.',
  'Fixed terms: 이픈 → IPEUN, 주식회사 이픈 → IPEUN Inc., 올젯 / All-Jet → All-Jet, 인베라 → INVERA, 무바늘 → needle-free, 의료기기 → medical device, 미용기기 → aesthetic device.',
  'Keep numbers, dates, certificate/registration/application numbers, model names, product names and URLs exactly as written. Translate "제…호" numbers as "No. …".',
  'Translate only what the source says: do not add claims, benefits or marketing language that is not in the Korean text. Keep line breaks (\\n) in the same places.',
  'Match the tone of these existing translations from the same website:',
  ...EXAMPLES.map(([ko, en]) => `- ${ko} → ${en}`),
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: { translations: { type: 'array', items: { type: 'string' } } },
  required: ['translations'],
  additionalProperties: false,
};

const request = (items) => `Translate each Korean string in "items" into English. Return {"translations": [...]} with exactly ${items.length} strings in the same order.\n\n${JSON.stringify({ items })}`;

async function withClaude(env, items) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: request(items) }],
  });
  if (response.stop_reason === 'refusal') throw new Error(`번역 요청이 거절되었습니다 (${response.stop_details?.category || 'unknown'})`);
  const text = response.content.find((block) => block.type === 'text')?.text || '{}';
  const list = JSON.parse(text).translations;
  if (!Array.isArray(list) || list.length !== items.length) throw new Error('번역 결과 개수가 맞지 않습니다');
  return list;
}

async function withWorkersAI(env, items) {
  if (!env.AI) throw new Error('번역기가 설정되지 않았습니다 (AI 바인딩 없음)');
  try {
    const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: request(items) }],
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 4000,
      temperature: 0.2,
    });
    const body = typeof result.response === 'string' ? JSON.parse(result.response) : result.response;
    const list = body?.translations;
    if (Array.isArray(list) && list.length === items.length) return list;
  } catch (error) {
    console.error('workers-ai llm translate failed:', error?.message);
  }
  // 예비: 문장 단위 번역 모델
  const out = [];
  for (const text of items) {
    try {
      const result = await env.AI.run('@cf/meta/m2m100-1.2b', { text, source_lang: 'korean', target_lang: 'english' });
      out.push(result?.translated_text || '');
    } catch { out.push(''); }
  }
  return out;
}
