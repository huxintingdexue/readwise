import { getArticles, getArticleById, getReadingProgress } from './api.js';
import { initHighlightFeature } from './highlight.js';
import { closeOriginSnippetPanel, closeReader, openOriginSnippetPanel, renderReader } from './reader.js';
import { initReferenceTestPanel } from './reference.js';

const state = {
  tab: 'today',
  filters: {
    status: '',
    author: '',
    sort: 'date_desc'
  },
  articles: [],
  currentArticle: null,
  longPressTimer: null,
  longPressTargetId: null
};

const nodes = {
  tabButtons: [...document.querySelectorAll('.tab-btn')],
  todayTab: document.querySelector('#tab-today'),
  notesTab: document.querySelector('#tab-notes'),
  statusFilter: document.querySelector('#statusFilter'),
  authorFilter: document.querySelector('#authorFilter'),
  sortFilter: document.querySelector('#sortFilter'),
  articlesState: document.querySelector('#articlesState'),
  articlesList: document.querySelector('#articlesList'),
  readerView: document.querySelector('#readerView'),
  readerTitle: document.querySelector('#readerTitle'),
  readerMeta: document.querySelector('#readerMeta'),
  readerContent: document.querySelector('#readerContent'),
  backBtn: document.querySelector('#backBtn'),
  longPressMenu: document.querySelector('#longPressMenu'),
  toast: document.querySelector('#toast'),
  originSnippet: document.querySelector('#originSnippet'),
  originSnippetText: document.querySelector('#originSnippetText'),
  closeOriginSnippet: document.querySelector('#closeOriginSnippet')
};

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, duration = 2200) {
  nodes.toast.textContent = message;
  nodes.toast.classList.remove('hidden');
  setTimeout(() => nodes.toast.classList.add('hidden'), duration);
}

function formatDate(isoString) {
  if (!isoString) return '未知时间';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '未知时间';
  return d.toLocaleDateString('zh-CN');
}

function sourceName(sourceKey) {
  if (sourceKey === 'sam') return 'Sam Altman';
  if (sourceKey === 'andrej') return 'Andrej Karpathy';
  if (sourceKey === 'peter') return 'Peter Steipete';
  return sourceKey || 'Unknown';
}

function hideLongPressMenu() {
  nodes.longPressMenu.classList.add('hidden');
  nodes.longPressMenu.style.left = '-9999px';
  nodes.longPressMenu.style.top = '-9999px';
  state.longPressTargetId = null;
}

function showLongPressMenu(x, y, articleId) {
  state.longPressTargetId = articleId;
  nodes.longPressMenu.style.left = `${x}px`;
  nodes.longPressMenu.style.top = `${y}px`;
  nodes.longPressMenu.classList.remove('hidden');
}

function renderArticles() {
  nodes.articlesList.innerHTML = '';

  if (state.articles.length === 0) {
    nodes.articlesState.textContent = '暂无文章';
    return;
  }

  nodes.articlesState.textContent = `共 ${state.articles.length} 篇`;

  state.articles.forEach((item) => {
    const li = document.createElement('li');
    const progress = Math.max(0, Math.min(100, Number(item.read_progress || 0)));
    li.innerHTML = `
      <article class="article-card" data-id="${item.id}">
        <h3>${escapeHtml(item.title_zh || item.title_en || '未命名文章')}</h3>
        <div class="article-meta">${escapeHtml(sourceName(item.source_key))} · ${escapeHtml(formatDate(item.published_at))} · ${escapeHtml(item.read_status || 'unread')}</div>
        <p class="article-summary">${escapeHtml(item.summary_zh || item.summary_en || '暂无摘要')}</p>
        <div class="progress"><span style="width:${progress}%"></span></div>
        <div class="progress-label">阅读进度 ${progress}%</div>
      </article>
    `;

    const card = li.firstElementChild;
    card.addEventListener('click', () => openArticle(item.id));

    card.addEventListener('pointerdown', (event) => {
      state.longPressTimer = setTimeout(() => {
        event.preventDefault();
        showLongPressMenu(event.clientX, event.clientY, item.id);
      }, 550);
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => {
      card.addEventListener(name, () => {
        if (state.longPressTimer) {
          clearTimeout(state.longPressTimer);
          state.longPressTimer = null;
        }
      });
    });

    card.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showLongPressMenu(event.clientX, event.clientY, item.id);
    });

    nodes.articlesList.appendChild(li);
  });
}

