import { saveReadingProgress, saveReadingProgressKeepalive } from './api.js';

let readingSession = null;

function formatDate(isoString) {
  if (!isoString) return '未知时间';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '未知时间';
  return d.toLocaleString('zh-CN', { hour12: false });
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
  if (!contentPlainLength || contentPlainLength <= 0) {
    return 0;
  }
  const ratio = Math.min(1, Math.max(0, currentScrollTop() / maxScrollableDistance()));
  return Math.round(contentPlainLength * ratio);
}

function restoreScrollByPlainLength(scrollPosition, contentPlainLength) {
  if (!contentPlainLength || contentPlainLength <= 0) {
    return;
  }
  const ratio = Math.min(1, Math.max(0, Number(scrollPosition || 0) / contentPlainLength));
  const targetY = Math.round(maxScrollableDistance() * ratio);
  requestAnimationFrame(() => window.scrollTo({ top: targetY, behavior: 'auto' }));
}

function stopReadingSession() {
  if (!readingSession) return;

  window.removeEventListener('scroll', readingSession.onScroll, { passive: true });
  document.removeEventListener('visibilitychange', readingSession.onVisibilityChange);
  window.removeEventListener('beforeunload', readingSession.onBeforeUnload);

  if (readingSession.debounceTimer) {
    clearTimeout(readingSession.debounceTimer);
    readingSession.debounceTimer = null;
  }

  readingSession = null;
}

function startReadingSession(detail, initialProgress) {
  stopReadingSession();

  const articleId = detail.id;
  const contentPlainLength = Number((detail.content_plain || '').length || 0);

  if (!articleId || !contentPlainLength) {
    return;
  }

  const persistNow = async () => {
    const scrollPosition = calcScrollPositionByPlainLength(contentPlainLength);
    try {
      await saveReadingProgress(articleId, scrollPosition);
    } catch (err) {
      console.warn('[reading-progress] save failed', err.message);
    }
  };

  const onScroll = () => {
    if (!readingSession) return;
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
    debounceTimer: null,
    onScroll,
    onVisibilityChange,
    onBeforeUnload
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('beforeunload', onBeforeUnload);

  restoreScrollByPlainLength(initialProgress?.scroll_position || 0, contentPlainLength);
}

export function renderReader(detail, nodes, initialProgress = null) {
  const { readerView, readerTitle, readerMeta, readerContent, listPanels } = nodes;
  listPanels.forEach((el) => el.classList.add('hidden'));
  readerView.classList.remove('hidden');

  readerTitle.textContent = detail.title_zh || detail.title_en || '未命名文章';
  readerMeta.textContent = `${detail.source_key || 'unknown'} · ${formatDate(detail.published_at)}`;

  if (detail.content_zh && detail.content_zh.trim()) {
    readerContent.innerHTML = `<p>${escapeHtml(detail.content_zh).replace(/\n/g, '<br/>')}</p>`;
  } else if (detail.content_en && detail.content_en.trim()) {
    readerContent.innerHTML = detail.content_en;
  } else {
    readerContent.innerHTML = `<p>${escapeHtml(detail.content_plain || '暂无内容').replace(/\n/g, '<br/>')}</p>`;
  }

  startReadingSession(detail, initialProgress);
}

export function closeReader(nodes) {
  const { readerView, listPanels } = nodes;
  stopReadingSession();
  readerView.classList.add('hidden');
  listPanels.forEach((el) => el.classList.remove('hidden'));
}
