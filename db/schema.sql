-- IPEUN 관리자 D1 스키마
-- 적용: npm run db:init (로컬) / npm run db:init:remote (배포 DB)

-- 관리자에서 편집하는 콘텐츠. key 하나에 JSON 하나 (site, seo, history, events, media, documents, popups)
CREATE TABLE IF NOT EXISTS content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 한글 문장 → 영문. source: auto(자동 번역) | manual(관리자가 직접 수정, 자동 번역이 덮어쓰지 않음)
CREATE TABLE IF NOT EXISTS translations (
  ko TEXT PRIMARY KEY,
  en TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 고객센터 제품 문의
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT (datetime('now')),
  lang TEXT,
  purposes TEXT,
  product TEXT,
  organization TEXT,
  name TEXT,
  email TEXT,
  message TEXT,
  status TEXT DEFAULT '신규',
  memo TEXT DEFAULT ''
);

-- 관리자에서 올린 이미지 (브라우저에서 줄여서 올림). data = base64, D1 값 크기 제한(2MB) 안에 들어가도록 원본 1.4MB 이하
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 방문 집계 (KST 날짜 기준)
CREATE TABLE IF NOT EXISTS stats (date TEXT PRIMARY KEY, pageviews INTEGER DEFAULT 0, visitors INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS stats_pages (date TEXT, path TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (date, path));
