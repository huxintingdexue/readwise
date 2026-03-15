import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const TRANSLATE_PROMPT =
  '你是一个技术文章翻译专家。请将以下英文翻译成中文，要求：保留所有专有名词英文原文（如 Transformer、Attention、LLM），人名不翻译，翻译风格自然流畅，不要逐字直译。以下【上文参考】部分仅供理解上下文，不需要翻译。';

const TRANSLATE_SEGMENT_CHARS = 1500;
const MAX_ARTICLES = Number.parseInt(process.env.INGEST_TRANSLATE_LIMIT || '10', 10);
const MAX_SEGMENTS = Number.parseInt(process.env.INGEST_SEGMENTS_PER_ARTICLE || '5', 10);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
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
    translated = await deepseekTranslateSegment(
      apiKey,
      segment,
      `正文${Math.floor(safeTranslated / TRANSLATE_SEGMENT_CHARS) + 1}`
    );
  } catch (err) {
    console.error(`[ingest-translate] segment failed for ${articleId}: ${err.message}`);
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

async function main() {
  const dbUrl = requiredEnv('NEON_DATABASE_URL');
  const apiKey = requiredEnv('DEEPSEEK_API_KEY');

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query(
      `
        SELECT id, content_plain, content_zh, translated_chars, translation_status
        FROM articles
        WHERE status = 'translating'
        ORDER BY fetched_at ASC
        LIMIT $1
      `,
      [MAX_ARTICLES]
    );

    if (!rows.length) {
      console.log('[ingest-translate] no translating articles');
      return;
    }

    for (const article of rows) {
      const contentPlain = article.content_plain || '';
      if (!contentPlain) {
        await pool.query(
          'UPDATE articles SET status = $2 WHERE id = $1',
          [article.id, 'ready']
        );
        console.log(`[ingest-translate] marked ready (empty content) ${article.id}`);
        continue;
      }

      let contentZh = article.content_zh || '';
      let translatedChars = Math.max(0, Number.parseInt(String(article.translated_chars || 0), 10) || 0);
      const totalLen = contentPlain.length;
      let done = translatedChars >= totalLen;

      for (let i = 0; i < MAX_SEGMENTS && !done; i += 1) {
        const step = await translateNextSegment(
          apiKey,
          article.id,
          contentPlain,
          contentZh,
          translatedChars
        );
        contentZh = step.contentZh;
        translatedChars = step.translatedChars;
        done = step.done;
      }

      const nextStatus = done ? 'ready' : 'translating';
      const nextTranslationStatus = done && article.translation_status !== 'summary_only'
        ? 'full'
        : article.translation_status;

      await pool.query(
        `
          UPDATE articles
          SET content_zh = $2,
              translated_chars = $3,
              status = $4,
              translation_status = $5
          WHERE id = $1
        `,
        [article.id, contentZh, Math.min(translatedChars, totalLen), nextStatus, nextTranslationStatus]
      );

      console.log(
        `[ingest-translate] ${article.id} ${translatedChars}/${totalLen} -> ${nextStatus}`
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[ingest-translate] fatal', err);
  process.exit(1);
});
