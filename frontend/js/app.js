import { getArticles, getArticleById, getReadingProgress, isLoggedIn, login, logout, postFeedback, getFeedback, getAdminStats, trackEvent } from './api.js';
import { initHighlightFeature } from './highlight.js';
import { closeOriginSnippetPanel, closeReader, openOriginSnippetPanel, renderReader, scrollToPlainPosition } from './reader.js';
import { initArticleNotesPanel } from './notes.js';

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
  longPressTargetId: null,
  historyBound: false,
  appStarted: false,
  logoutTimer: null
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
  articleNotesBtn: document.querySelector('#articleNotesBtn'),
  articleNotesPanel: document.querySelector('#articleNotesPanel'),
  articleNotesBody: document.querySelector('#articleNotesBody'),
  closeArticleNotes: document.querySelector('#closeArticleNotes'),
  inviteCodeDisplay: document.querySelector('#inviteCodeDisplay'),
  exportEntry: document.querySelector('#exportEntry'),
  feedbackEntry: document.querySelector('#feedbackEntry'),
  themeDebugCopy: document.querySelector('#themeDebugCopy'),
  adminSection: document.querySelector('#adminSection'),
  adminFeedbackEntry: document.querySelector('#adminFeedbackEntry'),
  backBtn: document.querySelector('#backBtn'),
  filterToggle: document.querySelector('#filterToggle'),
  filterPanel: document.querySelector('#filterPanel'),
  longPressMenu: document.querySelector('#longPressMenu'),
  toast: document.querySelector('#toast'),
  originSnippet: document.querySelector('#originSnippet'),
  originSnippetText: document.querySelector('#originSnippetText'),
  closeOriginSnippet: document.querySelector('#closeOriginSnippet'),
  topbarTitle: document.querySelector('#topbarTitle'),
  loginOverlay: document.querySelector('#loginOverlay'),
  loginInput: document.querySelector('#loginInput'),
  loginButton: document.querySelector('#loginButton'),
  loginError: document.querySelector('#loginError'),
  logoutBtn: document.querySelector('#logoutBtn'),
  feedbackModal: document.querySelector('#feedbackModal'),
  feedbackInput: document.querySelector('#feedbackInput'),
  feedbackSubmitBtn: document.querySelector('#feedbackSubmitBtn'),
  feedbackCloseBtn: document.querySelector('#feedbackCloseBtn'),
  adminFeedbackModal: document.querySelector('#adminFeedbackModal'),
  adminFeedbackBody: document.querySelector('#adminFeedbackBody'),
  adminFeedbackCloseBtn: document.querySelector('#adminFeedbackCloseBtn'),
  adminStatsEntry: document.querySelector('#adminStatsEntry'),
  adminStatsModal: document.querySelector('#adminStatsModal'),
  adminStatsBody: document.querySelector('#adminStatsBody'),
  adminStatsCloseBtn: document.querySelector('#adminStatsCloseBtn'),
  themeChoices: [...document.querySelectorAll('.theme-choice')]
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

let systemThemeWatcher = null;
let systemThemeHandler = null;

function applyTheme(theme) {
  document.body.classList.remove('theme-warm', 'theme-dark');
  if (theme === 'eye') document.body.classList.add('theme-warm');
  if (theme === 'dark') document.body.classList.add('theme-dark');
}