async function loadArticles() {
  try {
    nodes.articlesState.textContent = '加载中...';
    state.articles = await getArticles(state.filters);
    renderArticles();
  } catch (err) {
    nodes.articlesState.textContent = `加载失败：${err.message}`;
    showToast('请确认 frontend/js/local-config.js 中 window.__API_SECRET__ 已填写');
  }
}

async function openArticle(id) {
  try {
    const [detail, progress] = await Promise.all([getArticleById(id), getReadingProgress(id)]);
    state.currentArticle = detail;
    renderReader(detail, {
      readerView: nodes.readerView,
      readerTitle: nodes.readerTitle,
      readerMeta: nodes.readerMeta,
      readerContent: nodes.readerContent,
      listPanels: [nodes.todayTab, nodes.notesTab],
      originSnippet: nodes.originSnippet,
      originSnippetText: nodes.originSnippetText
    }, progress);
  } catch (err) {
    showToast(`打开文章失败：${err.message}`);
  }
}

function switchTab(nextTab) {
  state.tab = nextTab;
  nodes.tabButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === nextTab);
  });
  closeReader({
    readerView: nodes.readerView,
    listPanels: [nodes.todayTab, nodes.notesTab],
    readerContent: nodes.readerContent,
    originSnippet: nodes.originSnippet,
    originSnippetText: nodes.originSnippetText
  });
  nodes.todayTab.classList.toggle('hidden', nextTab !== 'today');
  nodes.notesTab.classList.toggle('hidden', nextTab !== 'notes');
  if (nextTab !== 'today') {
    state.currentArticle = null;
  }
  hideLongPressMenu();
}

function bindEvents() {
  nodes.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  nodes.statusFilter.addEventListener('change', () => {
    state.filters.status = nodes.statusFilter.value;
    loadArticles();
  });
  nodes.authorFilter.addEventListener('change', () => {
    state.filters.author = nodes.authorFilter.value;
    loadArticles();
  });
  nodes.sortFilter.addEventListener('change', () => {
    state.filters.sort = nodes.sortFilter.value;
    loadArticles();
  });

  nodes.backBtn.addEventListener('click', () => {
    state.currentArticle = null;
    closeReader({
      readerView: nodes.readerView,
      listPanels: [nodes.todayTab, nodes.notesTab],
      readerContent: nodes.readerContent,
      originSnippet: nodes.originSnippet,
      originSnippetText: nodes.originSnippetText
    });
  });

  nodes.closeOriginSnippet?.addEventListener('click', () => {
    closeOriginSnippetPanel({
      originSnippet: nodes.originSnippet,
      originSnippetText: nodes.originSnippetText
    });
  });

  document.addEventListener('click', (event) => {
    const insideMenu = event.target.closest('#longPressMenu');
    const insideCard = event.target.closest('.article-card');
    const insideOrigin = event.target.closest('#originSnippet');
    if (!insideMenu && !insideCard) {
      hideLongPressMenu();
    }
    if (!insideOrigin && !event.target.closest('.origin-btn')) {
      closeOriginSnippetPanel({
        originSnippet: nodes.originSnippet,
        originSnippetText: nodes.originSnippetText
      });
    }
  });

  nodes.longPressMenu.addEventListener('click', (event) => {
    const action = event.target.dataset.action;
    if (!action || !state.longPressTargetId) return;

    if (action === 'mark-read') {
      showToast('已触发“标记已读”菜单（状态写库在后续步骤接入）');
    } else if (action === 'archive') {
      showToast('已触发“存档”菜单（状态写库在后续步骤接入）');
    } else if (action === 'cancel-archive') {
      showToast('已触发“取消存档”菜单（状态写库在后续步骤接入）');
    }

    hideLongPressMenu();
  });
}

function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] register failed', err.message);
    });
  }

  bindEvents();
  initReferenceTestPanel(showToast);
  initHighlightFeature({
    readerContent: nodes.readerContent,
    getCurrentArticle: () => state.currentArticle,
    showToast,
    openOriginSnippet: (text) =>
      openOriginSnippetPanel(
        { originSnippet: nodes.originSnippet, originSnippetText: nodes.originSnippetText },
        text
      )
  });
  switchTab('today');
  loadArticles();
}

init();
