import { saveReadingProgress, saveReadingProgressKeepalive, getHighlights, trackEvent } from './api.js';
import { hideReferenceBanner } from './reference.js';
import { hideArticleNotesPanel } from './notes.js';
import { applyHighlightsToDOM } from './highlight.js';

let readingSession = null;

function formatDate(isoString) {
  if (!isoString) return '未知时间';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '未知时间';
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function sourceName(sourceKey) {
  if (sourceKey === 'sam') return 'Sam Altman';
  if (sourceKey === 'andrej') return 'Andrej Karpathy';
  if (sourceKey === 'peter') return 'Peter Steipete';
  if (sourceKey === 'lenny') return 'Lenny Rachitsky';
  if (sourceKey === 'naval') return 'Naval Ravikant';
  return sourceKey || 'Unknown';
}

function escapeHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function currentScrollTop() {
  return Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop, 0);
}

function maxScrollableDistance() {
  return Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
}

function calcScrollPositionByPlainLength(contentPlainLength) {
  if (!contentPlainLength || contentPlainLength <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, currentScrollTop() / maxScrollableDistance()));
  return Math.round(contentPlainLength * ratio);
}

function restoreScrollByPlainLength(scrollPosition, contentPlainLength) {
  if (!contentPlainLength || contentPlainLength <= 0) return;
  const ratio = Math.min(1, Math.max(0, Number(scrollPosition || 0) / contentPlainLength));
  const targetY = Math.round(maxScrollableDistance() * ratio);
  requestAnimationFrame(() => window.scrollTo({ top: targetY, behavior: 'auto' }));
}

// Build the HTML shown in the reader.
// - Prefer Chinese translation if available
// - Otherwise fall back to full English HTML or plain text
function renderContent(detail) {
  const zhText = (detail.content_zh || '').trim();
  const enHtml = (detail.content_en || '').trim();
  const plainText = detail.content_plain || '';

  if (!zhText) {
    // No translation yet – show full English or plain fallback
    if (enHtml) return enHtml;
    return `<p>${escapeHtml(plainText || '暂无内容').replace(/\n/g, '<br/>')}</p>`;
  }

  // Wrap zh text in proper paragraphs
  const zhHtml = `<p>${escapeHtml(zhText).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
  if (!enHtml) return zhHtml;
  return zhHtml;
}

export function renderReaderLoading(nodes, title = '加载中...') {
  const { readerView, readerTitle, readerMeta, readerContent, listPanels } = nodes;
  listPanels.forEach((el) => el.classList.add('hidden'));
  readerView.classList.remove('hidden');
  hideOriginSnippet(nodes);
  hideReferenceBanner();

  readerTitle.textContent = title;
  readerMeta.textContent = '';
  readerContent.innerHTML = `
    <div class="reader-skeleton">
      <div class="skeleton-line w-70"></div>
      <div class="skeleton-line w-90"></div>
      <div class="skeleton-line w-60"></div>
    </div>
  `;
}

function hideOriginSnippet(nodes) {
  if (!nodes?.originSnippet) return;
  nodes.originSnippet.classList.add('hidden');
  nodes.originSnippetText.textContent = '';
}

function showOriginSnippet(nodes, text) {
  if (!nodes?.originSnippet) return;
  nodes.originSnippetText.textContent = text || '(暂无)';
  nodes.originSnippet.classList.remove('hidden');
}

function stopReadingSession(nodes) {
  if (!readingSession) return;

  window.removeEventListener('scroll', readingSession.onScroll, { passive: true });
  document.removeEventListener('visibilitychange', readingSession.onVisibilityChange);
  window.removeEventListener('beforeunload', readingSession.onBeforeUnload);
  if (readingSession.debounceTimer) {
    clearTimeout(readingSession.debounceTimer);
    readingSession.debounceTimer = null;
  }

  readingSession = null;
  hideOriginSnippet(nodes);
  hideReferenceBanner();
  if (nodes?.articleNotesPanel) {
    hideArticleNotesPanel(nodes.articleNotesPanel);
  }
}

function startReadingSession(detail, nodes, initialProgress) {
  stopReadingSession(nodes);

  const articleId = detail.id;
  const contentPlainLength = Number((detail.content_plain || '').length || 0);
  if (!articleId || !contentPlainLength) return;

  const persistNow = async () => {
    const scrollPosition = calcScrollPositionByPlainLength(contentPlainLength);
    try {
      await saveReadingProgress(articleId, scrollPosition);
    } catch (err) {
      console.warn('[reading-progress] save failed', err.message);
    }
  };

  const maybeTrackFinish = () => {
    if (!readingSession || readingSession.finishTracked) return;
    const currentChar = calcScrollPositionByPlainLength(contentPlainLength);
    if (currentChar / contentPlainLength >= 0.8) {
      readingSession.finishTracked = true;
      trackEvent('finish_article', articleId);
    }
  };

  const onScroll = () => {
    if (!readingSession) return;

    maybeTrackFinish();

    if (readingSession.debounceTimer) {
      clearTimeout(readingSession.debounceTimer);
    }
    readingSession.debounceTimer = setTimeout(() => {
      persistNow();
    }, 10000);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      persistNow();
    }
  };

  const onBeforeUnload = () => {
    const scrollPosition = calcScrollPositionByPlainLength(contentPlainLength);
    saveReadingProgressKeepalive(articleId, scrollPosition);
  };

  readingSession = {
    articleId,
    contentPlainLength,
    readerContent: nodes.readerContent || null,
    debounceTimer: null,
    onScroll,
    onVisibilityChange,
    onBeforeUnload,
    finishTracked: false
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('beforeunload', onBeforeUnload);
  restoreScrollByPlainLength(initialProgress?.scroll_position || 0, contentPlainLength);
  requestAnimationFrame(() => {
    maybeTrackFinish();
  });
}

export function renderReader(detail, nodes, initialProgress = null) {
  const { readerView, readerTitle, readerMeta, readerContent, listPanels } = nodes;
  listPanels.forEach((el) => el.classList.add('hidden'));
  readerView.classList.remove('hidden');
  hideOriginSnippet(nodes);
  hideReferenceBanner();

  readerTitle.textContent = detail.title_zh || detail.title_en || '未命名文章';
  readerMeta.textContent = `${sourceName(detail.source_key)} · ${formatDate(detail.published_at)}`;

  readerContent.innerHTML = renderContent(detail);

  if (detail.id) {
    trackEvent('open_article', detail.id);
  }

  // Re-apply stored highlights after content renders
  if (detail.id) {
    getHighlights(detail.id)
      .then((highlights) => applyHighlightsToDOM(readerContent, highlights))
      .catch(() => {});
  }

  startReadingSession(detail, nodes, initialProgress);
}

export function closeReader(nodes) {
  const { readerView, listPanels } = nodes;
  stopReadingSession(nodes);
  readerView.classList.add('hidden');
  listPanels.forEach((el) => el.classList.remove('hidden'));
}

export function closeOriginSnippetPanel(nodes) {
  hideOriginSnippet(nodes);
}

export function openOriginSnippetPanel(nodes, text) {
  showOriginSnippet(nodes, text);
}

export function scrollToPlainPosition(contentPlainLength, position) {
  restoreScrollByPlainLength(position, contentPlainLength);
}