function normalizeThemeValue(value) {
  if (value === 'day') return 'light';
  if (value === 'warm') return 'eye';
  if (value === 'dark' || value === 'light' || value === 'eye' || value === 'system') return value;
  return 'system';
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function clearSystemWatcher() {
  if (!systemThemeWatcher) return;
  if (systemThemeWatcher.removeEventListener && systemThemeHandler) {
    systemThemeWatcher.removeEventListener('change', systemThemeHandler);
  } else if ('onchange' in systemThemeWatcher) {
    systemThemeWatcher.onchange = null;
  }
  systemThemeWatcher = null;
  systemThemeHandler = null;
}

function setThemeChoice(theme) {
  const normalized = normalizeThemeValue(theme);
  localStorage.setItem('theme', normalized);
  updateTheme(normalized);
  renderThemeChoices(normalized);
}

function updateTheme(theme) {
  clearSystemWatcher();

  if (theme === 'system') {
    systemThemeWatcher = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeHandler = (event) => {
      applyTheme(event.matches ? 'dark' : 'light');
    };
    applyTheme(systemThemeWatcher.matches ? 'dark' : 'light');
    if (systemThemeWatcher.addEventListener) {
      systemThemeWatcher.addEventListener('change', systemThemeHandler);
    } else {
      systemThemeWatcher.onchange = systemThemeHandler;
    }
    return;
  }

  applyTheme(theme);
}

function renderThemeChoices(active) {
  nodes.themeChoices.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.theme === active);
  });
}

function initTheme() {
  const saved = normalizeThemeValue(localStorage.getItem('theme'));
  updateTheme(saved);
  renderThemeChoices(saved);
}

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

function readStatusLabel(status, progress) {
  if (status === 'archived') return '存档';
  if (status === 'read') return `已读 ${progress}%`;
  if (progress > 0) return `已读 ${progress}%`;
  return '未读';
}

function hideLongPressMenu() {
  if (!nodes.longPressMenu) return;
  nodes.longPressMenu.classList.add('hidden');
  nodes.longPressMenu.style.left = '-9999px';
  nodes.longPressMenu.style.top = '-9999px';
  state.longPressTargetId = null;
}

function showLongPressMenu(x, y, articleId) {
  state.longPressTargetId = articleId;
  if (!nodes.longPressMenu) return;
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

  nodes.articlesState.textContent = '';

  state.articles.forEach((item) => {
    const li = document.createElement('li');
    const progress = Math.max(0, Math.min(100, Number(item.read_progress || 0)));
    const progressLabel = Math.round(progress);
    li.innerHTML = `
      <article class="article-card" data-id="${item.id}">
        <div class="article-card-head">
          <h3>${escapeHtml(item.title_zh || item.title_en || '未命名文章')}</h3>
          <span class="read-status">${escapeHtml(readStatusLabel(item.read_status, progressLabel))}</span>
        </div>
        <div class="article-meta">${escapeHtml(sourceName(item.source_key))} · ${escapeHtml(formatDate(item.published_at))}</div>
        <p class="article-summary">${escapeHtml(item.summary_zh || item.summary_en || '暂无摘要')}</p>
      </article>
    `;

    const card = li.firstElementChild;
    card.addEventListener('click', () => openArticle(item.id));

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
    if (String(err.message || '').includes('邀请码无效')) {
      showToast('邀请码无效，请重新登录');
      logout();
      return;
    }
    showToast('加载失败，请稍后重试');
  }
}

async function openArticle(id, jumpTo = null) {
  try {
    if (!history.state || history.state.view !== 'reader' || history.state.articleId !== id) {
      history.pushState({ view: 'reader', articleId: id }, '', `?article=${id}`);
    }
    const [detail, progress] = await Promise.all([getArticleById(id), getReadingProgress(id)]);
    state.currentArticle = detail;
    document.body.classList.add('reading-mode');
    document.body.classList.add('reader-bar-hidden');
    renderReader(detail, {
      readerView: nodes.readerView,
      readerTitle: nodes.readerTitle,
      readerMeta: nodes.readerMeta,
      readerContent: nodes.readerContent,
      listPanels: [nodes.todayTab, nodes.notesTab],
      originSnippet: nodes.originSnippet,
      originSnippetText: nodes.originSnippetText,
      articleNotesPanel: nodes.articleNotesPanel
    }, progress);
    if (jumpTo != null) {
      scrollToPlainPosition((detail.content_plain || '').length || 0, jumpTo);
    }
  } catch (err) {
    showToast(`打开文章失败：${err.message}`);
  }
}

function switchTab(nextTab) {
  state.tab = nextTab;
  nodes.tabButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === nextTab);
  });
  document.body.classList.remove('reading-mode');
  document.body.classList.remove('reader-bar-hidden');
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

  if (nextTab === 'notes') {
    refreshMeTab();
  }
}

