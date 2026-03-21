import { createHighlight, postQa } from './api.js';
import { openQaModal } from './qa.js';
import { searchReference } from './reference.js';

let currentSelection = null;
let currentHighlightEl = null; // the .highlight-mark span currently being interacted with
let menuEl = null;
let lastMenuShownAt = 0;
let customMenuEnabled = true;

function ensureMenu() {
  if (menuEl) return menuEl;

  menuEl = document.createElement('div');
  menuEl.className = 'selection-menu hidden';
  menuEl.innerHTML = `
    <button type="button" data-action="copy">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h9a2 2 0 0 1 2 2v12h-2V5H9V3z" fill="currentColor"></path>
        <path d="M6 7h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" fill="currentColor"></path>
      </svg>
      <span class="btn-label">复制</span>
    </button>
    <button type="button" data-action="highlight">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 14l6-6 3 3-6 6H7v-3z" fill="currentColor"></path>
        <path d="M5 19h14v2H5z" fill="currentColor"></path>
      </svg>
      <span class="btn-label">划线</span>
    </button>
    <button type="button" data-action="ask">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16v10H7l-3 3V5z" fill="currentColor"></path>
      </svg>
      <span class="btn-label">提问</span>
    </button>
    <button type="button" data-action="reference">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7h10v2H7zm0 4h10v2H7zm0 4h6v2H7z" fill="currentColor"></path>
      </svg>
      <span class="btn-label">查引用</span>
    </button>
  `;
  document.body.appendChild(menuEl);
  document.body.classList.add('custom-selection');
  return menuEl;
}

function hideMenu() {
  const menu = ensureMenu();
  menu.classList.add('hidden');
  // Restore "删除划线" -> "划线" if it was swapped
  const removeBtn = menu.querySelector('[data-action="remove-highlight"]');
  if (removeBtn) {
    removeBtn.dataset.action = 'highlight';
    const label = removeBtn.querySelector('.btn-label');
    if (label) label.textContent = '划线';
  }
  currentHighlightEl = null;
  currentSelection = null;
}

function showMenu(selRect, positionMode = 'above') {
  if (!customMenuEnabled) return;
  const menu = ensureMenu();
  menu.style.left = '-9999px';
  menu.style.top = '0px';
  menu.classList.toggle('menu-below', positionMode === 'below');
  menu.classList.remove('hidden');

  requestAnimationFrame(() => {
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    const ABOVE_GAP = 48;
    const BELOW_GAP = 48;

    let finalMode = positionMode;
    let menuTop;
    if (positionMode === 'above') {
      if (selRect.top - menuH - ABOVE_GAP < 0) {
        finalMode = 'below';
        menuTop = selRect.bottom + window.scrollY + BELOW_GAP;
      } else {
        menuTop = selRect.top + window.scrollY - menuH - ABOVE_GAP;
      }
    } else {
      if (selRect.bottom + BELOW_GAP + menuH > window.innerHeight) {
        finalMode = 'above';
        menuTop = selRect.top + window.scrollY - menuH - ABOVE_GAP;
      } else {
        menuTop = selRect.bottom + window.scrollY + BELOW_GAP;
      }
    }

    menu.classList.toggle('menu-below', finalMode === 'below');
    const centerX = selRect.left + window.scrollX + selRect.width / 2;
    const targetX = centerX - menuW / 2;
    menu.style.left = `${Math.max(12, Math.min(window.innerWidth - menuW - 12, targetX))}px`;
    menu.style.top = `${Math.max(window.scrollY + 8, menuTop)}px`;
    lastMenuShownAt = Date.now();
  });
}

function getPlainSelectionText(selection) {
  return selection?.toString()?.trim() || '';
}

function isStandalonePwa() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator?.standalone === true
  );
}

function inferPosition(content, selectedText, lastStartRef) {
  const plain = content || '';
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

function getPositionBaseText(article, readerContent) {
  if (readerContent?.textContent) return readerContent.textContent;
  if (article?.content_zh) return article.content_zh;
  return article?.content_plain || '';
}

function isHighlightElement(el) {
  return Boolean(el?.classList?.contains('highlight-mark') || el?.classList?.contains('highlight-mark-other'));
}

function collectPlainTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    const content = node.textContent || '';
    if (!content) continue;
    if (isHighlightElement(node.parentElement)) continue;
    textNodes.push(node);
  }
  return textNodes;
}

function wrapNodeSlice(node, startOffset, endOffset, className) {
  if (!node || endOffset <= startOffset) return false;
  let target = node;
  let offsetEnd = endOffset;

  if (startOffset > 0) {
    target = node.splitText(startOffset);
    offsetEnd -= startOffset;
  }
  if (offsetEnd < target.textContent.length) {
    target.splitText(offsetEnd);
  }

  if (!target.textContent || isHighlightElement(target.parentElement)) return false;

  const mark = document.createElement('span');
  mark.className = className;
  target.parentNode.insertBefore(mark, target);
  mark.appendChild(target);
  return true;
}

