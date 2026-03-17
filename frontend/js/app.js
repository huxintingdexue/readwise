import { getArticles, getArticleById, getReadingProgress, saveReadingProgress, isLoggedIn, login, logout, postFeedback, getFeedback, getAdminStats, getInviteCodes, addInviteCode, ingestUrl, translateIngestStep, trackEvent } from './api.js';
import { initHighlightFeature } from './highlight.js';
import { closeOriginSnippetPanel, closeReader, openOriginSnippetPanel, renderReader, renderReaderLoading, scrollToPlainPosition } from './reader.js';
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
  logoutTimer: null,
  ingestTimer: null,
  ingestBusy: false
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
  adminSection: document.querySelector('#adminSection'),
  adminConsoleEntry: document.querySelector('#adminConsoleEntry'),
  adminConsole: document.querySelector('#adminConsole'),
  adminBackBtn: document.querySelector('#adminBackBtn'),
  adminFeedbackList: document.querySelector('#adminFeedbackList'),
  adminStatsList: document.querySelector('#adminStatsList'),
  adminInviteList: document.querySelector('#adminInviteList'),
  adminInviteCode: document.querySelector('#adminInviteCode'),
  adminInviteUserId: document.querySelector('#adminInviteUserId'),
  adminInviteAdd: document.querySelector('#adminInviteAdd'),
  backBtn: document.querySelector('#backBtn'),
  filterToggle: document.querySelector('#filterToggle'),
  filterPanel: document.querySelector('#filterPanel'),
  ingestToggle: document.querySelector('#ingestToggle'),
  ingestModal: document.querySelector('#ingestModal'),
  ingestInput: document.querySelector('#ingestInput'),
  ingestSubmitBtn: document.querySelector('#ingestSubmitBtn'),
  ingestCloseBtn: document.querySelector('#ingestCloseBtn'),
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

function applyTheme(theme) {
  document.body.classList.remove('theme-warm', 'theme-dark');
  if (theme === 'eye') document.body.classList.add('theme-warm');
  if (theme === 'dark') document.body.classList.add('theme-dark');
}

function normalizeThemeValue(value) {
  if (value === 'day') return 'light';
  if (value === 'warm') return 'eye';
  if (value === 'dark' || value === 'light' || value === 'eye') return value;
  return 'light';
}

function setThemeChoice(theme) {
  const normalized = normalizeThemeValue(theme);
  localStorage.setItem('theme', normalized);
  updateTheme(normalized);
  renderThemeChoices(normalized);
}

