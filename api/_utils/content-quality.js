// 内容质量校验：服务端入库、RSS 抓取脚本、AI 编辑室本地自查共用同一套规则。
// 规则说明见 docs/EDITOR.md「质量校验」。

export const REVIEW_TIERS = ['A', 'B', 'C'];

const TIER_RANK = { A: 0, B: 1, C: 2 };

// 中文字符数 / 英文字符数，基于 2026-10 线上 202 篇回测：
// 完整译文中位数约 0.48，Anthropic 等文风可低至 0.30（段落数一致、结尾对齐，确认完整）；
// 技术文英文术语多，可高至 1.0。
export const RATIO_REJECT_BELOW = 0.28;
export const RATIO_WARN_BELOW = 0.3;
export const RATIO_WARN_ABOVE = 0.9;
export const RATIO_REJECT_ABOVE = 1.5;
// 中文段落数 / 英文段落数：完整译文中位数约 0.9
export const PARAGRAPH_REJECT_BELOW = 0.5;
export const PARAGRAPH_WARN_BELOW = 0.75;
const MIN_EN_PARAGRAPHS = 8;
const CODE_HEAVY_SHARE = 0.3;
const MIN_EN_LENGTH_FOR_RATIO = 500;
// 英文正文太短，多半是播客节目页/摘要页，不是可读长文
const MIN_EN_LENGTH_FOR_ARTICLE = 1500;

const NOISE_PATTERNS = [
  /subscribe (now|to|for)/i,
  /sign up for (my|our|the) newsletter/i,
  /thanks for reading/i,
  /share this post/i,
  /this (post|episode) is (brought to you|sponsored) by/i,
  /\bsponsored by\b/i,
  /related (posts|articles)/i,
  /you might also like/i,
  /leave a comment/i,
  /upgrade to paid/i,
  /^no posts$/i,
  /register (to|for) (our|the) webinar/i,
  /interested to learn more\?/i,
  /for paid subscribers/i,
  /订阅(本|我的|我们的)?(通讯|频道|专栏|newsletter)/i,
  /感谢阅读/,
  /本(期|文)(节目)?由.{0,20}赞助/,
  /推荐阅读/,
  /相关文章/,
  /扫码关注/,
  /点击(订阅|关注)/,
  /升级(为|到)付费/
];

const PAYWALL_PATTERNS = [
  /this post is for paid subscribers/i,
  /keep reading with a 7-day free trial/i,
  /subscribe to (continue|keep) reading/i,
  /该文章仅限付费订阅者/
];

export function normalizeReviewTier(rawValue) {
  const value = String(rawValue || '').trim().toUpperCase();
  return REVIEW_TIERS.includes(value) ? value : null;
}

export function maxTier(...tiers) {
  return tiers
    .filter((tier) => REVIEW_TIERS.includes(tier))
    .reduce((acc, tier) => (TIER_RANK[tier] > TIER_RANK[acc] ? tier : acc), 'A');
}

export function cjkRatio(text) {
  const value = String(text || '').replace(/\s+/g, '');
  if (!value) return 0;
  const cjk = value.match(/[㐀-鿿豈-﫿]/g)?.length || 0;
  return cjk / value.length;
}

export function escapedUnicodeCount(text) {
  return String(text || '').match(/\\u[0-9a-fA-F]{4}/g)?.length || 0;
}

export function paragraphCount(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 20).length;
}

