import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const TRANSLATE_PROMPT =
  '你是一个技术文章翻译专家。请将以下英文翻译成中文，要求：保留所有专有名词英文原文（如 Transformer、Attention、LLM），人名不翻译，翻译风格自然流畅，不要逐字直译。以下【上文参考】部分仅供理解上下文，不需要翻译。';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
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

function normalizeTitle(raw) {
  return sanitizeToPlain(raw || '').replace(/\s+/g, ' ').trim();
}

function extractMetaContent(html, key) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const match = html.match(re);
  return match ? match[1] : '';
}

function extractMetaItemprop(html, key) {
  const re = new RegExp(`<meta[^>]+itemprop=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const match = html.match(re);
  return match ? match[1] : '';
}

function stripTitleSuffix(title, author = '') {
  if (!title) return title;
  let cleaned = title;
  const siteSuffixes = [
    'Reuters',
    'Bloomberg',
    'TechCrunch',
    'Financial Times',
    'The Verge',
    'The New York Times',
    'WSJ',
    'Wall Street Journal',
    'CNN',
    'BBC'
  ];
  const authorTrim = author ? author.trim() : '';
  const separators = [' - ', ' | ', ' — ', ' – ', ' · '];

  for (const sep of separators) {
    if (!cleaned.includes(sep)) continue;
    const [head, tail] = cleaned.split(sep);
    if (authorTrim && tail.toLowerCase().includes(authorTrim.toLowerCase())) {
      cleaned = head;
      continue;
    }
    if (siteSuffixes.some((site) => tail.toLowerCase().includes(site.toLowerCase()))) {
      cleaned = head;
    }
  }

  if (authorTrim) {
    const authorRe = new RegExp(`\\s+${authorTrim.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'i');
    cleaned = cleaned.replace(authorRe, '');
  }

  return cleaned.trim();
}

function extractTitle(html, author = '') {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const ogTitle = extractMetaContent(html, 'og:title');
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const raw = ogTitle || h1 || titleTag || '';
  const normalized = normalizeTitle(raw);
  return stripTitleSuffix(normalized, author);
}

function parsePublishedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function extractPublishedAt(html) {
  const candidates = [
    extractMetaContent(html, 'article:published_time'),
    extractMetaContent(html, 'og:article:published_time'),
    extractMetaContent(html, 'parsely-pub-date'),
    extractMetaContent(html, 'pubdate'),
    extractMetaContent(html, 'date'),
    extractMetaContent(html, 'dc.date'),
    extractMetaItemprop(html, 'datePublished'),
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
    extractMetaContent(html, 'twitter:creator'),
    extractMetaContent(html, 'parsely-author'),
    extractMetaItemprop(html, 'author')
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

function summarizeText(text, maxLen = 500) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function isUrlLike(text) {
  return /^https?:\/\//i.test(String(text || '').trim());
}

function deriveTitleFromPlain(text) {
  const cleaned = cleanupWhitespace(text || '');
  if (!cleaned) return '';
  const firstLine = cleaned.split('\n')[0].trim();
  if (firstLine) return firstLine.slice(0, 120);
  return cleaned.slice(0, 120);
}

async function safeFetch(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
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

function chooseMainHtmlDocument(html) {
  const article = html.match(/<article(?:\s[^>]*)?>[\s\S]*?<\/article>/i)?.[0];
  if (article) return article;
  const main = html.match(/<main(?:\s[^>]*)?>[\s\S]*?<\/main>/i)?.[0];
  if (main) return main;
  const body = html.match(/<body(?:\s[^>]*)?>[\s\S]*?<\/body>/i)?.[0];
  return body || html;
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
        { role: 'user', content: `【待翻译${label}】\n${text}` }
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

async function translateMeta(apiKey, titleEn, summaryEn, label) {
  let titleZh = '';
  let summaryZh = '';
  if (titleEn) {
    try {
      titleZh = await deepseekTranslateSegment(apiKey, titleEn, `${label}-标题`);
    } catch (err) {
      console.error(`[repair-meta] title failed for ${label}: ${err.message}`);
    }
  }
  if (summaryEn) {
    try {
      summaryZh = await deepseekTranslateSegment(apiKey, summaryEn, `${label}-摘要`);
    } catch (err) {
      console.error(`[repair-meta] summary failed for ${label}: ${err.message}`);
    }
  }
  return { titleZh, summaryZh };
}

async function main() {
  const dbUrl = requiredEnv('NEON_DATABASE_URL');
  const apiKey = requiredEnv('DEEPSEEK_API_KEY');
  const ids = process.argv.slice(2).map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    console.error('Usage: node scripts/repair-ingest-meta.js <article_id> [article_id...]');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query(
      `
        SELECT id, source_url, title_en, title_zh, summary_en, summary_zh, author, published_at, fetched_at, content_plain
        FROM articles
        WHERE id = ANY($1)
      `,
      [ids]
    );

    for (const row of rows) {
      const url = row.source_url || row.url;
      if (!url) {
        console.warn(`[repair-meta] skip ${row.id} (missing url)`);
        continue;
      }

      let rawHtml = '';
      let cleanHtml = '';
      let extractedAuthor = '';
      let extractedTitle = '';
      let extractedPublished = null;

      try {
        rawHtml = await safeFetch(url);
        const main = chooseMainHtmlDocument(rawHtml);
        cleanHtml = normalizeHtmlForStorage(main);
        extractedAuthor = extractAuthor(rawHtml) || extractAuthor(cleanHtml);
        extractedTitle = extractTitle(rawHtml, extractedAuthor) || extractTitle(cleanHtml, extractedAuthor);
        extractedPublished = extractPublishedAt(rawHtml) || extractPublishedAt(cleanHtml);
      } catch (err) {
        console.warn(`[repair-meta] fetch failed for ${url}: ${err.message}`);
      }

      const contentPlain = row.content_plain || sanitizeToPlain(cleanHtml);
      const fallbackTitle = (() => {
        if (row.title_en && !isUrlLike(row.title_en)) return row.title_en;
        const derived = deriveTitleFromPlain(contentPlain);
        if (derived) return derived;
        try {
          return new URL(url).hostname.replace(/^www\./, '');
        } catch (_) {
          return '未命名文章';
        }
      })();

      const normalizedTitle = extractedTitle && !isUrlLike(extractedTitle)
        ? extractedTitle
        : fallbackTitle;
      const summaryEn = summarizeText(contentPlain);

      const meta = await translateMeta(apiKey, normalizedTitle, summaryEn, url);

      await pool.query(
        `
          UPDATE articles
          SET title_en = $2,
              title_zh = $3,
              summary_en = $4,
              summary_zh = $5,
              author = $6,
              published_at = COALESCE($7, published_at, fetched_at)
          WHERE id = $1
        `,
        [
          row.id,
          normalizedTitle,
          meta.titleZh || row.title_zh,
          summaryEn,
          meta.summaryZh || row.summary_zh,
          extractedAuthor || row.author,
          extractedPublished
        ]
      );

      console.log(`[repair-meta] updated ${row.id}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[repair-meta:fatal]', err);
  process.exit(1);
});
