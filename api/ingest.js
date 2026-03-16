import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getUserIdFromInviteCode, isAdmin } from './_utils/auth.js';

dotenv.config({ path: '.env.local' });

const TRANSLATE_PROMPT =
  '你是一个技术文章翻译专家。请将以下英文翻译成中文，要求：保留所有专有名词英文原文（如 Transformer、Attention、LLM），人名不翻译，翻译风格自然流畅，不要逐字直译。以下【上文参考】部分仅供理解上下文，不需要翻译。';

const TRANSLATE_SEGMENT_CHARS = 1500;

let pool;
let cachedAuthorsTable = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.NEON_DATABASE_URL;
    if (!connectionString) {
      throw new Error('Missing NEON_DATABASE_URL');
    }
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

async function getUserId(req, res) {
  const inviteCode = req.headers['x-invite-code'] || '';
  const userId = await getUserIdFromInviteCode(inviteCode);
  if (!userId) {
    res.status(401).json({ error: 'unauthorized', message: '邀请码无效' });
    return null;
  }
  return userId;
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function cleanupWhitespace(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTags(raw) {
  return String(raw || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeHtmlForStorage(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, '')
    .replace(/<math[\s\S]*?<\/math>/gi, '')
    .replace(/<script[^>]*type=["']math\/tex[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*class=["'][^"']*(katex|mathjax)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, '')
    .trim();
}

function stripPotentialStyleScriptText(raw) {
  return String(raw || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/style\s*\{[\s\S]*?\}/gi, ' ')
    .replace(/<\/?style>/gi, ' ')
    .replace(/<\/?script>/gi, ' ');
}

function sanitizeToPlain(input) {
  let text = input || '';
  for (let i = 0; i < 2; i += 1) {
    text = decodeEntities(text);
    text = stripPotentialStyleScriptText(text);
    text = stripTags(text);
  }
  return cleanupWhitespace(text);
}

function removeLeadingTitleDuplicate(contentPlain, title) {
  if (!contentPlain || !title) {
    return contentPlain;
  }
  const normalizedTitle = sanitizeToPlain(title).replace(/\s+/g, ' ').trim();
  if (!normalizedTitle) {
    return contentPlain;
  }
  const escaped = normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const duplicatedTitleRe = new RegExp(`^\\s*${escaped}\\s*[:：\\-–—|·]*\\s*`, 'i');
  const cleaned = contentPlain.replace(duplicatedTitleRe, '');
  return cleaned.length < contentPlain.length ? cleaned.trimStart() : contentPlain;
}

function htmlToPlain(html, titleForDedupe = '') {
  const plain = sanitizeToPlain(html);
  return removeLeadingTitleDuplicate(plain, titleForDedupe);
}

function splitByLength(text, maxChars) {
  if (!text) return [];
  const segments = [];
  for (let i = 0; i < text.length; i += maxChars) {
    segments.push(text.slice(i, i + maxChars));
  }
  return segments;
}

function chooseMainHtmlDocument(html) {
  const article = html.match(/<article(?:\s[^>]*)?>[\s\S]*?<\/article>/i)?.[0];
  if (article) {
    return article;
  }
  const main = html.match(/<main(?:\s[^>]*)?>[\s\S]*?<\/main>/i)?.[0];
  if (main) {
    return main;
  }
  const body = html.match(/<body(?:\s[^>]*)?>[\s\S]*?<\/body>/i)?.[0];
  return body || html;
}

async function safeFetch(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ReadWiseBot/0.1 (+https://github.com/huxintingdexue/readwise)',
        Accept: 'text/html;q=0.9, */*;q=0.8'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function summarizeText(text, maxLen = 500) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function extractMetaContent(html, key) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const match = html.match(re);
  return match ? match[1] : '';
}

function extractTitle(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const ogTitle = extractMetaContent(html, 'og:title');
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return sanitizeToPlain(h1 || ogTitle || titleTag || '');
}

function parsePublishedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function extractPublishedAt(html) {
  const candidates = [
    extractMetaContent(html, 'article:published_time'),
    extractMetaContent(html, 'og:article:published_time'),
    extractMetaContent(html, 'pubdate'),
    extractMetaContent(html, 'date'),
    extractMetaContent(html, 'dc.date'),
    html.match(/<time[^>]*datetime=["']([^"']+)["'][^>]*>/i)?.[1]
  ];
  for (const value of candidates) {
    const parsed = parsePublishedAt(value);
    if (parsed) return parsed;
  }
  return null;
}

function extractAuthor(html) {
  const candidates = [
    extractMetaContent(html, 'author'),
    extractMetaContent(html, 'article:author'),
    extractMetaContent(html, 'twitter:creator')
  ];
  for (const value of candidates) {
    const raw = sanitizeToPlain(value || '');
    if (!raw) continue;
    const cleaned = raw.replace(/^@/, '').trim();
    if (cleaned && !/^https?:\/\//i.test(cleaned)) {
      return cleaned;
    }
  }
  return '';
}

async function fetchAndCleanArticleHtml(url) {
  try {
    const rawHtml = await safeFetch(url);
    const main = chooseMainHtmlDocument(rawHtml);
    const cleanHtml = normalizeHtmlForStorage(main);
    const title = extractTitle(rawHtml) || extractTitle(cleanHtml);
    const contentPlain = htmlToPlain(cleanHtml, title);
    if (!contentPlain) {
      throw new Error('Cleaned content is empty');
    }
    return {
      title,
      contentEn: cleanHtml,
      contentPlain,
      summaryOnly: false,
      rawHtml
    };
  } catch (err) {
    const fallbackHtml = normalizeHtmlForStorage(`<p>${decodeEntities(url)}</p>`);
    const fallbackPlain = htmlToPlain(fallbackHtml);
    return {
      title: '',
      contentEn: fallbackHtml,
      contentPlain: fallbackPlain,
      summaryOnly: true,
      rawHtml: '',
      error: err.message
    };
  }
}

// Remove any leaked prompt prefix like 【待翻译标题】 that DeepSeek occasionally echoes back
function stripPromptPrefix(text) {
  if (!text) return text;
  return text.replace(/^【待翻译[^】]*】\s*/m, '').trim() || text;
}

async function deepseekTranslateSegment(apiKey, text, label) {
  if (!apiKey || !text) {
    return '';
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.2,
      messages: [
        { role: 'system', content: TRANSLATE_PROMPT },
        {
          role: 'user',
          content: `【待翻译${label}】\n${text}`
        }
      ]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return stripPromptPrefix(data?.choices?.[0]?.message?.content?.trim() || '');
}

async function translateNextSegment(apiKey, articleId, contentPlain, contentZh, translatedChars) {
  const safeTranslated = Math.max(0, Number.parseInt(String(translatedChars || 0), 10) || 0);
  const totalLen = contentPlain.length;
  if (safeTranslated >= totalLen) {
    return {
      contentZh: contentZh || '',
      translatedChars: totalLen,
      done: true
    };
  }
  const segment = contentPlain.slice(safeTranslated, safeTranslated + TRANSLATE_SEGMENT_CHARS);
  let translated = '';
  try {
    translated = await deepseekTranslateSegment(apiKey, segment, `正文${Math.floor(safeTranslated / TRANSLATE_SEGMENT_CHARS) + 1}`);
  } catch (err) {
    console.error(`[ingest] translate segment failed for ${articleId}: ${err.message}`);
    translated = segment;
  }
  const nextZh = `${contentZh || ''}${translated || segment}`;
  const nextChars = safeTranslated + segment.length;
  return {
    contentZh: nextZh,
    translatedChars: nextChars,
    done: nextChars >= totalLen
  };
}

async function translateMetaIfNeeded(apiKey, article) {
  if (!apiKey) return { titleZh: article.title_zh || '', summaryZh: article.summary_zh || '' };
  let titleZh = article.title_zh || '';
  let summaryZh = article.summary_zh || '';
  if (!titleZh && article.title_en) {
    try {
      titleZh = await deepseekTranslateSegment(apiKey, article.title_en, '标题');
    } catch (err) {
      console.error(`[ingest] title translate failed for ${article.id}: ${err.message}`);
    }
  }
  if (!summaryZh && article.summary_en) {
    try {
      summaryZh = await deepseekTranslateSegment(apiKey, article.summary_en, '摘要');
    } catch (err) {
      console.error(`[ingest] summary translate failed for ${article.id}: ${err.message}`);
    }
  }
  return { titleZh, summaryZh };
}

async function hasAuthorsTable(poolClient) {
  if (cachedAuthorsTable !== null) {
    return cachedAuthorsTable;
  }
  try {
    const { rows } = await poolClient.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'authors' LIMIT 1"
    );
    cachedAuthorsTable = rows.length > 0;
  } catch (_) {
    cachedAuthorsTable = false;
  }
  return cachedAuthorsTable;
}

async function resolveAuthor(poolClient, rawAuthor) {
  const author = String(rawAuthor || '').trim();
  if (!author) return null;
  const authorsTable = await hasAuthorsTable(poolClient);
  try {
    if (authorsTable) {
      const { rows } = await poolClient.query(
        'SELECT name FROM authors WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [author]
      );
      return rows[0]?.name || author;
    }
    const { rows } = await poolClient.query(
      'SELECT author FROM articles WHERE LOWER(author) = LOWER($1) LIMIT 1',
      [author]
    );
    return rows[0]?.author || author;
  } catch (_) {
    return author;
  }
}

async function handleIngestSubmit(req, res, userId) {
  const { url } = req.body || {};
  const sourceUrl = String(url || '').trim();
  if (!sourceUrl) {
    res.status(400).json({ error: 'bad_request', message: 'url is required' });
    return;
  }

  const poolClient = getPool();

  if (!isAdmin(userId)) {
    const limitSql = `
      SELECT COUNT(*)::int AS count
      FROM articles
      WHERE submitted_by = $1
        AND fetched_at >= CURRENT_DATE
        AND fetched_at < CURRENT_DATE + INTERVAL '1 day'
    `;
    const { rows } = await poolClient.query(limitSql, [userId]);
    if ((rows[0]?.count || 0) >= 5) {
      res.status(429).json({ error: 'rate_limited', message: '今日投喂次数已达上限（5篇）' });
      return;
    }
  }

  const dupCheck = await poolClient.query(
    'SELECT id FROM articles WHERE source_url = $1 OR url = $1 LIMIT 1',
    [sourceUrl]
  );
  if (dupCheck.rows.length > 0) {
    res.status(200).json({ success: false, message: '文章已存在', articleId: dupCheck.rows[0].id });
    return;
  }

  const cleaned = await fetchAndCleanArticleHtml(sourceUrl);
  const rawHtml = cleaned.rawHtml || '';
  const title = cleaned.title || extractTitle(rawHtml) || sanitizeToPlain(sourceUrl);
  const publishedAt = extractPublishedAt(rawHtml);
  const rawAuthor = extractAuthor(rawHtml);
  const author = await resolveAuthor(poolClient, rawAuthor);
  const summaryEn = summarizeText(cleaned.contentPlain);

  const translationStatus = cleaned.summaryOnly ? 'summary_only' : 'partial';

  const insertSql = `
    INSERT INTO articles (
      source_key,
      title_en,
      title_zh,
      summary_en,
      summary_zh,
      author,
      content_en,
      content_plain,
      content_zh,
      translation_status,
      translated_chars,
      is_fully_translated,
      read_status,
      url,
      source_url,
      published_at,
      status,
      submitted_by,
      user_id
    ) VALUES (
      $1, $2, NULL, $3, NULL, $4, $5, $6, '', $7, 0, false, 'unread', $8, $9, $10, 'translating', $11, NULL
    )
    RETURNING id
  `;

  const { rows } = await poolClient.query(insertSql, [
    'manual',
    title || sourceUrl,
    summaryEn || null,
    author || null,
    cleaned.contentEn || null,
    cleaned.contentPlain || null,
    translationStatus,
    sourceUrl,
    sourceUrl,
    publishedAt,
    userId
  ]);

  res.status(200).json({ success: true, articleId: rows[0].id, status: 'translating' });
}

async function handleTranslateStep(req, res, userId) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'service_unavailable', message: 'Missing DEEPSEEK_API_KEY' });
    return;
  }

  const { article_id } = req.body || {};
  if (!article_id) {
    res.status(400).json({ error: 'bad_request', message: 'article_id is required' });
    return;
  }

  const poolClient = getPool();
  const { rows } = await poolClient.query(
    `
      SELECT id, title_en, title_zh, summary_en, summary_zh, content_plain, content_zh, translated_chars, status, submitted_by, translation_status
      FROM articles
      WHERE id = $1
      LIMIT 1
    `,
    [article_id]
  );

  if (!rows.length) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const article = rows[0];
  if (!isAdmin(userId) && article.submitted_by !== userId) {
    res.status(403).json({ error: 'forbidden', message: '无权限' });
    return;
  }
  if (article.status !== 'translating') {
    res.status(200).json({ success: true, status: article.status });
    return;
  }

  const contentPlain = article.content_plain || '';
  if (!contentPlain) {
    await poolClient.query(
      'UPDATE articles SET status = $2 WHERE id = $1',
      [article.id, 'ready']
    );
    res.status(200).json({ success: true, status: 'ready' });
    return;
  }

  const meta = await translateMetaIfNeeded(apiKey, article);
  const step = await translateNextSegment(
    apiKey,
    article.id,
    contentPlain,
    article.content_zh || '',
    article.translated_chars || 0
  );

  const nextStatus = step.done ? 'ready' : 'translating';
  const nextTranslationStatus = step.done && article.translation_status !== 'summary_only'
    ? 'full'
    : article.translation_status;
  const isFullyTranslated = step.done && nextTranslationStatus !== 'summary_only';

  await poolClient.query(
    `
      UPDATE articles
      SET title_zh = COALESCE($2, title_zh),
          summary_zh = COALESCE($3, summary_zh),
          content_zh = $4,
          translated_chars = $5,
          status = $6,
          translation_status = $7,
          is_fully_translated = $8
      WHERE id = $1
    `,
    [
      article.id,
      meta.titleZh || null,
      meta.summaryZh || null,
      step.contentZh,
      step.translatedChars,
      nextStatus,
      nextTranslationStatus,
      isFullyTranslated
    ]
  );

  res.status(200).json({ success: true, status: nextStatus });
}

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const action = String(req.body?.action || '').trim();

  try {
    if (action === 'translate') {
      await handleTranslateStep(req, res, userId);
      return;
    }
    await handleIngestSubmit(req, res, userId);
  } catch (err) {
    console.error('[api/ingest] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