function updateTheme(theme) {
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

function sourceName(sourceKey, author) {
  if (sourceKey === 'manual') return author || '读友推荐';
  if (sourceKey === 'sam') return 'Sam Altman';
  if (sourceKey === 'andrej') return 'Andrej Karpathy';
  if (sourceKey === 'peter') return 'Peter Steipete';
  if (sourceKey === 'naval') return 'Naval Ravikant';
  return sourceKey || 'Unknown';
}

function readStatusLabel(status, progress) {
  if (status === 'archived') return '存档';
  if (status === 'read') return `已读 ${progress}%`;
  if (progress > 0) return `已读 ${progress}%`;
  return '未读';
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

async function persistReadingProgressNow() {
  const detail = state.currentArticle;
  if (!detail?.id) return;
  const contentPlainLength = Number((detail.content_plain || '').length || 0);
  if (!contentPlainLength) return;
  const scrollPosition = calcScrollPositionByPlainLength(contentPlainLength);
  try {
    await saveReadingProgress(detail.id, scrollPosition);
  } catch (err) {
    console.warn('[reading-progress] save failed', err.message);
  }
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

  const ordered = state.articles
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const aManual = Boolean(a.item.submitted_by || a.item.source_key === 'manual');
      const bManual = Boolean(b.item.submitted_by || b.item.source_key === 'manual');
      if (aManual === bManual) return a.idx - b.idx;
      return aManual ? -1 : 1;
    })
    .map((row) => row.item);

  ordered.forEach((item) => {
    const li = document.createElement('li');
    const progress = Math.max(0, Math.min(100, Number(item.read_progress || 0)));
    const progressLabel = Math.round(progress);
    const isTranslating = item.status === 'translating';
    const statusLabel = isTranslating ? '翻译中...' : readStatusLabel(item.read_status, progressLabel);
    const isOwner = item.submitted_by && item.submitted_by === getUserId();
    const showBadge = item.status !== 'translating' && isOwner;
    const isManual = Boolean(item.submitted_by || item.source_key === 'manual');
    const isManualTranslating = isManual && isTranslating;
    li.innerHTML = `
      <article class="article-card${isTranslating ? ' is-disabled' : ''}${isManualTranslating ? ' is-recommend' : ''}" data-id="${item.id}">
        <div class="article-card-head">
          <div class="article-card-title">
            <h3>${escapeHtml(item.title_zh || item.title_en || '未命名文章')}</h3>
            ${showBadge ? '<span class="article-badge">我添加的</span>' : ''}
          </div>
          <span class="${isTranslating ? 'article-status' : 'read-status'}">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="article-meta">${escapeHtml(sourceName(item.source_key, item.author))} · ${escapeHtml(formatDate(item.published_at))}</div>
        <p class="article-summary">${escapeHtml(item.summary_zh || item.summary_en || '暂无摘要')}</p>
      </article>
    `;

    const card = li.firstElementChild;
    if (!isTranslating) {
      card.addEventListener('click', () => openArticle(item.id));
    }

    nodes.articlesList.appendChild(li);
  });
}

async function loadArticles() {
  try {
    nodes.articlesState.textContent = '加载中...';
    state.articles = await getArticles(state.filters);
    renderArticles();
    ensureIngestPolling();
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
    let loadingShown = false;
    const loadingTimer = setTimeout(() => {
      loadingShown = true;
      document.body.classList.add('reading-mode');
      renderReaderLoading({
        readerView: nodes.readerView,
        readerTitle: nodes.readerTitle,
        readerMeta: nodes.readerMeta,
        readerContent: nodes.readerContent,
        listPanels: [nodes.todayTab, nodes.notesTab],
        originSnippet: nodes.originSnippet,
        originSnippetText: nodes.originSnippetText
      });
    }, 180);
    const [detail, progress] = await Promise.all([getArticleById(id), getReadingProgress(id)]);
    clearTimeout(loadingTimer);
    state.currentArticle = detail;
    if (!loadingShown) {
      document.body.classList.add('reading-mode');
    }
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
    document.body.classList.remove('reading-mode');
    document.body.classList.remove('reader-bar-hidden');
    closeReader({
      readerView: nodes.readerView,
      listPanels: [nodes.todayTab, nodes.notesTab],
      readerContent: nodes.readerContent,
      originSnippet: nodes.originSnippet,
      originSnippetText: nodes.originSnippetText
    });
  }
}

