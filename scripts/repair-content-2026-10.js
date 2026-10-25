import dotenv from 'dotenv';
import { Pool } from 'pg';
import { fetchAndExtract } from './lib/extract-article.js';
import { checkTranslatedArticle } from '../api/_utils/content-quality.js';

dotenv.config({ path: '.env.local' });

// 2026-10 一次性数据修复（AI 编辑室重建后回测发现的问题）。默认只预览，DRY_RUN=0 才写库。
// 1. 中文正文存成了 \uXXXX 转义：原地还原为汉字
// 2. 英文原文字段被填成了中文：重新抓英文原文，只改 content_en / content_plain（划线以 content_zh 为基准，不受影响）
// 3. 隐藏误发为 A 档的 Naval 播客节目页
// 4. 修正过时或错误的人物简介

const DRY_RUN = process.env.DRY_RUN !== '0';

const ESCAPED_ZH_IDS = [
  'a55dc2c8-b45d-4d52-8e8e-bfdcaaae82f4',
  '073557a9-e23f-40c0-88c6-563ccb4f5942',
  'ab784e4c-2f85-4912-b2de-c8ed41c98af7',
  '525f678b-720a-4112-8f16-f0022e3fabdd',
  'fc7382b2-de1b-46a2-bcdc-4d3ca6055f26'
];

const CHINESE_IN_EN_IDS = [
  '92f857e5-310b-47de-88ab-ecfa6a6bac21',
  'b5770c0c-535a-4833-98ac-1d2fcbe47732',
  'd17d7050-4d30-4a4d-accd-89726be96e7e',
  '3053fe48-100a-47fd-b06d-d41ceae8ff56',
  '45588c4c-8ece-42a2-b8fa-cf55df2e97c7'
];

const HIDE = [
  { id: 'ada7ab62-ccaa-4533-9668-b8c6bef2d611', reason: '播客节目页，正文仅 380 字符且标题未翻译，误按 A 档发布' }
];

const AUTHOR_FIXES = {
  cat_wu: {
    name_zh: 'Cat Wu',
    bio_one_line: 'Anthropic Claude Code 产品负责人',
    bio_full: 'Cat Wu 是 Anthropic Claude Code 的产品负责人。她早年在 Scale AI 和 Dagster 做产品工程师，后转做风险投资，2024 年 8 月加入 Anthropic，参与把 Claude 从聊天助手推向编程工具和自主 Agent。她的产品理念是「站在指数曲线上」：为几个月后的模型能力设计产品，而不是为今天的模型。'
  },
  yann: {
    bio_one_line: 'AMI Labs 创始人 · 前 Meta 首席 AI 科学家',
    bio_full: '杨立昆是卷积神经网络的发明者，与 Geoffrey Hinton、Yoshua Bengio 并称深度学习三巨头，共获 2018 年图灵奖。他在 Meta 领导 AI 研究 12 年，2025 年底离开，创办 AMI Labs，2026 年 3 月宣布融资 10.3 亿美元，押注基于 JEPA 架构的「世界模型」。他长期认为大语言模型路线无法通向真正的智能。'
  },
  peter_steinberger: {
    bio_one_line: 'OpenClaw 创始人 · OpenAI 个人 Agent 方向',
    bio_full: '彼得·斯坦伯格是 OpenClaw（小龙虾）的创始人，此前创办了被广泛使用的 PDF 框架 PSPDFKit。2026 年初 OpenClaw 爆红后，他加入 OpenAI 推动下一代个人 Agent，OpenClaw 转入基金会继续以开源方式运营。他是极度热爱动手构建的 builder。'
  },
  kevin_weil: {
    bio_one_line: '前 OpenAI CPO · AI 科学创业者',
    bio_full: '凯文·韦尔曾任 Instagram、Twitter 产品负责人，2024 年加入 OpenAI 任首席产品官，2025 年创立并领导 OpenAI for Science。2026 年 4 月离开 OpenAI，正在创办一家用 AI 加速科学发现的公司。'
  },
  buffett: {
    bio_one_line: '伯克希尔董事长 · 股神',
    bio_full: '沃伦·巴菲特是全球最伟大的投资者之一，用 60 多年把一家纺织公司改造成伯克希尔·哈撒韦投资帝国。2026 年 1 月起由 Greg Abel 接任 CEO，巴菲特继续担任董事长。他的年度股东信被全球投资者视为必读，充满对商业、人性和长期主义的洞察。'
  },
  nathan_lambert: {
    bio_one_line: '开源模型研究者 · Interconnects 主理人',
    bio_full: '内森·兰伯特是开源大模型后训练领域的代表研究者，UC Berkeley 博士，曾在 Hugging Face 领导 RLHF 团队，后在 Allen Institute for AI（Ai2）负责 Olmo、Tülu 等开源模型的后训练，著有《The RLHF Book》。他主理的 Newsletter「Interconnects」是跟踪开源模型和训练方法的重要信息源。'
  },
  fei_fei_li: {
    bio_one_line: 'World Labs 创始人 · ImageNet 之母',
    bio_full: '李飞飞是斯坦福大学教授、斯坦福以人为本人工智能研究院（HAI）联合院长，主导创建了 ImageNet 数据集，直接催生了深度学习在计算机视觉领域的革命。她曾任谷歌云 AI 首席科学家，现为空间智能公司 World Labs 的联合创始人兼 CEO。'
  },
  andrej: {
    bio_one_line: 'Eureka Labs 创始人 · 前特斯拉 AI 总监',
    bio_full: '安德烈·卡帕西是 OpenAI 创始成员、前特斯拉 AI 总监，2024 年创办 AI 教育公司 Eureka Labs。他以把复杂的 AI 概念讲得深入浅出著称，神经网络课程被数百万人学习，「Vibe Coding」「软件 3.0」等说法都出自他。'
  }
};

