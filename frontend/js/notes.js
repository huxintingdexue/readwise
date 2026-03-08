import { getArticles, getHighlights, getQaRecords, getReadingList } from './api.js';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN');
}

function renderNotesList(container, articles, highlights, qaRecords, onJump) {
  container.innerHTML = '';
  if (articles.length === 0) {
    container.innerHTML = '<p class="state-text">暂无笔记</p>';
    return;
  }

  const highlightByArticle = new Map();
  highlights.forEach((item) => {
    if (!highlightByArticle.has(item.article_id)) {
      highlightByArticle.set(item.article_id, []);
    }
    highlightByArticle.get(item.article_id).push(item);
  });

  const qaByArticle = new Map();
  qaRecords.forEach((item) => {
    if (!qaByArticle.has(item.article_id)) {
      qaByArticle.set(item.article_id, []);
    }
    qaByArticle.get(item.article_id).push(item);
  });

  const highlightById = new Map();
  highlights.forEach((item) => highlightById.set(item.id, item));

  articles.forEach((article) => {
    const items = [
      ...(highlightByArticle.get(article.id) || []),
      ...(qaByArticle.get(article.id) || [])
    ];
    if (items.length === 0) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'notes-article';
    wrapper.innerHTML = `<h3>${escapeHtml(article.title_zh || article.title_en || '未命名文章')}</h3>`;

    items.forEach((item) => {
      const isQa = Object.prototype.hasOwnProperty.call(item, 'question');
      const li = document.createElement('div');
      li.className = 'note-item';
      if (isQa) {
        const highlight = highlightById.get(item.highlight_id);
        li.innerHTML = `
          <span>问答 · ${escapeHtml(formatDate(item.created_at))}</span>
          <div>${escapeHtml(item.question || '')}</div>
          <div>${escapeHtml(item.answer_summary || '')}</div>
        `;
        li.addEventListener('click', () => {
          if (highlight?.position_start != null) {
            onJump(article.id, highlight.position_start);
          } else {
            onJump(article.id, 0);
          }
        });
      } else {
        li.innerHTML = `
          <span>划线 · ${escapeHtml(formatDate(item.created_at))}</span>
          <div>${escapeHtml(item.text || '')}</div>
        `;
        li.addEventListener('click', () => {
          onJump(article.id, item.position_start || 0);
        });
      }
      wrapper.appendChild(li);
    });

    container.appendChild(wrapper);
  });
}

function renderReadingList(container, items) {
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p class="state-text">暂无书单</p>';
    return;
  }

  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'reading-item';
    el.innerHTML = `
      <h4>${escapeHtml(item.title || '未命名')}</h4>
      <p>${escapeHtml(item.author || '')} · ${escapeHtml(item.type || '')} · ${escapeHtml(item.status || '')}</p>
    `;
    container.appendChild(el);
  });
}

export async function loadNotesTab({ notesRoot, readingRoot, onJump, showToast }) {
  try {
    notesRoot.innerHTML = '<p class="state-text">加载中...</p>';
    readingRoot.innerHTML = '<p class="state-text">加载中...</p>';
    const [articles, highlights, qaRecords, readingList] = await Promise.all([
      getArticles({ status: '', author: '', sort: 'date_desc' }),
      getHighlights(null),
      getQaRecords(null),
      getReadingList(null)
    ]);

    renderNotesList(notesRoot, articles, highlights, qaRecords, onJump);
    renderReadingList(readingRoot, readingList);
  } catch (err) {
    notesRoot.innerHTML = '<p class="state-text">加载失败</p>';
    readingRoot.innerHTML = '<p class="state-text">加载失败</p>';
    showToast(err?.message || '笔记加载失败');
  }
}

export function initArticleNotesPanel({
  panel,
  body,
  closeBtn,
  getCurrentArticle,
  showToast,
  scrollToPosition
}) {
  closeBtn.addEventListener('click', () => {
    panel.classList.add('hidden');
  });

  return async function openPanel() {
    const article = getCurrentArticle();
    if (!article) return;
    panel.classList.remove('hidden');
    body.innerHTML = '<p class="state-text">加载中...</p>';

    try {
      const [highlights, qaRecords] = await Promise.all([
        getHighlights(article.id),
        getQaRecords(article.id)
      ]);

      const highlightById = new Map();
      highlights.forEach((item) => highlightById.set(item.id, item));

      const items = [
        ...highlights.map((h) => ({ type: 'highlight', data: h })),
        ...qaRecords.map((q) => ({ type: 'qa', data: q }))
      ];

      body.innerHTML = '';
      if (items.length === 0) {
        body.innerHTML = '<p class="state-text">暂无内容</p>';
        return;
      }

      items.forEach((item) => {
        const el = document.createElement('div');
        el.className = 'note-item';
        if (item.type === 'highlight') {
          el.innerHTML = `
            <span>划线 · ${escapeHtml(formatDate(item.data.created_at))}</span>
            <div>${escapeHtml(item.data.text || '')}</div>
          `;
          el.addEventListener('click', () => {
            scrollToPosition(article.content_plain?.length || 0, item.data.position_start || 0);
          });
        } else {
          const highlight = highlightById.get(item.data.highlight_id);
          el.innerHTML = `
            <span>问答 · ${escapeHtml(formatDate(item.data.created_at))}</span>
            <div>${escapeHtml(item.data.question || '')}</div>
            <div>${escapeHtml(item.data.answer_summary || '')}</div>
          `;
          el.addEventListener('click', () => {
            const pos = highlight?.position_start ?? 0;
            scrollToPosition(article.content_plain?.length || 0, pos);
          });
        }
        body.appendChild(el);
      });
    } catch (err) {
      body.innerHTML = '<p class="state-text">加载失败</p>';
      showToast(err?.message || '加载失败');
    }
  };
}

export function hideArticleNotesPanel(panel) {
  panel.classList.add('hidden');
}
