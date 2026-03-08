import { createHighlight, postQa } from './api.js';
import { openQaModal } from './qa.js';
import { searchReference } from './reference.js';

let currentSelection = null;
let menuEl = null;
let lastMenuShownAt = 0;

function ensureMenu() {
  if (menuEl) return menuEl;

  menuEl = document.createElement('div');
  menuEl.className = 'selection-menu hidden';
  menuEl.innerHTML = `
    <button type="button" data-action="copy">复制</button>
    <button type="button" data-action="highlight">划线</button>
    <button type="button" data-action="ask">提问</button>
    <button type="button" data-action="reference">查引用</button>
    <button type="button" data-action="origin">原文</button>
  `;
  document.body.appendChild(menuEl);
  return menuEl;
}

function hideMenu() {
  ensureMenu().classList.add('hidden');
  currentSelection = null;
}

function showMenu(x, y) {
  const menu = ensureMenu();
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.remove('hidden');
  lastMenuShownAt = Date.now();
}

function getPlainSelectionText(selection) {
  return selection?.toString()?.replace(/\s+/g, ' ').trim() || '';
}

function inferPosition(contentPlain, contentZh, selectedText, lastStartRef) {
  const plain = contentPlain || '';
  if (!plain || !selectedText) return { start: -1, end: -1 };

  const escaped = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'g');
  let match;
  let best = null;
  const target = Math.max(0, lastStartRef.value || 0);

  while ((match = regex.exec(plain)) !== null) {
    const start = match.index;
    const dist = Math.abs(start - target);
    if (!best || dist < best.dist) {
      best = { start, end: start + selectedText.length, dist };
    }
    if (start >= target) break;
  }

  if (!best) {
    const direct = plain.indexOf(selectedText);
    if (direct < 0) return { start: -1, end: -1 };
    best = { start: direct, end: direct + selectedText.length };
  }

  lastStartRef.value = best.start;
  return { start: best.start, end: best.end, approximate: false };
}

function inferApproximatePosition(contentPlain, contentZh, selectedText) {
  const plain = contentPlain || '';
  const zh = contentZh || '';
  if (!plain || !zh || !selectedText) return { start: -1, end: -1, approximate: true };

  const zhIndex = zh.indexOf(selectedText);
  if (zhIndex < 0) return { start: -1, end: -1, approximate: true };

  const ratio = zhIndex / Math.max(1, zh.length);
  const approxStart = Math.floor(plain.length * ratio);
  const lengthRatio = plain.length / Math.max(1, zh.length);
  const approxLen = Math.max(1, Math.floor(selectedText.length * lengthRatio));
  const approxEnd = Math.min(plain.length, approxStart + approxLen);
  return { start: approxStart, end: approxEnd, approximate: true };
}