function switchTab(nextTab) {
  state.tab = nextTab;
  nodes.tabButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === nextTab);
  });
  if (nodes.adminConsole) {
    nodes.adminConsole.classList.add('hidden');
  }
  document.body.classList.remove('admin-mode');
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
  if (nodes.ingestToggle) {
    nodes.ingestToggle.classList.toggle('hidden', nextTab !== 'today');
  }
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

  nodes.backBtn.addEventListener('click', async () => {
    await persistReadingProgressNow();
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
    if (state.tab === 'today') {
      loadArticles();
    }
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

  nodes.ingestToggle?.addEventListener('click', () => {
    openIngestModal();
  });

  nodes.ingestCloseBtn?.addEventListener('click', () => {
    closeIngestModal();
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

  const handleIngestSubmit = async () => {
    const url = String(nodes.ingestInput?.value || '').trim();
    if (!url) {
      showToast('请粘贴文章链接', 2000);
      return;
    }
    setIngestSubmitting(true);
    try {
      const result = await ingestUrl(url);
      if (result?.success) {
        showToast('已加入翻译队列，稍后可阅读', 2000);
        closeIngestModal();
        await loadArticles();
        pollIngestTranslation();
      } else {
        showToast(result?.message || '文章已存在', 2000);
      }
    } catch (err) {
      const message = String(err.message || '');
      if (message.includes('上限')) {
        showToast('今日投喂次数已达上限（5篇）', 2000);
      } else if (message.includes('存在')) {
        showToast('文章已存在', 2000);
      } else {
        showToast('添加失败，请检查链接是否有效', 2000);
      }
    } finally {
      setIngestSubmitting(false);
    }
  };

  nodes.ingestSubmitBtn?.addEventListener('touchend', (event) => {
    event.preventDefault();
    handleIngestSubmit();
  });
  nodes.ingestSubmitBtn?.addEventListener('click', () => {
    handleIngestSubmit();
  });

  nodes.adminConsoleEntry?.addEventListener('click', () => {
    openAdminConsole();
  });

  nodes.adminBackBtn?.addEventListener('click', () => {
    closeAdminConsole();
  });

  nodes.adminInviteAdd?.addEventListener('click', async () => {
    await handleInviteAdd();
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
        persistReadingProgressNow();
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
        if (state.tab === 'today') {
          loadArticles();
        }
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

async function openAdminConsole() {
  if (getUserId() !== 'admin') {
    showToast('仅管理员可访问', 2000);
    switchTab('today');
    return;
  }
  if (!nodes.adminConsole) return;
  document.body.classList.add('admin-mode');
  nodes.todayTab.classList.add('hidden');
  nodes.notesTab.classList.add('hidden');
  nodes.adminConsole.classList.remove('hidden');
  await Promise.all([loadAdminFeedback(), loadAdminStats(), loadInviteCodes()]);
}

function closeAdminConsole() {
  document.body.classList.remove('admin-mode');
  if (nodes.adminConsole) {
    nodes.adminConsole.classList.add('hidden');
  }
  switchTab('notes');
}

async function loadAdminFeedback() {
  if (!nodes.adminFeedbackList) return;
  nodes.adminFeedbackList.innerHTML = '';
  try {
    const items = await getFeedback();
    if (!items.length) {
      nodes.adminFeedbackList.innerHTML = '<div class="state-text">暂无反馈</div>';
      return;
    }
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'admin-item';
      div.innerHTML = `
        <div class="admin-item-meta">
          <span>${escapeHtml(item.user_id || 'unknown')}</span>
          <span>${escapeHtml(formatAdminTime(item.created_at))}</span>
        </div>
        <div>${escapeHtml(item.content || '')}</div>
      `;
      nodes.adminFeedbackList.appendChild(div);
    });
  } catch (_) {
    nodes.adminFeedbackList.innerHTML = '<div class="state-text">加载失败</div>';
  }
}

async function loadAdminStats() {
  if (!nodes.adminStatsList) return;
  nodes.adminStatsList.innerHTML = '';
  try {
    const data = await getAdminStats();
    nodes.adminStatsList.appendChild(
      renderStatBlock('今日概览', [
        { label: '今日活跃用户数', value: String(data.today_active_users ?? 0) },
        { label: '今日文章打开次数', value: String(data.today_open_articles ?? 0) }
      ])
    );
    nodes.adminStatsList.appendChild(
      renderStatBlock(
        '本周阅读排行（按用户）',
        (data.weekly_user_finishes || []).map((item) => ({
          label: item.user_id || 'unknown',
          value: `${item.count || 0} 篇`
        }))
      )
    );
    nodes.adminStatsList.appendChild(
      renderStatBlock(
        '文章完成率排行',
        (data.article_completion || []).map((item) => ({
          label: item.title || '未命名文章',
          value: `${item.rate || 0}%`
        }))
      )
    );
    nodes.adminStatsList.appendChild(
      renderStatBlock(
        '核心功能使用（划线）',
        (data.highlights_by_user || []).map((item) => ({
          label: item.user_id || 'unknown',
          value: `${item.count || 0} 次`
        }))
      )
    );
    nodes.adminStatsList.appendChild(
      renderStatBlock(
        '核心功能使用（提问）',
        (data.qa_by_user || []).map((item) => ({
          label: item.user_id || 'unknown',
          value: `${item.count || 0} 次`
        }))
      )
    );
  } catch (_) {
    nodes.adminStatsList.innerHTML = '<div class="state-text">加载失败</div>';
  }
}

async function loadInviteCodes() {
  if (!nodes.adminInviteList) return;
  nodes.adminInviteList.innerHTML = '';
  try {
    const items = await getInviteCodes();
    if (!items.length) {
      nodes.adminInviteList.innerHTML = '<div class="state-text">暂无邀请码</div>';
      return;
    }
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'admin-item';
      div.innerHTML = `
        <div class="admin-item-meta">
          <span>${escapeHtml(item.code || '')}</span>
          <span>${escapeHtml(item.user_id || '')}</span>
        </div>
        <div>${escapeHtml(formatAdminTime(item.created_at))}</div>
      `;
      nodes.adminInviteList.appendChild(div);
    });
  } catch (_) {
    nodes.adminInviteList.innerHTML = '<div class="state-text">加载失败</div>';
  }
}

async function handleInviteAdd() {
  const code = String(nodes.adminInviteCode?.value || '').trim();
  const userId = String(nodes.adminInviteUserId?.value || '').trim();
  if (!code || !userId) {
    showToast('请填写邀请码和用户ID', 2000);
    return;
  }
  try {
    await addInviteCode(code, userId);
    if (nodes.adminInviteCode) nodes.adminInviteCode.value = '';
    if (nodes.adminInviteUserId) nodes.adminInviteUserId.value = '';
    showToast('邀请码已添加，立即生效', 2000);
    await loadInviteCodes();
  } catch (err) {
    if (String(err.message || '').includes('conflict')) {
      showToast('邀请码或用户ID已存在', 2000);
    } else {
      showToast('添加失败，请重试', 2000);
    }
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

function openIngestModal() {
  nodes.ingestModal?.classList.remove('hidden');
  if (nodes.ingestInput) {
    nodes.ingestInput.value = '';
    nodes.ingestInput.focus();
  }
  setIngestSubmitting(false);
}

function closeIngestModal() {
  nodes.ingestModal?.classList.add('hidden');
}

function setIngestSubmitting(isSubmitting) {
  if (!nodes.ingestSubmitBtn) return;
  nodes.ingestSubmitBtn.disabled = isSubmitting;
  nodes.ingestSubmitBtn.textContent = isSubmitting ? '处理中...' : '添加';
}

function ensureIngestPolling() {
  const hasTranslating = state.articles.some((item) => item.status === 'translating');
  if (hasTranslating && !state.ingestTimer) {
    state.ingestTimer = setInterval(() => {
      pollIngestTranslation();
    }, 30000);
    pollIngestTranslation();
  }
  if (!hasTranslating && state.ingestTimer) {
    clearInterval(state.ingestTimer);
    state.ingestTimer = null;
  }
}

async function pollIngestTranslation() {
  if (state.ingestBusy) return;
  const translating = state.articles.filter((item) => item.status === 'translating');
  if (!translating.length) return;
  state.ingestBusy = true;
  try {
    for (const item of translating) {
      await translateIngestStep(item.id);
    }
  } catch (_) {
    // silent
  } finally {
    state.ingestBusy = false;
  }
  await loadArticles();
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