function bindEvents() {
  nodes.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  nodes.filterToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    nodes.filterPanel?.classList.toggle('hidden');
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
    document.body.classList.remove('reading-mode');
    document.body.classList.remove('reader-bar-hidden');
    closeReader({
      readerView: nodes.readerView,
      listPanels: [nodes.todayTab, nodes.notesTab],
      readerContent: nodes.readerContent,
      originSnippet: nodes.originSnippet,
      originSnippetText: nodes.originSnippetText
    });
    nodes.todayTab.classList.toggle('hidden', state.tab !== 'today');
    nodes.notesTab.classList.toggle('hidden', state.tab !== 'notes');
  });

  nodes.closeOriginSnippet?.addEventListener('click', () => {
    closeOriginSnippetPanel({
      originSnippet: nodes.originSnippet,
      originSnippetText: nodes.originSnippetText
    });
  });

  nodes.themeChoices.forEach((btn) => {
    btn.addEventListener('click', () => {
      setThemeChoice(btn.dataset.theme || 'system');
    });
  });

  nodes.logoutBtn?.addEventListener('click', () => {
    const confirmed = window.confirm('确定退出登录吗？');
    if (!confirmed) return;
    logout();
  });

  nodes.exportEntry?.addEventListener('click', () => {
    showToast('功能开发中，敬请期待～着急可微信联系 Guang', 2000);
  });

  nodes.feedbackEntry?.addEventListener('click', () => {
    openFeedbackModal();
  });

  nodes.themeDebugCopy?.addEventListener('click', async () => {
    const payload = {
      theme: localStorage.getItem('theme') || '',
      systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      bodyClass: document.body.className,
      userAgent: navigator.userAgent
    };
    const text = JSON.stringify(payload);
    try {
      await navigator.clipboard.writeText(text);
      showToast('已复制调试信息', 2000);
    } catch (_) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.setAttribute('readonly', 'readonly');
      textArea.style.position = 'fixed';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        const ok = document.execCommand('copy');
        showToast(ok ? '已复制调试信息' : '复制失败，请重试', 2000);
      } catch (err) {
        showToast('复制失败，请重试', 2000);
      } finally {
        document.body.removeChild(textArea);
      }
    }
  });

  nodes.feedbackCloseBtn?.addEventListener('click', () => {
    closeFeedbackModal();
  });

  const handleFeedbackSubmit = async () => {
    const content = String(nodes.feedbackInput?.value || '').trim();
    if (!content) {
      showToast('请输入反馈内容', 2000);
      return;
    }
    try {
      await postFeedback(content);
      closeFeedbackModal();
      showToast('发送成功，感谢反馈！', 2000);
    } catch (_) {
      showToast('发送失败，请重试', 2000);
    }
  };

  nodes.feedbackSubmitBtn?.addEventListener('touchend', (event) => {
    event.preventDefault();
    handleFeedbackSubmit();
  });
  nodes.feedbackSubmitBtn?.addEventListener('click', () => {
    handleFeedbackSubmit();
  });

  nodes.adminFeedbackEntry?.addEventListener('click', async () => {
    await openAdminFeedback();
  });

  nodes.adminFeedbackCloseBtn?.addEventListener('click', () => {
    closeAdminFeedback();
  });

  nodes.adminStatsEntry?.addEventListener('click', async () => {
    await openAdminStats();
  });

  nodes.adminStatsCloseBtn?.addEventListener('click', () => {
    closeAdminStats();
  });

  document.addEventListener('click', (event) => {
    const insideMenu = event.target.closest('#longPressMenu');
    const insideCard = event.target.closest('.article-card');
    const insideOrigin = event.target.closest('#originSnippet');
    const insideFilter = event.target.closest('#filterPanel');
    const insideToggle = event.target.closest('#filterToggle');
    if (!insideMenu && !insideCard) {
      hideLongPressMenu();
    }
    if (!insideOrigin && !event.target.closest('.origin-btn')) {
      closeOriginSnippetPanel({
        originSnippet: nodes.originSnippet,
        originSnippetText: nodes.originSnippetText
      });
    }
    if (!insideFilter && !insideToggle) {
      nodes.filterPanel?.classList.add('hidden');
    }
  });

  if (nodes.longPressMenu) {
    nodes.longPressMenu.classList.add('hidden');
  }

  nodes.readerContent.addEventListener('click', () => {
    if (!document.body.classList.contains('reading-mode')) return;
    const selectionText = window.getSelection()?.toString()?.trim();
    if (selectionText) return;
    document.body.classList.toggle('reader-bar-hidden');
  });

  if (!state.historyBound) {
    window.addEventListener('popstate', () => {
      if (document.body.classList.contains('reading-mode')) {
        state.currentArticle = null;
        document.body.classList.remove('reading-mode');
        document.body.classList.remove('reader-bar-hidden');
        closeReader({
          readerView: nodes.readerView,
          listPanels: [nodes.todayTab, nodes.notesTab],
          readerContent: nodes.readerContent,
          originSnippet: nodes.originSnippet,
          originSnippetText: nodes.originSnippetText
        });
        nodes.todayTab.classList.toggle('hidden', state.tab !== 'today');
        nodes.notesTab.classList.toggle('hidden', state.tab !== 'notes');
      }
    });
    state.historyBound = true;
  }
}

