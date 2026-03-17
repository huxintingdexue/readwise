import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const TRANSLATE_PROMPT =
  '你是一个技术文章翻译专家。请将以下英文翻译成中文，要求：保留所有专有名词英文原文（如 Transformer、Attention、LLM），人名不翻译，翻译风格自然流畅，不要逐字直译。以下【上文参考】部分仅供理解上下文，不需要翻译。';

const TRANSLATE_SEGMENT_CHARS = 1500;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function splitByLength(text, maxChars) {
  if (!text) return [];
  const segments = [];
  for (let i = 0; i < text.length; i += maxChars) {
    segments.push(text.slice(i, i + maxChars));
  }
  return segments;
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

async function translateFullContent(apiKey, contentPlain, metaLabel) {
  if (!apiKey || !contentPlain) return '';
  const segments = splitByLength(contentPlain, TRANSLATE_SEGMENT_CHARS);
  const translatedSegments = [];
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    try {
      const translated = await deepseekTranslateSegment(
        apiKey,
        segment,
        `${metaLabel}-正文${i + 1}/${segments.length}`
      );
      translatedSegments.push(translated || segment);
    } catch (err) {
      console.error(`[retranslate] segment ${i + 1}/${segments.length} failed for ${metaLabel}: ${err.message}`);
      translatedSegments.push(segment);
    }
  }
  return translatedSegments.join('');
}

async function translateMeta(apiKey, titleEn, summaryEn, label) {
  let titleZh = '';
  let summaryZh = '';
  if (titleEn) {
    try {
      titleZh = await deepseekTranslateSegment(apiKey, titleEn, `${label}-标题`);
    } catch (err) {
      console.error(`[retranslate] title failed for ${label}: ${err.message}`);
    }
  }
  if (summaryEn) {
    try {
      summaryZh = await deepseekTranslateSegment(apiKey, summaryEn, `${label}-摘要`);
    } catch (err) {
      console.error(`[retranslate] summary failed for ${label}: ${err.message}`);
    }
  }
  return { titleZh, summaryZh };
}

async function main() {
  const dbUrl = requiredEnv('NEON_DATABASE_URL');
  const deepseekApiKey = requiredEnv('DEEPSEEK_API_KEY');

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query(`
      SELECT id, url, title_en, title_zh, summary_en, summary_zh, content_plain, content_zh, translated_chars, translation_status
      FROM articles
      WHERE content_plain IS NOT NULL
        AND length(content_plain) > 0
        AND (
          COALESCE(translated_chars, 0) < length(content_plain)
          OR content_zh IS NULL
          OR length(content_zh) = 0
          OR title_zh IS NULL
          OR summary_zh IS NULL
        )
      ORDER BY length(content_plain) ASC, published_at DESC NULLS LAST
    `);

    if (rows.length === 0) {
      console.log('[retranslate] no articles need full translation');
      return;
    }

    console.log(`[retranslate] ${rows.length} articles need full translation`);

    for (const row of rows) {
      const label = row.url || row.title_en || row.id;
      const contentPlain = row.content_plain || '';
      const translatedChars = contentPlain.length;
      const needsFull = Number(row.translated_chars || 0) < translatedChars
        || !row.content_zh
        || row.content_zh.length === 0;
      console.log(`[retranslate] start ${label} (full=${needsFull})`);

      let contentZh = row.content_zh || '';
      if (needsFull) {
        contentZh = await translateFullContent(deepseekApiKey, contentPlain, label);
      }

      const meta = await translateMeta(
        deepseekApiKey,
        row.title_en,
        row.summary_en,
        label
      );

      const finalTitleZh = row.title_zh || meta.titleZh || null;
      const finalSummaryZh = row.summary_zh || meta.summaryZh || null;
      const finalStatus = needsFull ? 'full' : row.translation_status;

      await pool.query(
        `
        UPDATE articles
        SET content_zh = $1,
            translated_chars = $2,
            translation_status = $3,
            title_zh = COALESCE($4, title_zh),
            summary_zh = COALESCE($5, summary_zh)
        WHERE id = $6
        `,
        [
          contentZh,
          translatedChars,
          finalStatus,
          finalTitleZh,
          finalSummaryZh,
          row.id
        ]
      );

      console.log(`[retranslate] done ${label}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[retranslate:fatal]', err);
  process.exit(1);
});
