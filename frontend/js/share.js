const ANDROID_APK_URL = '';

const nodes = {
  shareTitle: document.querySelector('#shareTitle'),
  shareMeta: document.querySelector('#shareMeta'),
  shareSummary: document.querySelector('#shareSummary'),
  shareContent: document.querySelector('#shareContent'),
  openOriginalLink: document.querySelector('#openOriginalLink'),
  copyShareBtn: document.querySelector('#copyShareBtn'),
  shareCta: document.querySelector('#shareCta'),
  shareCtaBtn: document.querySelector('#shareCtaBtn'),
  shareCtaSub: document.querySelector('#shareCtaSub'),
  shareToast: document.querySelector('#shareToast')
};

let currentArticleId = '';
let ctaShown = false;

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(text) {
  return escapeHtml(text);
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text || '');
  html = html.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"([^"]*)")?\)/g,
    (_, alt, url, title) =>
      `<img src="${escapeHtmlAttr(url)}" alt="${escapeHtmlAttr(alt || '图片')}"${title ? ` title="${escapeHtmlAttr(title)}"` : ''} loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
  );
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) =>
    `<a href="${escapeHtmlAttr(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return html;
}

function renderMarkdown(markdown) {
  const src = String(markdown || '').replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const blocks = [];
  let i = 0;

  const isListItem = (line) => /^\s*[-*+]\s+/.test(line);
  const isOrderedItem = (line) => /^\s*\d+\.\s+/.test(line);
  const isSpecial = (line) =>
    /^#{1,6}\s+/.test(line)
    || /^>\s?/.test(line)
    || /^```/.test(line)
    || /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
    || isListItem(line)
    || isOrderedItem(line);

  while (i < lines.length) {
    const line = lines[i];
    if (!line || !line.trim()) {
      i += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.max(1, Math.min(6, heading[1].length));
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push('<hr />');
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(`<blockquote><p>${quoteLines.map(renderInlineMarkdown).join('<br />')}</p></blockquote>`);
      continue;
    }

    if (isListItem(line)) {
      const items = [];
      while (i < lines.length && isListItem(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (isOrderedItem(line)) {
      const items = [];
      while (i < lines.length && isOrderedItem(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push(`<p>${paraLines.map(renderInlineMarkdown).join('<br />')}</p>`);
  }

  return blocks.join('');
}

function formatDate(iso) {
  if (!iso) return '未知时间';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '未知时间';
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function getArticleIdFromUrl() {
  const match = window.location.pathname.match(/^\/share\/([^/?#]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  const usp = new URLSearchParams(window.location.search);
  return String(usp.get('id') || '').trim();
}

function getPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'other';
}

function showToast(message, duration = 1800) {
  if (!nodes.shareToast) return;
  nodes.shareToast.textContent = message;
  nodes.shareToast.classList.remove('hidden');
  setTimeout(() => {
    nodes.shareToast.classList.add('hidden');
  }, duration);
}

function sharePageUrl() {
  const encoded = encodeURIComponent(currentArticleId || '');
  return `${window.location.origin}/share/${encoded}`;
}

function initCtaByPlatform() {
  const platform = getPlatform();
  if (platform === 'android') {
    nodes.shareCtaBtn.textContent = '立即下载';
    nodes.shareCtaSub.textContent = '每天更新硅谷圈大佬最新动态和文章';
    return;
  }
  if (platform === 'ios') {
    nodes.shareCtaBtn.textContent = '添加到主屏幕';
    nodes.shareCtaSub.textContent = '每天更新硅谷圈大佬最新动态和文章';
    return;
  }
  nodes.shareCtaBtn.textContent = '立即打开';
  nodes.shareCtaSub.textContent = '每天更新硅谷圈大佬最新动态和文章';
}

async function fetchArticle() {
  currentArticleId = getArticleIdFromUrl();
  if (!currentArticleId) {
    nodes.shareTitle.textContent = '链接无效';
    nodes.shareMeta.textContent = '缺少文章 ID';
    nodes.shareContent.innerHTML = '<p>请返回并重新复制分享链接。</p>';
    return;
  }

  try {
    const res = await fetch(`/api/share/articles/${encodeURIComponent(currentArticleId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.article) {
      throw new Error(data?.error || '文章不存在或不可分享');
    }
    const article = data.article;
    const title = article.title_zh || article.title_en || '未命名文章';
    const summary = article.summary_zh || article.summary_en || '';
    const author = String(article.author || '').trim();
    const meta = [author, formatDate(article.published_at)].filter(Boolean).join(' · ');
    const body = String(article.content_zh || article.content_plain || '').trim();

    document.title = `${title} - ReadWise 分享`;
    nodes.shareTitle.textContent = title;
    nodes.shareMeta.textContent = meta;
    if (summary) {
      nodes.shareSummary.textContent = summary;
      nodes.shareSummary.classList.remove('hidden');
    }
    nodes.shareContent.innerHTML = body
      ? renderMarkdown(body)
      : '<p>暂无正文内容</p>';

    if (article.url) {
      nodes.openOriginalLink.href = article.url;
      nodes.openOriginalLink.classList.remove('hidden');
    }
  } catch (err) {
    nodes.shareTitle.textContent = '文章不可用';
    nodes.shareMeta.textContent = '';
    nodes.shareContent.innerHTML = `<p>${escapeHtml(String(err.message || '加载失败'))}</p>`;
  }
}

function bindEvents() {
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY || 0;
    if (!ctaShown && y > 24 && y > lastY) {
      ctaShown = true;
      nodes.shareCta.classList.remove('hidden');
    }
    lastY = y;
  }, { passive: true });

  nodes.copyShareBtn?.addEventListener('click', async () => {
    const url = sharePageUrl();
    if (!currentArticleId) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showToast('分享链接已复制');
        return;
      }
      showToast('请手动复制地址栏链接');
    } catch (_) {
      showToast('复制失败，请手动复制地址栏链接');
    }
  });

  nodes.shareCtaBtn?.addEventListener('click', () => {
    const platform = getPlatform();
    if (platform === 'android') {
      if (ANDROID_APK_URL) {
        window.location.href = ANDROID_APK_URL;
      } else {
        window.location.href = '/';
      }
      return;
    }
    if (platform === 'ios') {
      window.alert('请点击 Safari 右上角“分享”按钮，然后选择“添加到主屏幕”。');
      return;
    }
    window.location.href = '/';
  });
}

async function init() {
  initCtaByPlatform();
  bindEvents();
  await fetchArticle();
}

init();
