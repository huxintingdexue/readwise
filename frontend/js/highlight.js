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
  // Restore "删除划线" → "划线" if it was swapped
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
  if (article?.content_zh) return article.content_zh;
  if (readerContent?.textContent) return readerContent.textContent;
  return article?.content_plain || '';
}

/**
 * Re-apply stored highlight marks to the DOM after article content is rendered.
 * Called by reader.js after setting readerContent.innerHTML.
 */
export function applyHighlightsToDOM(readerContent, highlights) {
  if (!highlights?.length) return;

  for (const hl of highlights) {
    if (hl.type !== 'highlight') continue;
    if (!hl.text) continue;
    try {
      applyHighlightMark(readerContent, hl.text);
    } catch (e) {
      // Skip highlights that can't be placed (e.g. text no longer in DOM)
    }
  }
}

/**
 * Locate `text` inside readerContent using TreeWalker and wrap it in a
 * .highlight-mark span.  Works for single-node ranges (typical case); skips
 * highlights that span element boundaries (surroundContents restriction).
 */
function applyHighlightMark(readerContent, text) {
  const walker = document.createTreeWalker(readerContent, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    // Skip text inside an already-applied highlight
    if (!node.parentElement?.classList?.contains('highlight-mark')) {
      textNodes.push(node);
    }
  }

  // Build combined plain text to locate the highlight
  const parts = textNodes.map((n) => n.textContent);
  const combined = parts.join('');
  const idx = combined.indexOf(text);
  if (idx < 0) return;

  const endIdx = idx + text.length;
  let pos = 0;
  let rangeStartNode = null;
  let rangeStartOffset = 0;
  let rangeEndNode = null;
  let rangeEndOffset = 0;

  for (const tn of textNodes) {
    const nodeEnd = pos + tn.textContent.length;
    if (rangeStartNode === null && pos <= idx && nodeEnd > idx) {
      rangeStartNode = tn;
      rangeStartOffset = idx - pos;
    }
    if (rangeEndNode === null && pos < endIdx && nodeEnd >= endIdx) {
      rangeEndNode = tn;
      rangeEndOffset = endIdx - pos;
      break;
    }
    pos = nodeEnd;
  }

  if (!rangeStartNode || !rangeEndNode) return;

  const range = document.createRange();
  range.setStart(rangeStartNode, rangeStartOffset);
  range.setEnd(rangeEndNode, rangeEndOffset);
  const mark = document.createElement('span');
  mark.className = 'highlight-mark';
  range.surroundContents(mark); // throws if range crosses element boundary
}