function wrapAbsoluteRangeInTextNodes(textNodes, start, end, className) {
  if (!Array.isArray(textNodes) || !textNodes.length || end <= start) return false;
  let pos = 0;
  const slices = [];

  for (const node of textNodes) {
    const nodeText = node.textContent || '';
    const len = nodeText.length;
    if (!len) continue;
    const nodeStart = pos;
    const nodeEnd = pos + len;
    const sliceStart = Math.max(start, nodeStart);
    const sliceEnd = Math.min(end, nodeEnd);
    if (sliceEnd > sliceStart) {
      slices.push({
        node,
        startOffset: sliceStart - nodeStart,
        endOffset: sliceEnd - nodeStart
      });
    }
    pos = nodeEnd;
    if (pos >= end) break;
  }

  let wrapped = false;
  for (let i = slices.length - 1; i >= 0; i -= 1) {
    const part = slices[i];
    wrapped = wrapNodeSlice(part.node, part.startOffset, part.endOffset, className) || wrapped;
  }
  return wrapped;
}

function wrapSelectionRange(readerContent, range, className) {
  if (!range) return false;
  const textNodes = collectPlainTextNodes(readerContent);
  if (!textNodes.length) return false;

  const slices = [];
  for (const node of textNodes) {
    if (!range.intersectsNode(node)) continue;
    const len = (node.textContent || '').length;
    if (!len) continue;
    const startOffset = node === range.startContainer ? range.startOffset : 0;
    const endOffset = node === range.endContainer ? range.endOffset : len;
    if (endOffset > startOffset) {
      slices.push({ node, startOffset, endOffset });
    }
  }

  let wrapped = false;
  for (let i = slices.length - 1; i >= 0; i -= 1) {
    const part = slices[i];
    wrapped = wrapNodeSlice(part.node, part.startOffset, part.endOffset, className) || wrapped;
  }
  return wrapped;
}

function applyHighlightMarkByText(readerContent, text, className) {
  if (!text) return false;
  const textNodes = collectPlainTextNodes(readerContent);
  if (!textNodes.length) return false;
  const combined = textNodes.map((n) => n.textContent || '').join('');
  const idx = combined.indexOf(text);
  if (idx < 0) return false;
  return wrapAbsoluteRangeInTextNodes(textNodes, idx, idx + text.length, className);
}

export function applyHighlightsToDOM(readerContent, highlights) {
  if (!highlights?.length) return;

  for (const hl of highlights) {
    if (hl.type !== 'highlight') continue;
    if (!hl.text) continue;
    const className = hl.is_mine === false ? 'highlight-mark-other' : 'highlight-mark';
    try {
      applyHighlightMarkByText(readerContent, hl.text, className);
    } catch (_) {
      // Skip highlights that can't be placed (e.g. text no longer in DOM)
    }
  }
}

