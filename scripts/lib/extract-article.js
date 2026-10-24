import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { detectNoise, detectPaywall } from '../../api/_utils/content-quality.js';

// 正文提取 + 去广告。RSS 抓取脚本与 AI 编辑室共用，规则见 docs/EDITOR.md「去广告」。
const NOISE_SELECTORS = [
  'nav', 'footer', 'aside', 'form', 'iframe', 'noscript', 'button',
  '[class*="subscribe"]', '[class*="newsletter"]', '[class*="sponsor"]', '[class*="promo"]',
  '[class*="related"]', '[class*="share"]', '[class*="comment"]', '[class*="signup"]',
  '[class*="advert"]', '[id*="sponsor"]', '[id*="newsletter"]', '[id*="comments"]'
].join(',');

const MAX_NOISE_BLOCK_CHARS = 300;

function removeNoiseBlocks(document) {
  let removed = 0;
  for (const node of [...document.querySelectorAll('p, li, div, section, blockquote, h2, h3, h4')]) {
    if (!node.isConnected) continue;
    const text = (node.textContent || '').trim();
    if (!text || text.length > MAX_NOISE_BLOCK_CHARS) continue;
    if (detectNoise(text).length > 0) {
      node.remove();
      removed += 1;
    }
  }
  return removed;
}

export function extractArticle(html, url = '') {
  const { document } = parseHTML(String(html || ''));
  for (const node of [...document.querySelectorAll(NOISE_SELECTORS)]) {
    // 正文容器本身可能带 share/comment 之类的类名，长内容块保留
    if ((node.textContent || '').trim().length < 2000) node.remove();
  }
  const parsed = new Readability(document, { charThreshold: 300, keepClasses: false }).parse();
  if (!parsed?.content) {
    return null;
  }
  const { document: contentDoc } = parseHTML(`<!doctype html><html><body>${parsed.content}</body></html>`);
  const removedNoiseBlocks = removeNoiseBlocks(contentDoc);
  const contentHtml = contentDoc.body.innerHTML.trim();
  const textContent = (contentDoc.body.textContent || '').replace(/[ \t]+/g, ' ').trim();
  return {
    url,
    title: (parsed.title || '').trim(),
    byline: (parsed.byline || '').trim(),
    publishedTime: parsed.publishedTime || null,
    contentHtml,
    textContent,
    removedNoiseBlocks,
    remainingNoise: detectNoise(textContent),
    paywalled: detectPaywall(textContent)
  };
}

export async function fetchAndExtract(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return extractArticle(await res.text(), res.url || url);
  } finally {
    clearTimeout(timer);
  }
}