function getInviteCodeLabel() {
  const inviteCode = localStorage.getItem('inviteCode') || '-';
  return `邀请码：${inviteCode}`;
}

function getUserId() {
  return localStorage.getItem('userId') || '';
}

function refreshMeTab() {
  if (nodes.inviteCodeDisplay) {
    nodes.inviteCodeDisplay.textContent = getInviteCodeLabel();
  }
  const userId = getUserId();
  if (nodes.adminSection) {
    nodes.adminSection.classList.toggle('hidden', userId !== 'admin');
  }
  renderThemeChoices(normalizeThemeValue(localStorage.getItem('theme')));
}

function closeAdminStats() {
  nodes.adminStatsModal?.classList.add('hidden');
}

function renderStatBlock(title, lines) {
  const block = document.createElement('div');
  block.className = 'me-stat-block';
  block.innerHTML = `<h3>${escapeHtml(title)}</h3>`;
  lines.forEach((line) => {
    const row = document.createElement('div');
    row.className = 'me-stat-line';
    row.innerHTML = `<div>${escapeHtml(line.label)}</div><span>${escapeHtml(line.value)}</span>`;
    block.appendChild(row);
  });
  return block;
}

async function openAdminStats() {
  if (!nodes.adminStatsModal || !nodes.adminStatsBody) return;
  nodes.adminStatsBody.innerHTML = '';
  nodes.adminStatsModal.classList.remove('hidden');
  try {
    const data = await getAdminStats();
    const today = renderStatBlock('今日概览', [
      { label: '今日活跃用户数', value: String(data.today_active_users ?? 0) },
      { label: '今日文章打开次数', value: String(data.today_open_articles ?? 0) }
    ]);
    nodes.adminStatsBody.appendChild(today);

    const weekly = renderStatBlock(
      '本周阅读排行（按用户）',
      (data.weekly_user_finishes || []).map((item) => ({
        label: item.user_id || 'unknown',
        value: `${item.count || 0} 篇`
      }))
    );
    nodes.adminStatsBody.appendChild(weekly);

    const completion = renderStatBlock(
      '文章完成率排行',
      (data.article_completion || []).map((item) => ({
        label: item.title || '未命名文章',
        value: `${item.rate || 0}%`
      }))
    );
    nodes.adminStatsBody.appendChild(completion);

    const highlightBlock = renderStatBlock(
      '核心功能使用（划线）',
      (data.highlights_by_user || []).map((item) => ({
        label: item.user_id || 'unknown',
        value: `${item.count || 0} 次`
      }))
    );
    nodes.adminStatsBody.appendChild(highlightBlock);

    const qaBlock = renderStatBlock(
      '核心功能使用（提问）',
      (data.qa_by_user || []).map((item) => ({
        label: item.user_id || 'unknown',
        value: `${item.count || 0} 次`
      }))
    );
    nodes.adminStatsBody.appendChild(qaBlock);
  } catch (_) {
    nodes.adminStatsBody.innerHTML = '<div class="state-text">加载失败</div>';
  }
}

