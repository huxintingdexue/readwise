import { createHighlight } from './api.js';

let currentSelection = null;
let menuEl = null;

function ensureMenu() {
  if (menuEl) return menuEl;

  menuEl = document.createElement('div');
  menuEl.className = 'selection-menu hidden';
  menuEl.innerHTML = `
    <button type="button" data-action="copy">复制</button>
    <button type="button" data-action="highlight">划线</button>
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
}

function getPlainSelectionText(selection) {
  return selection?.toString()?.replace(/\s+/g, ' ').trim() || '';
}

function inferPosition(contentPlain, selectedText, lastStartRef) {
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
  return { start: best.start, end: best.end };
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

    const pos = inferPosition(article.content_plain || '', text, lastStartRef);
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
      originText: (article.content_plain || '').slice(pos.start, pos.end)
    };

    const x = rect.left + window.scrollX;
    const y = rect.top + window.scrollY - 46;
    showMenu(x, Math.max(12, y));

    event?.stopPropagation?.();
  }

  readerContent.addEventListener('mouseup', onSelectionChange);
  readerContent.addEventListener('touchend', onSelectionChange);

  const menu = ensureMenu();
  menu.addEventListener('click', async (event) => {
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

    if (action === 'highlight') {
      try {
        await createHighlight({
          article_id: currentSelection.articleId,
          text: currentSelection.text,
          position_start: currentSelection.positionStart,
          position_end: currentSelection.positionEnd,
          type: 'highlight'
        });
        showToast('划线已保存');
      } catch (err) {
        showToast(`划线保存失败：${err.message}`);
      }
      hideMenu();
    }
  });

  document.addEventListener('scroll', hideMenu, { passive: true });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.selection-menu')) {
      hideMenu();
    }
  });
}
