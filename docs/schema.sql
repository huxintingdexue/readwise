-- ReadWise 数据库建表 SQL
-- 首次部署时执行一次
-- 在 Neon Console → SQL Editor 中粘贴执行，或通过 psql 命令行执行

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 文章表
CREATE TABLE IF NOT EXISTS articles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key          TEXT NOT NULL,                        -- 'sam' | 'andrej' | 'peter' | 'lenny' | 'naval' | 'manual' | 'daily_brief'
  title_en            TEXT NOT NULL,
  title_zh            TEXT,
  summary_en          TEXT,
  summary_zh          TEXT,
  tag                 TEXT,                                 -- 文章标签：科技 | 商业 | 产品 | 人生哲学
  author             TEXT,                                 -- 手动投喂作者名
  author_avatar_url   TEXT,                                 -- 作者头像 URL（可空）
  content_en          TEXT,                                 -- 富文本原文（含 HTML 标签，用于渲染）
  content_plain       TEXT,                                 -- 纯文本版本（无 HTML 标签，用于划线字符位置计算和进度记录）
  content_zh          TEXT,                                 -- 已翻译部分（持续追加）
  translation_status  TEXT DEFAULT 'partial',               -- 'partial' | 'full' | 'summary_only'
  translated_chars    INT DEFAULT 0,                        -- 已翻译字符数，只增不减，基于 content_plain 计算
  read_status         TEXT DEFAULT 'unread',                -- 'unread' | 'read' | 'archived'
  url                 TEXT NOT NULL UNIQUE,                 -- ON CONFLICT DO NOTHING 依赖此唯一约束
  source_url          TEXT,                                 -- 手动投喂原始 URL
  published_at        TIMESTAMP,
  fetched_at          TIMESTAMP DEFAULT NOW(),
  user_id             TEXT NULL,                            -- 预留多用户，MVP 阶段由后端映射默认用户
  submitted_by        TEXT,                                 -- 手动投喂者 user_id
  status              VARCHAR(20) DEFAULT 'ready',           -- 兼容旧字段（待下线）
  translation_job_status VARCHAR(20) DEFAULT 'ready',        -- 翻译流程：'translating' | 'ready'
  publish_status      VARCHAR(20) DEFAULT 'published',       -- 'published' | 'pending_review' | 'hidden'
  hidden_reason       TEXT,                                 -- 隐藏原因（管理员）
  hidden_at           TIMESTAMP                             -- 隐藏时间
);

-- 划线表
CREATE TABLE IF NOT EXISTS highlights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID REFERENCES articles(id) ON DELETE CASCADE,
  text            TEXT NOT NULL,                            -- 划线原文（基于 content_plain）
  position_start  INT NOT NULL,                             -- 字符起始位置（基于 content_plain，非 content_en）
  position_end    INT NOT NULL,                             -- 字符结束位置（基于 content_plain，非 content_en）
  type            TEXT DEFAULT 'highlight',                 -- 'highlight' | 'reference'
  created_at      TIMESTAMP DEFAULT NOW(),
  user_id         TEXT NULL
);

-- 问答记录表
CREATE TABLE IF NOT EXISTS qa_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id    UUID REFERENCES highlights(id) ON DELETE SET NULL,
  article_id      UUID REFERENCES articles(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  answer_summary  TEXT,                                     -- AI 回答摘要 2-3 句，非完整回答
  created_at      TIMESTAMP DEFAULT NOW(),
  user_id         TEXT NULL
);

-- 阅读列表表
CREATE TABLE IF NOT EXISTS reading_list (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                  TEXT NOT NULL,                      -- 'article' | 'book'
  title                 TEXT NOT NULL,
  author                TEXT,
  url                   TEXT,                               -- 文章/博客才有
  source_highlight_id   UUID REFERENCES highlights(id) ON DELETE SET NULL,
  status                TEXT DEFAULT 'pending',             -- 'pending' | 'reading' | 'done'
  added_at              TIMESTAMP DEFAULT NOW(),
  user_id               TEXT NULL
);

-- 阅读进度表
CREATE TABLE IF NOT EXISTS reading_progress (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id        UUID REFERENCES articles(id) ON DELETE CASCADE,
  scroll_position   INT DEFAULT 0,                          -- 字符位置，基于 content_plain，与划线方案一致
  last_read_at      TIMESTAMP DEFAULT NOW(),
  user_id           TEXT NULL
);

-- 用户反馈表
CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 用户行为事件
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50),
  event VARCHAR(50),
  article_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 邀请码管理
CREATE TABLE IF NOT EXISTS invite_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  user_id VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引（提升常用查询性能）
CREATE INDEX IF NOT EXISTS idx_articles_source_key ON articles(source_key);
CREATE INDEX IF NOT EXISTS idx_articles_read_status ON articles(read_status);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_publish_status ON articles(publish_status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_highlights_article_id ON highlights(article_id);
CREATE INDEX IF NOT EXISTS idx_qa_records_article_id ON qa_records(article_id);
CREATE INDEX IF NOT EXISTS idx_reading_list_status ON reading_list(status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reading_progress_article_user
  ON reading_progress(article_id, user_id);