function openFeedbackModal() {
  nodes.feedbackModal?.classList.remove('hidden');
  if (nodes.feedbackInput) {
    nodes.feedbackInput.value = '';
    nodes.feedbackInput.focus();
  }
}

function closeFeedbackModal() {
  nodes.feedbackModal?.classList.add('hidden');
}

function formatAdminTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '未知时间';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function closeAdminFeedback() {
  nodes.adminFeedbackModal?.classList.add('hidden');
}

async function openAdminFeedback() {
  if (!nodes.adminFeedbackModal || !nodes.adminFeedbackBody) return;
  nodes.adminFeedbackBody.innerHTML = '';
  nodes.adminFeedbackModal.classList.remove('hidden');
  try {
    const items = await getFeedback();
    if (!items.length) {
      nodes.adminFeedbackBody.innerHTML = '<div class="state-text">暂无反馈</div>';
      return;
    }
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'me-feedback-item';
      div.innerHTML = `
        <div class="me-feedback-meta">
          <span>${escapeHtml(item.user_id || 'unknown')}</span>
          <span>${escapeHtml(formatAdminTime(item.created_at))}</span>
        </div>
        <div>${escapeHtml(item.content || '')}</div>
      `;
      nodes.adminFeedbackBody.appendChild(div);
    });
  } catch (_) {
    nodes.adminFeedbackBody.innerHTML = '<div class="state-text">加载失败</div>';
  }
}

function showLoginOverlay(message = '') {
  if (!nodes.loginOverlay) return;
  nodes.loginOverlay.classList.remove('hidden');
  if (nodes.loginError) {
    nodes.loginError.textContent = message;
  }
}

function hideLoginOverlay() {
  nodes.loginOverlay?.classList.add('hidden');
  if (nodes.loginError) nodes.loginError.textContent = '';
}

function bindLoginEvents() {
  if (!nodes.loginButton || !nodes.loginInput) return;

  const attemptLogin = async () => {
    const code = nodes.loginInput.value.trim();
    if (!code) {
      showLoginOverlay('请输入邀请码');
      return;
    }
    try {
      await login(code);
      hideLoginOverlay();
      startApp();
    } catch (err) {
      showLoginOverlay(err.message || '邀请码无效，请联系管理员');
    }
  };

  nodes.loginButton.addEventListener('click', attemptLogin);
  nodes.loginInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      attemptLogin();
    }
  });
}

function startApp() {
  if (state.appStarted) return;
  state.appStarted = true;
  trackEvent('open_app');
  bindEvents();
  const openArticleNotes = initArticleNotesPanel({
    panel: nodes.articleNotesPanel,
    body: nodes.articleNotesBody,
    closeBtn: nodes.closeArticleNotes,
    getCurrentArticle: () => state.currentArticle,
    showToast,
    scrollToPosition: scrollToPlainPosition
  });
  nodes.articleNotesBtn.addEventListener('click', () => {
    openArticleNotes();
  });
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

function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] register failed', err.message);
    });
  }

  initTheme();
  bindLoginEvents();
  if (isLoggedIn()) {
    hideLoginOverlay();
    startApp();
  } else {
    showLoginOverlay('请输入邀请码');
  }
}

init();