export function initHighlightFeature({
  readerContent,
  getCurrentArticle,
  showToast,
  openOriginSnippet
}) {
  const lastStartRef = { value: 0 };
  let selectionDragActive = false;
  customMenuEnabled = true;
  document.body.classList.add('custom-selection');

  function hasReaderSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    if (!getPlainSelectionText(selection)) return false;
    const range = selection.getRangeAt(0);
    return readerContent.contains(range.commonAncestorContainer);
  }

  function edgeZoneHeight() {
    const lineHeight = Number.parseFloat(getComputedStyle(readerContent).lineHeight) || 22;
    return Math.max(18, Math.min(42, Math.round(lineHeight * 1.1)));
  }

  function maybeAutoScrollOnSelectionDrag(clientY) {
    const zone = edgeZoneHeight();
    const topDistance = clientY;
    const bottomDistance = window.innerHeight - clientY;
    if (topDistance > zone && bottomDistance > zone) return;

    let delta = 0;
    if (topDistance <= zone) {
      const ratio = 1 - (topDistance / zone);
      delta = -Math.max(4, Math.round(14 * ratio));
    } else if (bottomDistance <= zone) {
      const ratio = 1 - (bottomDistance / zone);
      delta = Math.max(4, Math.round(14 * ratio));
    }
    if (delta !== 0) window.scrollBy({ top: delta, behavior: 'auto' });
  }

  // Show the selection bubble for an existing .highlight-mark the user tapped
  function showMenuOnHighlight(markEl) {
    if (!customMenuEnabled) return;
    const text = markEl.textContent.trim();
    const article = getCurrentArticle();
    if (!article) return;

    const baseText = getPositionBaseText(article, readerContent);
    let pos = inferPosition(baseText, text, lastStartRef);

    currentHighlightEl = markEl;
    currentSelection = {
      isExistingHighlight: true,
      isForeignHighlight: markEl.classList.contains('highlight-mark-other'),
      articleId: article.id,
      text,
      positionStart: pos.start >= 0 ? pos.start : 0,
      positionEnd: pos.end > pos.start ? pos.end : text.length,
      range: null,
    };

    // Swap "划线" -> "删除划线" in the bubble
    const menu = ensureMenu();
    const hlBtn = menu.querySelector('[data-action="highlight"]');
    if (hlBtn) {
      const label = hlBtn.querySelector('.btn-label');
      if (currentSelection.isForeignHighlight) {
        hlBtn.dataset.action = 'highlight';
        if (label) label.textContent = '划线';
      } else {
        hlBtn.dataset.action = 'remove-highlight';
        if (label) label.textContent = '删除划线';
      }
    }

    const rect = markEl.getBoundingClientRect();
    showMenu(rect, 'below');
  }

  function onSelectionChange(event, positionMode = 'above') {
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

    const range = selection.getRangeAt(0).cloneRange();
    if (!readerContent.contains(range.commonAncestorContainer)) {
      hideMenu();
      return;
    }

    const article = getCurrentArticle();
    if (!article) {
      hideMenu();
      return;
    }

    const baseText = getPositionBaseText(article, readerContent);
    let pos = inferPosition(baseText, text, lastStartRef);
    if (pos.start < 0 || pos.end <= pos.start) {
      showToast('无法定位到文本位置，请调整选区后重试');
      hideMenu();
      return;
    }

    const rect = range.getBoundingClientRect();
    currentSelection = {
      articleId: article.id,
      text,
      positionStart: pos.start,
      positionEnd: pos.end,
      originText: baseText.slice(pos.start, pos.end),
      approximate: pos.approximate === true,
      range
    };

    showMenu(rect, positionMode);

    if (isStandalonePwa()) {
      // Suppress native selection menu in standalone PWA while keeping our bubble.
      setTimeout(() => {
        window.getSelection()?.removeAllRanges();
      }, 0);
    }

    if (event?.type === 'touchend') {
      event.preventDefault();
    }
    event?.stopPropagation?.();
  }

  readerContent.addEventListener('mouseup', (e) => onSelectionChange(e, 'above'));

  // Three-state menu positioning via selectionchange:
  //   1. Initial long-press (currentSelection null) 鈫?show ABOVE after 300ms
  //   2. While dragging handles                     鈫?hide immediately
  //   3. Drag settled (300ms silence)               鈫?show BELOW
  let _selectionChangeTimer = null;

  // On Android, tapping a .highlight-mark sometimes selects text via the WebView's
  // built-in selection mechanism, making the `click` event unreliable. We intercept
  // `touchend` directly: if the touch ended on a highlight mark, we preventDefault
  // (suppresses the click) and check selection state after a short delay. If no text
  // was selected it was a pure tap 鈫?show "鍒犻櫎鍒掔嚎". Otherwise treat as regular text
  // selection 鈫?show the normal bubble.
  readerContent.addEventListener('touchend', (e) => {
    selectionDragActive = false;
    const mark = e.target.closest('.highlight-mark, .highlight-mark-other');
    if (mark) {
      e.preventDefault(); // suppress the resulting click event
      setTimeout(() => {
        const txt = window.getSelection()?.toString()?.trim() || '';
        clearTimeout(_selectionChangeTimer);
        if (txt) {
          // The user long-pressed to start a text selection on/around the mark
          onSelectionChange(null, 'above');
        } else {
          // Pure tap: show the "鍒犻櫎鍒掔嚎" bubble
          showMenuOnHighlight(mark);
        }
      }, 50);
      return;
    }
    onSelectionChange(e, 'above');
  }, { passive: false });

  // Desktop fallback: click on existing highlight mark shows "鍒犻櫎鍒掔嚎" bubble.
  // (On mobile, touchend + preventDefault above suppresses the click, so this
  // handler only fires for mouse users.)
  readerContent.addEventListener('click', (e) => {
    const mark = e.target.closest('.highlight-mark, .highlight-mark-other');
    if (!mark) return;
    if (window.getSelection()?.toString()?.trim()) return;
    e.stopPropagation();
    showMenuOnHighlight(mark);
  });

  readerContent.addEventListener('touchstart', () => {
    selectionDragActive = hasReaderSelection();
  }, { passive: true });

  readerContent.addEventListener('touchcancel', () => {
    selectionDragActive = false;
  }, { passive: true });

  readerContent.addEventListener('touchmove', (event) => {
    if (!selectionDragActive) return;
    if (!hasReaderSelection()) {
      selectionDragActive = false;
      return;
    }
    const touch = event.touches?.[0];
    if (!touch) return;
    event.preventDefault();
    maybeAutoScrollOnSelectionDrag(touch.clientY);
  }, { passive: false });

  readerContent.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  document.addEventListener('selectionchange', () => {
    const menu = ensureMenu();
    if (!menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
    }
    clearTimeout(_selectionChangeTimer);
    _selectionChangeTimer = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      if (!getPlainSelectionText(sel)) return;
      const range = sel.getRangeAt(0);
      if (!readerContent.contains(range.commonAncestorContainer)) return;
      onSelectionChange(null, currentSelection !== null ? 'below' : 'above');
    }, 300);
  });

  const menu = ensureMenu();
  menu.addEventListener('click', async (event) => {
    event.stopPropagation();
    const btn = event.target.closest('[data-action]');
    const action = btn?.dataset?.action;
    if (!action || !currentSelection) return;

    if (action === 'copy') {
      const text = currentSelection.text;
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (_) {}
      if (!copied) {
        try {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          copied = document.execCommand('copy');
          document.body.removeChild(textarea);
        } catch (_) {}
      }
      showToast(copied ? '已复制' : '复制失败，请重试');
      hideMenu();
      return;
    }

    if (action === 'remove-highlight') {
      const el = currentHighlightEl;
      if (el) {
        const parent = el.parentNode;
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
        // TODO: call deleteHighlight API when backend endpoint is added
      }
      hideMenu();
      return;
    }

    if (action === 'ask') {
      const selection = currentSelection;
      if (!selection) return;
      hideMenu();
      window.getSelection()?.removeAllRanges();
      openQaModal({
        selectionText: selection.text,
        onSubmit: async ({ selectedText, question, history }) => {
          let highlightId = null;
          if (!selection.isExistingHighlight) {
            const highlight = await createHighlight({
              article_id: selection.articleId,
              text: selection.text,
              position_start: selection.positionStart,
              position_end: selection.positionEnd,
              type: 'highlight'
            });
            highlightId = highlight?.id || null;
          }
          const result = await postQa({
            highlight_id: highlightId,
            article_id: selection.articleId,
            selected_text: selectedText,
            question,
            history
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
        let highlightId = null;
        if (!selection.isExistingHighlight) {
          const highlight = await createHighlight({
            article_id: selection.articleId,
            text: selection.text,
            position_start: selection.positionStart,
            position_end: selection.positionEnd,
            type: 'reference'
          });
          highlightId = highlight?.id || null;
        }
        await searchReference({
          text: selection.text,
          articleId: selection.articleId,
          highlightId,
          showToast
        });
      } catch (err) {
        showToast(err?.message || '寮曠敤璇嗗埆澶辫触锛岃绋嶅悗閲嶈瘯');
      }
      return;
    }

    if (action === 'highlight') {
      // Snapshot before hideMenu() nulls out currentSelection.
      const sel = currentSelection;

      // 鈶?Temporarily disable showMenu() for 600ms so that ANY re-triggering
      //    path (selectionchange timer, touchend鈫抩nSelectionChange, etc.) is
      //    blocked at the gate 鈥?regardless of event ordering on the device.
      //    showMenu() already checks `if (!customMenuEnabled) return`, so this
      //    is the single choke-point that covers all paths.
      customMenuEnabled = false;
      setTimeout(() => { customMenuEnabled = true; }, 600);

      // 鈶?Cancel any in-flight selectionchange debounce timer.
      clearTimeout(_selectionChangeTimer);

      // 鈶?Wrap the selected text in the DOM (synchronous).
      try {
        if (sel.range) {
          wrapSelectionRange(readerContent, sel.range, 'highlight-mark');
        }
      } catch (_) {}

      // 鈶?Clear selection and hide the bubble.
      window.getSelection()?.removeAllRanges();
      hideMenu();

      // 鈶?Persist to backend (non-blocking, silent on error).
      createHighlight({
        article_id: sel.articleId,
        text: sel.text,
        position_start: sel.positionStart,
        position_end: sel.positionEnd,
        type: 'highlight'
      }).catch(() => {});
    }
  });

  document.addEventListener('scroll', hideMenu, { passive: true });
  document.addEventListener('click', (event) => {
    if (Date.now() - lastMenuShownAt < 250) return;
    if (!event.target.closest('.selection-menu')) {
      hideMenu();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.selection-menu')) {
      window.getSelection()?.removeAllRanges();
      hideMenu();
    }
  });
}