export function initHighlightFeature({
  readerContent,
  getCurrentArticle,
  showToast,
  openOriginSnippet
}) {
  const lastStartRef = { value: 0 };
  customMenuEnabled = true;
  document.body.classList.add('custom-selection');

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
      articleId: article.id,
      text,
      positionStart: pos.start >= 0 ? pos.start : 0,
      positionEnd: pos.end > pos.start ? pos.end : text.length,
      range: null,
    };

    // Swap "划线" → "删除划线" in the bubble
    const menu = ensureMenu();
    const hlBtn = menu.querySelector('[data-action="highlight"]');
    if (hlBtn) {
      hlBtn.dataset.action = 'remove-highlight';
      const label = hlBtn.querySelector('.btn-label');
      if (label) label.textContent = '删除划线';
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

    if (event?.type === 'touchend') {
      event.preventDefault();
    }
    event?.stopPropagation?.();
  }

  readerContent.addEventListener('mouseup', (e) => onSelectionChange(e, 'above'));

  // Three-state menu positioning via selectionchange:
  //   1. Initial long-press (currentSelection null) → show ABOVE after 300ms
  //   2. While dragging handles                     → hide immediately
  //   3. Drag settled (300ms silence)               → show BELOW
  let _selectionChangeTimer = null;

  // On Android, tapping a .highlight-mark sometimes selects text via the WebView's
  // built-in selection mechanism, making the `click` event unreliable. We intercept
  // `touchend` directly: if the touch ended on a highlight mark, we preventDefault
  // (suppresses the click) and check selection state after a short delay. If no text
  // was selected it was a pure tap → show "删除划线". Otherwise treat as regular text
  // selection → show the normal bubble.
  readerContent.addEventListener('touchend', (e) => {
    const mark = e.target.closest('.highlight-mark');
    if (mark) {
      e.preventDefault(); // suppress the resulting click event
      setTimeout(() => {
        const txt = window.getSelection()?.toString()?.trim() || '';
        clearTimeout(_selectionChangeTimer);
        if (txt) {
          // The user long-pressed to start a text selection on/around the mark
          onSelectionChange(null, 'above');
        } else {
          // Pure tap: show the "删除划线" bubble
          showMenuOnHighlight(mark);
        }
      }, 50);
      return;
    }
    onSelectionChange(e, 'above');
  }, { passive: false });

  // Desktop fallback: click on existing highlight mark shows "删除划线" bubble.
  // (On mobile, touchend + preventDefault above suppresses the click, so this
  // handler only fires for mouse users.)
  readerContent.addEventListener('click', (e) => {
    const mark = e.target.closest('.highlight-mark');
    if (!mark) return;
    if (window.getSelection()?.toString()?.trim()) return;
    e.stopPropagation();
    showMenuOnHighlight(mark);
  });

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
      const article = getCurrentArticle();
      const selection = currentSelection;
      if (!selection) return;
      const baseText = article?.content_zh || article?.content_plain || '';
      const summaryText = article?.summary_zh || article?.summary_en || '';
      const contextText = buildContextText(baseText, selection.positionStart, selection.positionEnd, 5);
      const expandedContext = buildContextText(baseText, selection.positionStart, selection.positionEnd, 12);
      const fullText = baseText.length <= 8000 ? baseText : '';
      const fallbackContextText = fullText || expandedContext;
      const primaryContext = [summaryText, contextText].filter(Boolean).join('\n\n');
      const fallbackContext = [summaryText, fallbackContextText].filter(Boolean).join('\n\n');
      hideMenu();
      window.getSelection()?.removeAllRanges();
      openQaModal({
        selectionText: selection.text,
        contextText: primaryContext,
        onSubmit: async (question, context) => {
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
            question,
            context,
            fallback_context: fallbackContext
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
        showToast(err?.message || '引用识别失败，请稍后重试');
      }
      return;
    }

    if (action === 'highlight') {
      // Snapshot before hideMenu() nulls out currentSelection.
      const sel = currentSelection;

      // ① Temporarily disable showMenu() for 600ms so that ANY re-triggering
      //    path (selectionchange timer, touchend→onSelectionChange, etc.) is
      //    blocked at the gate — regardless of event ordering on the device.
      //    showMenu() already checks `if (!customMenuEnabled) return`, so this
      //    is the single choke-point that covers all paths.
      customMenuEnabled = false;
      setTimeout(() => { customMenuEnabled = true; }, 600);

      // ② Cancel any in-flight selectionchange debounce timer.
      clearTimeout(_selectionChangeTimer);

      // ③ Wrap the selected text in the DOM (synchronous).
      try {
        if (sel.range) {
          const mark = document.createElement('span');
          mark.className = 'highlight-mark';
          sel.range.surroundContents(mark);
        }
      } catch (_) {}

      // ④ Clear selection and hide the bubble.
      window.getSelection()?.removeAllRanges();
      hideMenu();

      // ⑤ Persist to backend (non-blocking, silent on error).
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

function buildContextText(contentPlain, start, end, windowSize = 5) {
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

  const from = Math.max(0, startIdx - windowSize);
  const to = Math.min(sentences.length, endIdx + windowSize + 1);
  return sentences.slice(from, to).join('').trim();
}
