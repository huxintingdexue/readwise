import { postTranslateNext, saveReadingProgress, saveReadingProgressKeepalive } from './api.js';

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

function splitParagraphs(text) {
  return (text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function buildOriginSnippets(translatedParagraphs, contentPlain) {
  const snippets = [];
  const plain = contentPlain || '';
  const totalTranslatedChars = translatedParagraphs.reduce((n, p) => n + p.length, 0) || 1;

  let consumed = 0;
  translatedParagraphs.forEach((paragraph) => {
    const startRatio = consumed / totalTranslatedChars;
    consumed += paragraph.length;
    const endRatio = consumed / totalTranslatedChars;

    const start = Math.max(0, Math.floor(plain.length * startRatio));
    const end = Math.max(start + 1, Math.floor(plain.length * endRatio));
    const snippet = plain.slice(start, Math.min(plain.length, end + 120)).trim();
    snippets.push(snippet || '(暂无对应英文片段)');
  });

  return snippets;
}

function renderTranslatedContent(detail) {
  const translatedParagraphs = splitParagraphs(detail.content_zh);
  const snippets = buildOriginSnippets(translatedParagraphs, detail.content_plain || '');

  const html = translatedParagraphs
    .map(
      (p, idx) =>
        `<div class="translated-paragraph"><p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p><button class="origin-btn" type="button" data-origin-index="${idx}" title="查看英文原文">EN</button></div>`
    )
    .join('');

  return { html, snippets };
}

function maybeTriggerTranslate(session) {
  if (!session || session.translationStatus === 'full') return;

  const currentChar = calcScrollPositionByPlainLength(session.contentPlainLength);
  if (currentChar < session.nextTriggerChar) return;

  const now = Date.now();
  if (session.translateInFlight || now - session.lastTranslateAt < 5000) return;

  session.translateInFlight = true;
  session.lastTranslateAt = now;

  const fromChar = Math.max(0, session.translatedChars || 0);
  postTranslateNext(session.articleId, fromChar)
    .then((ret) => {
      session.translatedChars = Number(ret?.translated_chars || session.translatedChars || 0);
      session.translationStatus = ret?.status || session.translationStatus;
    })
    .catch(() => {})
    .finally(() => {
      session.translateInFlight = false;
    });

  while (session.nextTriggerChar <= currentChar) {
    session.nextTriggerChar += 1500;
  }
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
  if (nodes?.readerContent) {
    nodes.readerContent.removeEventListener('click', readingSession.onReaderClick);
  }

  if (readingSession.debounceTimer) {
    clearTimeout(readingSession.debounceTimer);
    readingSession.debounceTimer = null;
  }

  readingSession = null;
  hideOriginSnippet(nodes);
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

  const onScroll = () => {
    if (!readingSession) return;

    maybeTriggerTranslate(readingSession);

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

  const onReaderClick = (event) => {
    const btn = event.target.closest('.origin-btn');
    if (!btn || !readingSession) return;
    const idx = Number.parseInt(btn.dataset.originIndex || '-1', 10);
    if (idx < 0) return;
    showOriginSnippet(nodes, readingSession.originSnippets[idx] || '(暂无对应英文片段)');
  };

  readingSession = {
    articleId,
    contentPlainLength,
    debounceTimer: null,
    onScroll,
    onVisibilityChange,
    onBeforeUnload,
    onReaderClick,
    translatedChars: Number(detail.translated_chars || 0),
    translationStatus: detail.translation_status || 'partial',
    nextTriggerChar: 500,
    translateInFlight: false,
    lastTranslateAt: 0,
    originSnippets: detail.__originSnippets || []
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('beforeunload', onBeforeUnload);
  nodes.readerContent.addEventListener('click', onReaderClick);

  restoreScrollByPlainLength(initialProgress?.scroll_position || 0, contentPlainLength);
  maybeTriggerTranslate(readingSession);
}

export function renderReader(detail, nodes, initialProgress = null) {
  const { readerView, readerTitle, readerMeta, readerContent, listPanels } = nodes;
  listPanels.forEach((el) => el.classList.add('hidden'));
  readerView.classList.remove('hidden');
  hideOriginSnippet(nodes);

  readerTitle.textContent = detail.title_zh || detail.title_en || '未命名文章';
  readerMeta.textContent = `${detail.source_key || 'unknown'} · ${formatDate(detail.published_at)}`;

  if (detail.content_zh && detail.content_zh.trim()) {
    const rendered = renderTranslatedContent(detail);
    detail.__originSnippets = rendered.snippets;
    readerContent.innerHTML = rendered.html || `<p>${escapeHtml(detail.content_zh).replace(/\n/g, '<br/>')}</p>`;
  } else if (detail.content_en && detail.content_en.trim()) {
    detail.__originSnippets = [];
    readerContent.innerHTML = detail.content_en;
  } else {
    detail.__originSnippets = [];
    readerContent.innerHTML = `<p>${escapeHtml(detail.content_plain || '暂无内容').replace(/\n/g, '<br/>')}</p>`;
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