function decodeEscapes(text) {
  return String(text || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

async function main() {
  const connectionString = process.env.NEON_DATABASE_URL;
  if (!connectionString) throw new Error('Missing NEON_DATABASE_URL');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  console.log(`[repair] mode=${DRY_RUN ? 'DRY_RUN（只预览）' : 'WRITE'}`);

  try {
    const highlightCount = async (id) =>
      (await pool.query('SELECT COUNT(*)::int AS n FROM highlights WHERE article_id = $1', [id])).rows[0].n;

    for (const id of ESCAPED_ZH_IDS) {
      const { rows } = await pool.query('SELECT title_zh, content_zh, content_plain, content_en FROM articles WHERE id = $1', [id]);
      if (!rows[0]) { console.log(`[escaped] ${id} 不存在`); continue; }
      const fixed = decodeEscapes(rows[0].content_zh);
      const check = checkTranslatedArticle({ contentZh: fixed, contentEnPlain: rows[0].content_plain, contentEnHtml: rows[0].content_en });
      const ok = check.errors.length === 0;
      console.log(`[escaped] ${rows[0].title_zh} | ${rows[0].content_zh.length} -> ${fixed.length} 字 | ratio=${check.ratio} | highlights=${await highlightCount(id)} | ${ok ? 'OK' : 'STILL BAD ' + check.errors.map((e) => e.code).join(',')}`);
      console.log(`          预览：${fixed.slice(0, 80).replace(/\s+/g, ' ')}`);
      if (ok && !DRY_RUN) {
        await pool.query('UPDATE articles SET content_zh = $2, translated_chars = $3 WHERE id = $1', [id, fixed, fixed.length]);
      }
    }

    for (const id of CHINESE_IN_EN_IDS) {
      const { rows } = await pool.query('SELECT title_zh, content_zh, COALESCE(source_url, url) AS url FROM articles WHERE id = $1', [id]);
      if (!rows[0]) { console.log(`[en] ${id} 不存在`); continue; }
      let extracted = null;
      try {
        extracted = await fetchAndExtract(rows[0].url);
      } catch (err) {
        console.log(`[en] ${rows[0].title_zh} | 抓取失败：${err.message}`);
        continue;
      }
      if (!extracted) { console.log(`[en] ${rows[0].title_zh} | 提取不到正文`); continue; }
      const check = checkTranslatedArticle({ contentZh: rows[0].content_zh, contentEnPlain: extracted.textContent, contentEnHtml: extracted.contentHtml });
      const ok = check.errors.length === 0;
      console.log(`[en] ${rows[0].title_zh} | 英文 ${extracted.textContent.length} 字符 | ratio=${check.ratio} | ${ok ? 'OK' : 'STILL BAD ' + check.errors.map((e) => e.code).join(',')}`);
      console.log(`     预览：${extracted.textContent.slice(0, 80).replace(/\s+/g, ' ')}`);
      if (ok && !DRY_RUN) {
        await pool.query('UPDATE articles SET content_en = $2, content_plain = $3 WHERE id = $1', [id, extracted.contentHtml, extracted.textContent]);
      }
    }

    for (const item of HIDE) {
      const { rows } = await pool.query('SELECT title_zh, publish_status FROM articles WHERE id = $1', [item.id]);
      console.log(`[hide] ${rows[0]?.title_zh} | ${rows[0]?.publish_status} -> hidden`);
      if (rows[0] && !DRY_RUN) {
        await pool.query("UPDATE articles SET publish_status = 'hidden', hidden_reason = $2, hidden_at = NOW() WHERE id = $1", [item.id, item.reason]);
      }
    }

    for (const [key, fix] of Object.entries(AUTHOR_FIXES)) {
      const { rows } = await pool.query('SELECT name, bio_one_line FROM authors WHERE source_key = $1', [key]);
      if (!rows[0]) { console.log(`[author] ${key} 不存在`); continue; }
      console.log(`[author] ${rows[0].name} | ${rows[0].bio_one_line} -> ${fix.bio_one_line}`);
      if (!DRY_RUN) {
        await pool.query(
          `UPDATE authors SET bio_one_line = $2, bio_full = $3, name_zh = COALESCE($4, name_zh) WHERE source_key = $1`,
          [key, fix.bio_one_line, fix.bio_full, fix.name_zh || null]
        );
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[repair] failed', err);
  process.exit(1);
});