export function initHighlightFeature({
  readerContent,
  getCurrentArticle,
  showToast,
  openOriginSnippet
}) {
  const lastStartRef = { value: 0 };

  function onSelectionChange(event) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      hideMenu();
      return;
    }

    const text = getPlainSelectionText(selection);
    if (!text) {
      hideMenu();
      return;
    }

    const range = selection.getRangeAt(0);
    if (!readerContent.contains(range.commonAncestorContainer)) {
      hideMenu();
      return;
    }

    const article = getCurrentArticle();
    if (!article) {
      hideMenu();
      return;
    }

    let pos = inferPosition(article.content_plain || '', article.content_zh || '', text, lastStartRef);
    if (pos.start < 0 || pos.end <= pos.start) {
      pos = inferApproximatePosition(article.content_plain || '', article.content_zh || '', text);
    }
    if (pos.start < 0 || pos.end <= pos.start) {
      showToast('无法定位到原文位置，请调整选区后重试');
      hideMenu();
      return;
    }

    const rect = range.getBoundingClientRect();
    currentSelection = {
      articleId: article.id,
      text,
      positionStart: pos.start,
      positionEnd: pos.end,
      originText: (article.content_plain || '').slice(pos.start, pos.end),
      approximate: pos.approximate === true,
      range
    };

    const x = rect.left + window.scrollX;
    const y = rect.top + window.scrollY - 46;
    showMenu(x, Math.max(12, y));

    // Accuracy notice removed by product decision; tracking in docs.

    if (event?.type === 'touchend') {
      event.preventDefault();
    }
    event?.stopPropagation?.();
  }

  readerContent.addEventListener('mouseup', onSelectionChange);
  readerContent.addEventListener('touchend', onSelectionChange, { passive: false });
  readerContent.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  const menu = ensureMenu();
  menu.addEventListener('click', async (event) => {
    event.stopPropagation();
    const action = event.target?.dataset?.action;
    if (!action || !currentSelection) return;

    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(currentSelection.text);
        showToast('已复制选中文本');
      } catch (_) {
        showToast('复制失败，请重试');
      }
      hideMenu();
      return;
    }

    if (action === 'origin') {
      openOriginSnippet(currentSelection.originText || currentSelection.text || '(暂无)');
      hideMenu();
      return;
    }

    if (action === 'ask') {
      const article = getCurrentArticle();
      const selection = currentSelection;
      if (!selection) return;
      const contextText = buildContextText(article?.content_plain || '', selection.positionStart, selection.positionEnd);
      hideMenu();
      openQaModal({
        selectionText: selection.text,
        contextText,
        onSubmit: async (question, context) => {
          const highlight = await createHighlight({
            article_id: selection.articleId,
            text: selection.text,
            position_start: selection.positionStart,
            position_end: selection.positionEnd,
            type: 'highlight'
          });
          const result = await postQa({
            highlight_id: highlight?.id || null,
            article_id: selection.articleId,
            question,
            context
          });
          return result?.answer_summary || '';
        }
      });
      return;
    }

    if (action === 'reference') {
      const article = getCurrentArticle();
      const selection = currentSelection;
      if (!selection) return;
      hideMenu();
      try {
        const highlight = await createHighlight({
          article_id: selection.articleId,
          text: selection.text,
          position_start: selection.positionStart,
          position_end: selection.positionEnd,
          type: 'reference'
        });
        await searchReference({
          text: selection.text,
          articleId: selection.articleId,
          highlightId: highlight?.id || null,
          showToast
        });
      } catch (err) {
        showToast(err?.message || '引用识别失败，请稍后重试');
      }
      return;
    }

    if (action === 'highlight') {
      try {
        if (currentSelection.range) {
          const mark = document.createElement('span');
          mark.className = 'highlight-mark';
          currentSelection.range.surroundContents(mark);
        }
        await createHighlight({
          article_id: currentSelection.articleId,
          text: currentSelection.text,
          position_start: currentSelection.positionStart,
          position_end: currentSelection.positionEnd,
          type: 'highlight'
        });
      } catch (err) {
        showToast(`划线保存失败：${err.message}`);
      }
      hideMenu();
    }
  });

  document.addEventListener('scroll', hideMenu, { passive: true });
  document.addEventListener('click', (event) => {
    if (Date.now() - lastMenuShownAt < 250) {
      return;
    }
    if (!event.target.closest('.selection-menu')) {
      hideMenu();
    }
  });
}

function buildContextText(contentPlain, start, end) {
  const sentences = (contentPlain || '').match(/[^.!?。！？\\n]+[.!?。！？\\n]*/g) || [];
  if (sentences.length === 0) return contentPlain || '';

  let cursor = 0;
  let startIdx = 0;
  let endIdx = 0;
  sentences.forEach((s, idx) => {
    const next = cursor + s.length;
    if (start >= cursor && start < next) startIdx = idx;
    if (end > cursor && end <= next) endIdx = idx;
    cursor = next;
  });

  const from = Math.max(0, startIdx - 5);
  const to = Math.min(sentences.length, endIdx + 6);
  return sentences.slice(from, to).join('').trim();
}
