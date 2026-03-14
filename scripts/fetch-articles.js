import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const FEEDS = [
  { key: 'sam', urls: ['https://blog.samaltman.com/posts.atom'] },
  { key: 'andrej', urls: ['https://karpathy.github.io/feed.xml'] },
  {
    key: 'peter',
    urls: [
      'https://steipete.me/feed.xml',
      'https://steipete.me/index.xml',
      'https://steipete.me/atom.xml'
    ]
  },
  { key: 'lenny', urls: ['https://www.lennysnewsletter.com/feed'] },
  { key: 'naval', urls: ['https://nav.al/feed'] }
];

const TRANSLATE_PROMPT =
  '你是一个技术文章翻译专家。请将以下英文翻译成中文，要求：保留所有专有名词英文原文（如 Transformer、Attention、LLM），人名不翻译，翻译风格自然流畅，不要逐字直译。以下【上文参考】部分仅供理解上下文，不需要翻译。';

const DEFAULT_FETCH_PER_SOURCE = 1;
const MAX_TRANSLATE_CHARS = 2000;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optionalEnv(name) {
  return process.env[name] || '';
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function cleanupWhitespace(text) {
  return text
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTags(raw) {
  return raw
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeHtmlForStorage(html) {
  return html
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
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/style\s*\{[\s\S]*?\}/gi, ' ')
    .replace(/<\/?style>/gi, ' ')
    .replace(/<\/?script>/gi, ' ');
}

function sanitizeToPlain(input) {
  // Feed fields may include encoded tags (&lt;style&gt;...) and nested HTML.
  // Decode + strip tags multiple times to avoid leaked markup text.
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

function splitBlocks(xml, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const items = [];
  let match = re.exec(xml);
  while (match) {
    items.push(match[1]);
    match = re.exec(xml);
  }
  return items;
}

function getTagContent(block, tag) {
  const cdataRe = new RegExp(`<${tag}(?:\\s[^>]*)?><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const cdataMatch = block.match(cdataRe);
  if (cdataMatch) {
    return cdataMatch[1].trim();
  }

  const tagRe = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(tagRe);
  return match ? match[1].trim() : '';
}

function getAtomLink(entryBlock) {
  const links = [...entryBlock.matchAll(/<link\s+([^>]*?)\/?\s*>/gi)];
  for (const [, attrs] of links) {
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
    const rel = attrs.match(/rel=["']([^"']+)["']/i)?.[1] || 'alternate';
    if (href && rel === 'alternate') {
      return href;
    }
  }
  return links[0]?.[1]?.match(/href=["']([^"']+)["']/i)?.[1] || '';
}

function summarizeText(text, maxLen = 500) {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen - 1)}…`;
}

function pickBySentenceBoundary(text, maxChars) {
  if (!text) {
    return '';
  }
  if (text.length <= maxChars) {
    return text;
  }

  const boundaryRe = /[^.!?。！？\n]+[.!?。！？\n]*/g;
  const parts = text.match(boundaryRe) || [text];
  let acc = '';
  for (const part of parts) {
    if ((acc + part).length > maxChars) {
      break;
    }
    acc += part;
  }

  if (!acc) {
    return text.slice(0, maxChars);
  }
  return acc.trim();
}

async function safeFetch(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'ReadWiseBot/0.1 (+https://github.com/huxintingdexue/readwise)',
        Accept: 'application/rss+xml, application/atom+xml, text/xml, text/html;q=0.9, */*;q=0.8'
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

function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml);
  if (isAtom) {
    const entries = splitBlocks(xml, 'entry');
    return entries.map((entry) => {
      const content = getTagContent(entry, 'content') || getTagContent(entry, 'summary');
      const summary = sanitizeToPlain(content);
      return {
        title: sanitizeToPlain(getTagContent(entry, 'title')),
        url: getAtomLink(entry),
        publishedAt: getTagContent(entry, 'published') || getTagContent(entry, 'updated') || null,
        summaryEn: summarizeText(summary),
        contentHintHtml: content
      };
    });
  }

  const items = splitBlocks(xml, 'item');
  return items.map((item) => {
    const description = getTagContent(item, 'description');
    const content = getTagContent(item, 'content:encoded') || description;
    const summary = sanitizeToPlain(description || content);
    return {
      title: sanitizeToPlain(getTagContent(item, 'title')),
      url: decodeEntities(getTagContent(item, 'link')),
      publishedAt: getTagContent(item, 'pubDate') || getTagContent(item, 'dc:date') || null,
      summaryEn: summarizeText(summary),
      contentHintHtml: content
    };
  });
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

async function fetchAndCleanArticleHtml(url, fallbackHintHtml, articleTitle = '') {
  try {
    const rawHtml = await safeFetch(url, 20000);
    const main = chooseMainHtmlDocument(rawHtml);
    const cleanHtml = normalizeHtmlForStorage(main);
    const extractedTitle = cleanHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
    const titleForDedupe = articleTitle || extractedTitle;
    const contentPlain = htmlToPlain(cleanHtml, titleForDedupe);
    if (!contentPlain) {
      throw new Error('Cleaned content is empty');
    }
    return {
      contentEn: cleanHtml,
      contentPlain,
      summaryOnly: false
    };
  } catch (err) {
    const fallbackHtml = normalizeHtmlForStorage(
      fallbackHintHtml || `<p>${decodeEntities(url)}</p>`
    );
    const fallbackPlain = htmlToPlain(fallbackHtml);
    return {
      contentEn: fallbackHtml,
      contentPlain: fallbackPlain,
      summaryOnly: true,
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

async function translateArticleParts(apiKey, article) {
  if (!apiKey) {
    return {
      titleZh: '',
      summaryZh: '',
      contentZh: '',
      translatedChars: 0
    };
  }

  const chunk = pickBySentenceBoundary(article.contentPlain, MAX_TRANSLATE_CHARS);
  try {
    const [titleZh, summaryZh, contentZh] = await Promise.all([
      deepseekTranslateSegment(apiKey, article.titleEn, '标题'),
      deepseekTranslateSegment(apiKey, article.summaryEn, '摘要'),
      deepseekTranslateSegment(apiKey, chunk, '正文片段')
    ]);
    return {
      titleZh,
      summaryZh,
      contentZh,
      translatedChars: contentZh ? chunk.length : 0
    };
  } catch (err) {
    console.warn(`[translate] failed for ${article.url}: ${err.message}`);
    return {
      titleZh: '',
      summaryZh: '',
      contentZh: '',
      translatedChars: 0
    };
  }
}

function parsePublishedAt(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

async function insertArticle(pool, article, options = {}) {
  const repairSummary = options.repairSummary === true;
  const query = repairSummary
    ? `
    INSERT INTO articles (
      source_key,
      title_en,
      title_zh,
      summary_en,
      summary_zh,
      content_en,
      content_plain,
      content_zh,
      translation_status,
      translated_chars,
      read_status,
      url,
      published_at,
      user_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'unread', $11, $12, NULL
    )
    ON CONFLICT (url) DO UPDATE SET
      summary_en = EXCLUDED.summary_en,
      summary_zh = EXCLUDED.summary_zh,
      content_plain = EXCLUDED.content_plain
    RETURNING id, (xmax = 0) AS inserted
  `
    : `
    INSERT INTO articles (
      source_key,
      title_en,
      title_zh,
      summary_en,
      summary_zh,
      content_en,
      content_plain,
      content_zh,
      translation_status,
      translated_chars,
      read_status,
      url,
      published_at,
      user_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'unread', $11, $12, NULL
    )
    ON CONFLICT (url) DO NOTHING
    RETURNING id
  `;

  const values = [
    article.sourceKey,
    article.titleEn,
    article.titleZh || null,
    article.summaryEn || null,
    article.summaryZh || null,
    article.contentEn || null,
    article.contentPlain || null,
    article.contentZh || null,
    article.translationStatus,
    article.translatedChars,
    article.url,
    parsePublishedAt(article.publishedAt)
  ];

  const { rows } = await pool.query(query, values);
  if (!repairSummary) {
    return { inserted: rows.length > 0, repaired: false };
  }
  if (rows.length === 0) {
    return { inserted: false, repaired: false };
  }
  return {
    inserted: Boolean(rows[0].inserted),
    repaired: !Boolean(rows[0].inserted)
  };
}

async function processFeed(pool, deepseekApiKey, feed, fetchCount) {
  let xml = '';
  let lastError = null;
  for (const candidateUrl of feed.urls) {
    try {
      xml = await safeFetch(candidateUrl);
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[feed:${feed.key}] feed url failed: ${candidateUrl} -> ${err.message}`);
    }
  }
  if (!xml) {
    throw lastError || new Error('No available feed URL');
  }

  const parsed = parseFeed(xml)
    .filter((item) => item.url && item.title)
    .slice(0, fetchCount);

  console.log(`[feed:${feed.key}] found ${parsed.length} candidates`);

  let insertedCount = 0;
  let repairedCount = 0;
  const repairSummary = optionalEnv('REPAIR_SUMMARY') === '1';
  for (const item of parsed) {
    const cleaned = await fetchAndCleanArticleHtml(item.url, item.contentHintHtml, item.title);
    const articleBase = {
      sourceKey: feed.key,
      titleEn: item.title,
      summaryEn: item.summaryEn,
      contentEn: cleaned.contentEn,
      contentPlain: cleaned.contentPlain,
      url: item.url,
      publishedAt: item.publishedAt,
      translationStatus: cleaned.summaryOnly ? 'summary_only' : 'partial',
      translatedChars: 0,
      titleZh: '',
      summaryZh: '',
      contentZh: ''
    };

    if (!cleaned.summaryOnly) {
      const translated = await translateArticleParts(deepseekApiKey, articleBase);
      articleBase.titleZh = translated.titleZh;
      articleBase.summaryZh = translated.summaryZh;
      articleBase.contentZh = translated.contentZh;
      articleBase.translatedChars = translated.translatedChars;
    }

    const writeResult = await insertArticle(pool, articleBase, { repairSummary });
    if (writeResult.inserted) {
      insertedCount += 1;
      console.log(`[inserted] ${item.title} (${item.url})`);
    } else if (writeResult.repaired) {
      repairedCount += 1;
      console.log(`[repaired] summary fields updated for existing url: ${item.url}`);
    } else {
      console.log(`[skipped] already exists: ${item.url}`);
    }

    if (cleaned.summaryOnly && cleaned.error) {
      console.warn(`[fallback-summary] ${item.url} -> ${cleaned.error}`);
    }
  }

  return { insertedCount, repairedCount };
}

async function main() {
  const dbUrl = requiredEnv('NEON_DATABASE_URL');
  const deepseekApiKey = optionalEnv('DEEPSEEK_API_KEY');
  const initialFetch = Number.parseInt(optionalEnv('INITIAL_FETCH') || '', 10);
  const fetchCount = Number.isFinite(initialFetch) && initialFetch > 0
    ? initialFetch
    : DEFAULT_FETCH_PER_SOURCE;

  console.log(`[config] fetchCountPerSource=${fetchCount}`);
  const repairSummary = optionalEnv('REPAIR_SUMMARY') === '1';
  if (repairSummary) {
    console.log('[config] REPAIR_SUMMARY=1 (will update summary_en/summary_zh on existing URLs)');
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    let totalInserted = 0;
    let totalRepaired = 0;
    for (const feed of FEEDS) {
      try {
        const { insertedCount, repairedCount } = await processFeed(pool, deepseekApiKey, feed, fetchCount);
        totalInserted += insertedCount;
        totalRepaired += repairedCount;
      } catch (err) {
        console.error(`[feed:${feed.key}] failed: ${err.message}`);
      }
    }

    console.log(`[done] totalInserted=${totalInserted} totalRepaired=${totalRepaired}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