// 英文纯文本常被硬换行（每行约 65 字符），段落数只能从 HTML 段落标签里数
export function htmlParagraphCount(html) {
  const blocks = String(html || '').match(/<(p|li|h[1-6]|blockquote)(\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  return blocks.filter((block) => block.replace(/<[^>]+>/g, '').trim().length > 20).length;
}

export function codeShare(html, plainLength) {
  const blocks = String(html || '').match(/<pre[\s\S]*?<\/pre>/gi) || [];
  const codeLength = blocks.join('').replace(/<[^>]+>/g, '').length;
  const total = plainLength || String(html || '').replace(/<[^>]+>/g, '').length;
  return total > 0 ? codeLength / total : 0;
}

function edgeText(text, size = 1500) {
  const value = String(text || '');
  if (value.length <= size * 2) return value;
  return `${value.slice(0, size)}\n${value.slice(-size)}`;
}

export function detectNoise(text) {
  const edges = edgeText(text);
  return NOISE_PATTERNS.filter((re) => re.test(edges)).map((re) => re.source);
}

export function detectPaywall(text) {
  return PAYWALL_PATTERNS.some((re) => re.test(String(text || '')));
}

// 返回 { errors, warnings, ratio, impliedTier }
// errors：必须拒收；warnings：可入库但需降到 C 档人工确认
export function checkTranslatedArticle({ contentZh, contentEnPlain, contentEnHtml, titleZh }) {
  const errors = [];
  const warnings = [];
  const zh = String(contentZh || '');
  const enPlain = String(contentEnPlain || '');
  const zhLength = zh.length;
  const enLength = enPlain.length;
  const ratio = enLength > 0 ? zhLength / enLength : null;
  const share = codeShare(contentEnHtml, enLength);

  if (!zhLength) {
    errors.push({ code: 'CONTENT_ZH_MISSING', message: '中文译文为空' });
  }

  const escaped = escapedUnicodeCount(zh);
  if (escaped >= 20) {
    errors.push({
      code: 'CONTENT_ZH_ESCAPED',
      message: `中文译文包含 ${escaped} 处 \\uXXXX 转义字符，未还原成汉字`
    });
  }

  const zhCjk = cjkRatio(zh);
  if (zhLength > 200 && (zhCjk < 0.02 || (share < CODE_HEAVY_SHARE && zhCjk < 0.05))) {
    errors.push({ code: 'CONTENT_ZH_NOT_CHINESE', message: '中文译文里汉字占比过低，疑似未翻译' });
  }

  if (enLength > 200 && cjkRatio(enPlain) > 0.2) {
    errors.push({ code: 'CONTENT_EN_IS_CHINESE', message: '英文原文字段主要是中文，疑似把译文填进了原文' });
  }

  if (ratio !== null && enLength > MIN_EN_LENGTH_FOR_RATIO && zhLength) {
    const rounded = Number(ratio.toFixed(3));
    if (ratio < RATIO_REJECT_BELOW) {
      errors.push({
        code: 'CONTENT_RATIO_INVALID',
        message: `中文 ${zhLength} 字 / 英文 ${enLength} 字符 = ${rounded}，低于 ${RATIO_REJECT_BELOW}，疑似翻译不完整或被精简。禁止精简原文内容。`
      });
    } else if (ratio > RATIO_REJECT_ABOVE && share < CODE_HEAVY_SHARE) {
      errors.push({
        code: 'CONTENT_RATIO_TOO_HIGH',
        message: `中文 ${zhLength} 字 / 英文 ${enLength} 字符 = ${rounded}，高于 ${RATIO_REJECT_ABOVE}，疑似重复、乱码或原文被截断`
      });
    } else if (ratio < RATIO_WARN_BELOW) {
      warnings.push({ code: 'RATIO_LOW', message: `中英字数比 ${rounded} 偏低` });
    } else if (ratio > RATIO_WARN_ABOVE && share < CODE_HEAVY_SHARE) {
      warnings.push({ code: 'RATIO_HIGH', message: `中英字数比 ${rounded} 偏高` });
    }
  }

  const enParagraphs = htmlParagraphCount(contentEnHtml);
  const zhParagraphs = paragraphCount(zh);
  if (zhLength && enParagraphs >= MIN_EN_PARAGRAPHS) {
    const paragraphRatio = zhParagraphs / enParagraphs;
    const label = `中文 ${zhParagraphs} 段 / 英文 ${enParagraphs} 段`;
    if (paragraphRatio < PARAGRAPH_REJECT_BELOW) {
      errors.push({ code: 'CONTENT_PARAGRAPHS_MISSING', message: `${label}，疑似漏翻大段内容` });
    } else if (paragraphRatio < PARAGRAPH_WARN_BELOW) {
      warnings.push({ code: 'PARAGRAPHS_LOW', message: `${label}，可能漏翻部分段落` });
    }
  }

  if (enLength > 0 && enLength < MIN_EN_LENGTH_FOR_ARTICLE) {
    warnings.push({ code: 'CONTENT_SHORT', message: `英文正文仅 ${enLength} 字符，疑似节目页或摘要页` });
  }

  if (titleZh !== undefined && enLength > 0 && cjkRatio(titleZh) === 0) {
    warnings.push({ code: 'TITLE_UNTRANSLATED', message: '中文标题未翻译' });
  }

  if (detectPaywall(enPlain) || detectPaywall(zh)) {
    warnings.push({ code: 'PAYWALL', message: '正文疑似被付费墙截断' });
  }

  const noise = [...new Set([...detectNoise(enPlain), ...detectNoise(zh)])];
  if (noise.length) {
    warnings.push({ code: 'NOISE', message: `正文首尾疑似残留广告/订阅引导：${noise.slice(0, 3).join(' | ')}` });
  }

  return {
    errors,
    warnings,
    ratio: ratio === null ? null : Number(ratio.toFixed(4)),
    impliedTier: warnings.length ? 'C' : 'A'
  };
}

export function formatReviewNote(warnings, extra = '') {
  const parts = (warnings || []).map((item) => item.message);
  if (extra) parts.unshift(String(extra).trim());
  return parts.filter(Boolean).join('；').slice(0, 500) || null;
}
