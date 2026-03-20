import { getArticles, getArticleById, getReadingProgress, saveReadingProgress, isLoggedIn, registerUser, logout, postFeedback, getFeedback, getAdminStats, getInviteCodes, addInviteCode, getHiddenArticles, updateAdminArticleStatus, ingestUrl, translateIngestStep, trackEvent, migrateLegacyUser, getCurrentUser, updateUserProfile, getStoredUid, getStoredInviteCode, getStoredUserId, clearLegacyAuth } from './api.js';
import { closeOriginSnippetPanel, closeReader, openOriginSnippetPanel, renderReader, renderReaderLoading, scrollToPlainPosition, getReadingBaseLength } from './reader.js';

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
  ingestBusy: false,
  currentUser: null,
  articleDetailCache: new Map(),
  listScrollTop: {
    today: 0,
    notes: 0
  }
};

const ARTICLE_LIST_CACHE_KEY = 'rw:article-list-cache:v1';
const ARTICLE_DETAIL_CACHE_PREFIX = 'rw:article-detail:v1:';
const MAX_DETAIL_CACHE_ITEMS = 30;
const SPLASH_FALLBACK_MS = 5000;
const SW_REGISTER_DELAY_MS = 1200;
let splashFallbackTimer = null;
let swRegisterTimer = null;
let readerFeaturesReady = false;
let readerFeaturesInitPromise = null;
let openArticleNotesHandler = null;

function setReadingMode(enabled) {
  document.body.classList.toggle('reading-mode', enabled);
  document.documentElement.classList.toggle('reading-mode', enabled);
}

function isReadingMode() {
  return document.body.classList.contains('reading-mode');
}

const nodes = {
  tabButtons: [...document.querySelectorAll('.tab-btn')],
  splashScreen: document.querySelector('#splashScreen'),
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
  readerThemeBtn: document.querySelector('#readerThemeBtn'),
  articleNotesPanel: document.querySelector('#articleNotesPanel'),
  articleNotesBody: document.querySelector('#articleNotesBody'),
  closeArticleNotes: document.querySelector('#closeArticleNotes'),
  inviteCodeDisplay: document.querySelector('#inviteCodeDisplay'),
  nicknameDisplay: document.querySelector('#nicknameDisplay'),
  nicknameHintRow: document.querySelector('#nicknameHintRow'),
  nicknameHintBtn: document.querySelector('#nicknameHintBtn'),
  exportEntry: document.querySelector('#exportEntry'),
  feedbackEntry: document.querySelector('#feedbackEntry'),
  adminSection: document.querySelector('#adminSection'),
  adminConsoleEntry: document.querySelector('#adminConsoleEntry'),
  adminConsole: document.querySelector('#adminConsole'),
  adminBlocks: [...document.querySelectorAll('#adminConsole .admin-block')],
  adminBackBtn: document.querySelector('#adminBackBtn'),
  adminFeedbackList: document.querySelector('#adminFeedbackList'),
  adminStatsList: document.querySelector('#adminStatsList'),
  adminInviteList: document.querySelector('#adminInviteList'),
  adminInviteCode: document.querySelector('#adminInviteCode'),
  adminInviteUserId: document.querySelector('#adminInviteUserId'),
  adminInviteAdd: document.querySelector('#adminInviteAdd'),
  adminHiddenList: document.querySelector('#adminHiddenList'),
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
  nicknameInput: document.querySelector('#nicknameInput'),
  loginInput: document.querySelector('#loginInput'),
  loginButton: document.querySelector('#loginButton'),
  loginError: document.querySelector('#loginError'),
  logoutBtn: document.querySelector('#logoutBtn'),
  hideArticleBtn: document.querySelector('#hideArticleBtn'),
  hideArticleModal: document.querySelector('#hideArticleModal'),
  hideArticleReasonInput: document.querySelector('#hideArticleReasonInput'),
  hideArticleSubmitBtn: document.querySelector('#hideArticleSubmitBtn'),
  hideArticleCloseBtn: document.querySelector('#hideArticleCloseBtn'),
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

function hideSplashScreen() {
  if (!nodes.splashScreen) return;
  nodes.splashScreen.classList.add('is-hidden');
  if (splashFallbackTimer) {
    clearTimeout(splashFallbackTimer);
    splashFallbackTimer = null;
  }
}

function scheduleServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator) || swRegisterTimer) return;
  swRegisterTimer = setTimeout(() => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] register failed', err.message);
    });
    swRegisterTimer = null;
  }, SW_REGISTER_DELAY_MS);
}

async function ensureReaderFeaturesInitialized() {
  if (readerFeaturesReady) return;
  if (readerFeaturesInitPromise) {
    await readerFeaturesInitPromise;
    return;
  }

  readerFeaturesInitPromise = (async () => {
    const [{ initHighlightFeature }, { initArticleNotesPanel }] = await Promise.all([
      import('./highlight.js'),
      import('./notes.js')
    ]);

    openArticleNotesHandler = initArticleNotesPanel({
      panel: nodes.articleNotesPanel,
      body: nodes.articleNotesBody,
      closeBtn: nodes.closeArticleNotes,
      getCurrentArticle: () => state.currentArticle,
      showToast,
      scrollToPosition: scrollToPlainPosition
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

    readerFeaturesReady = true;
  })();

  try {
    await readerFeaturesInitPromise;
  } finally {
    readerFeaturesInitPromise = null;
  }
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

function cycleTheme() {
  const current = normalizeThemeValue(localStorage.getItem('theme'));
  const order = ['light', 'eye', 'dark'];
  const next = order[(order.indexOf(current) + 1) % order.length] || 'light';
  setThemeChoice(next);
  const label = next === 'eye' ? '鎶ょ溂' : next === 'dark' ? '娣辫壊' : '鏍囧噯';
  showToast(`宸插垏鎹负${label}`);
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
  if (!isoString) return '鏈煡鏃堕棿';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '鏈煡鏃堕棿';
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
function sourceName(sourceKey, author) {
  if (sourceKey === 'manual') return author || '未知作者';
  if (sourceKey === 'sam') return 'Sam Altman';
  if (sourceKey === 'andrej') return 'Andrej Karpathy';
  if (sourceKey === 'peter') return 'Peter Steipete';
  if (sourceKey === 'naval') return 'Naval Ravikant';
  return sourceKey || '鏈煡鏉ユ簮';
}
function readStatusLabel(status, progress) {
  if (status === 'archived') return '瀛樻。';
  if (status === 'read') return `宸茶 ${progress}%`;
  if (progress > 0) return `宸茶 ${progress}%`;
  return '鏈';
}
function getActiveReaderScroller() {
  if (isReadingMode() && nodes.readerView) {
    return nodes.readerView;
  }
  return window;
}

function currentScrollTop(scroller = window) {
  if (scroller && scroller !== window) {
    return Math.max(0, scroller.scrollTop || 0);
  }
  return Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop, 0);
}

function maxScrollableDistance(scroller = window) {
  if (scroller && scroller !== window) {
    return Math.max((scroller.scrollHeight || 0) - (scroller.clientHeight || 0), 1);
  }
  return Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
}

function calcScrollPositionByBaseLength(baseLength, scroller = window) {
  if (!baseLength || baseLength <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, currentScrollTop(scroller) / maxScrollableDistance(scroller)));
  return Math.round(baseLength * ratio);
}

function captureListScroll() {
  const tab = state.tab || 'today';
  state.listScrollTop[tab] = currentScrollTop();
}

function restoreListScroll() {
  const tab = state.tab || 'today';
  const target = Number(state.listScrollTop[tab] || 0);
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
      requestAnimationFrame(() => resolve());
    });
  });
}

function buildListCacheKey() {
  return JSON.stringify({
    identity: getAuthIdentity(),
    filters: state.filters || {}
  });
}

function readListCache() {
  try {
    const raw = sessionStorage.getItem(ARTICLE_LIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.key !== buildListCacheKey()) return null;
    if (!Array.isArray(parsed.articles)) return null;
    return parsed.articles;
  } catch (_) {
    return null;
  }
}

function writeListCache(articles) {
  try {
    sessionStorage.setItem(ARTICLE_LIST_CACHE_KEY, JSON.stringify({
      key: buildListCacheKey(),
      articles: Array.isArray(articles) ? articles : [],
      savedAt: Date.now()
    }));
  } catch (_) {}
}

function readDetailCache(articleId) {
  if (!articleId) return null;
  if (state.articleDetailCache.has(articleId)) {
    return state.articleDetailCache.get(articleId) || null;
  }
  try {
    const raw = sessionStorage.getItem(`${ARTICLE_DETAIL_CACHE_PREFIX}${articleId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.id) return null;
    state.articleDetailCache.set(articleId, parsed);
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeDetailCache(detail) {
  const articleId = detail?.id;
  if (!articleId) return;
  state.articleDetailCache.set(articleId, detail);
  if (state.articleDetailCache.size > MAX_DETAIL_CACHE_ITEMS) {
    const oldestKey = state.articleDetailCache.keys().next().value;
    if (oldestKey) state.articleDetailCache.delete(oldestKey);
  }
  try {
    sessionStorage.setItem(`${ARTICLE_DETAIL_CACHE_PREFIX}${articleId}`, JSON.stringify(detail));
  } catch (_) {}
}

function setReaderAdminActionsVisible(show) {
  if (!nodes.hideArticleBtn) return;
  nodes.hideArticleBtn.classList.toggle('hidden', !show);
}

async function persistReadingProgressNow() {
  const detail = state.currentArticle;
  if (!detail?.id) return;
  const baseLength = getReadingBaseLength(detail, nodes.readerContent);
  if (!baseLength) return;
  const scrollPosition = calcScrollPositionByBaseLength(baseLength, getActiveReaderScroller());
  try {
    await saveReadingProgress(detail.id, scrollPosition);
  } catch (err) {
    console.warn('[reading-progress] save failed', err.message);
  }
}

async function exitReaderView(shouldReload = false) {
  await persistReadingProgressNow();
  state.currentArticle = null;
  document.body.classList.add('restoring-list-scroll');
  setReadingMode(false);
  document.body.classList.remove('reader-bar-hidden');
  closeReader({
    readerView: nodes.readerView,
    listPanels: [nodes.todayTab, nodes.notesTab],
    readerContent: nodes.readerContent,
    originSnippet: nodes.originSnippet,
    originSnippetText: nodes.originSnippetText
  });
  setReaderAdminActionsVisible(false);
  closeHideArticleModal();
  nodes.todayTab.classList.toggle('hidden', state.tab !== 'today');
  nodes.notesTab.classList.toggle('hidden', state.tab !== 'notes');
  try {
    if (shouldReload && state.tab === 'today') {
      await loadArticles();
    }
    await restoreListScroll();
  } finally {
    document.body.classList.remove('restoring-list-scroll');
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
    nodes.articlesState.textContent = '鏆傛棤鏂囩珷';
    return;
  }

  nodes.articlesState.textContent = '';

  const ordered = state.articles
    .slice()
    .sort((a, b) => {
      const aTime = Date.parse(a.published_at || '') || 0;
      const bTime = Date.parse(b.published_at || '') || 0;
      return bTime - aTime;
    });

  ordered.forEach((item) => {
    const li = document.createElement('li');
    const progress = Math.max(0, Math.min(100, Number(item.read_progress || 0)));
    const progressLabel = Math.round(progress);
    const isTranslating = item.status === 'translating';
    const statusLabel = isTranslating ? '缈昏瘧涓?..' : readStatusLabel(item.read_status, progressLabel);
    const isOwner = item.submitted_by && item.submitted_by === getUserId();
    const showBadge = Boolean(isOwner);
    const badgeLabel = isTranslating ? '导入中' : '已导入';
    const isManual = Boolean(item.submitted_by || item.source_key === 'manual');
    const isManualTranslating = isManual && isTranslating;
    li.innerHTML = `
      <article class="article-card${isTranslating ? ' is-disabled' : ''}${isManualTranslating ? ' is-recommend' : ''}" data-id="${item.id}">
        <div class="article-card-head">
          <div class="article-card-title">
            <h3>${escapeHtml(item.title_zh || item.title_en || '未命名文章')}</h3>
          </div>
          <div class="article-card-status">
            ${showBadge ? `<span class="article-badge">${badgeLabel}</span>` : ''}
            <span class="${isTranslating ? 'article-status' : 'read-status'}">${escapeHtml(statusLabel)}</span>
          </div>
        </div>
        <div class="article-meta">${escapeHtml(sourceName(item.source_key, item.author))} 路 ${escapeHtml(formatDate(item.published_at))}</div>
        <p class="article-summary">${escapeHtml(item.summary_zh || item.summary_en || '鏆傛棤鎽樿')}</p>
      </article>
    `;

    const card = li.firstElementChild;
    if (!isTranslating) {
      card.addEventListener('click', () => openArticle(item.id));
    }

    nodes.articlesList.appendChild(li);
  });
}
async function loadArticles(options = {}) {
  const preferCache = options.preferCache !== false;
  const showLoading = options.showLoading !== false;
  const forceNetwork = options.forceNetwork === true;
  let renderedFromCache = false;
  try {
    if (preferCache) {
      const cached = readListCache();
      if (cached && cached.length) {
        state.articles = cached;
        renderArticles();
        renderedFromCache = true;
      }
    }
    if (!renderedFromCache && showLoading) {
      nodes.articlesState.textContent = '鍔犺浇涓?..';
    }
    if (!forceNetwork && renderedFromCache) {
      ensureIngestPolling();
    }
    state.articles = await getArticles(state.filters);
    writeListCache(state.articles);
    renderArticles();
    ensureIngestPolling();
  } catch (err) {
    if (!renderedFromCache) {
      nodes.articlesState.textContent = `鍔犺浇澶辫触锛?{err.message}`;
    }
    const message = String(err.message || '');
    const authFailed = message.includes('UID') || message.includes('unauthorized');
    if (authFailed) {
      showToast('登录态失效，请重新登录');
      logout();
      return;
    }
    if (!renderedFromCache) {
      showToast('鍔犺浇澶辫触锛岃绋嶅悗閲嶈瘯');
    }
  }
}
async function openArticle(id, jumpTo = null) {
  try {
    const readerFeaturesPromise = ensureReaderFeaturesInitialized();
    captureListScroll();
    if (!history.state || history.state.view !== 'reader' || history.state.articleId !== id) {
      history.pushState({ view: 'reader', articleId: id }, '', `?article=${id}`);
    }
    setReaderAdminActionsVisible(false);
    const cachedDetail = readDetailCache(id);
    const progressPromise = getReadingProgress(id);
    const detailPromise = getArticleById(id);

    if (cachedDetail) {
      const progress = await progressPromise;
      await readerFeaturesPromise;
      state.currentArticle = cachedDetail;
      setReadingMode(true);
      document.body.classList.add('reader-bar-hidden');
      setReaderAdminActionsVisible(isAdminUser());
      renderReader(cachedDetail, {
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
        const baseLength = getReadingBaseLength(cachedDetail, nodes.readerContent);
        scrollToPlainPosition(baseLength, jumpTo);
      }
      detailPromise
        .then((freshDetail) => {
          writeDetailCache(freshDetail);
        })
        .catch(() => {});
      return;
    }

    let loadingShown = false;
    const loadingTimer = setTimeout(() => {
      loadingShown = true;
      setReadingMode(true);
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
    const [detail, progress] = await Promise.all([detailPromise, progressPromise, readerFeaturesPromise.then(() => null)]);
    clearTimeout(loadingTimer);
    writeDetailCache(detail);
    state.currentArticle = detail;
    if (!loadingShown) {
      setReadingMode(true);
    }
    document.body.classList.add('reader-bar-hidden');
    setReaderAdminActionsVisible(isAdminUser());
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
      const baseLength = getReadingBaseLength(detail, nodes.readerContent);
      scrollToPlainPosition(baseLength, jumpTo);
    }
  } catch (err) {
    showToast(`鎵撳紑鏂囩珷澶辫触锛?{err.message}`);
    setReadingMode(false);
    document.body.classList.remove('reader-bar-hidden');
    setReaderAdminActionsVisible(false);
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
  setReadingMode(false);
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

  nodes.statusFilter?.addEventListener('change', () => {
    state.filters.status = nodes.statusFilter.value;
    loadArticles();
  });

  nodes.authorFilter?.addEventListener('change', () => {
    state.filters.author = nodes.authorFilter.value;
    loadArticles();
  });

  nodes.sortFilter?.addEventListener('change', () => {
    state.filters.sort = nodes.sortFilter.value || 'date_desc';
    loadArticles();
  });

  nodes.backBtn?.addEventListener('click', async () => {
    await exitReaderView(false);
  });

  nodes.closeOriginSnippet?.addEventListener('click', () => {
    closeOriginSnippetPanel({
      originSnippet: nodes.originSnippet,
      originSnippetText: nodes.originSnippetText
    });
  });

  nodes.themeChoices.forEach((btn) => {
    btn.addEventListener('click', () => {
      setThemeChoice(btn.dataset.theme || 'light');
    });
  });

  nodes.logoutBtn?.addEventListener('click', () => {
    const confirmed = window.confirm('确定退出登录吗？');
    if (!confirmed) return;
    logout();
  });

  nodes.exportEntry?.addEventListener('click', () => {
    showToast('鍔熻兘寮€鍙戜腑锛屾暚璇锋湡寰咃綖鐫€鎬ュ彲寰俊鑱旂郴 Guang', 2000);
  });

  nodes.feedbackEntry?.addEventListener('click', () => {
    openFeedbackModal();
  });

  nodes.nicknameHintBtn?.addEventListener('click', () => {
    promptForNickname();
  });

  nodes.ingestToggle?.addEventListener('click', () => {
    openIngestModal();
  });

  nodes.ingestCloseBtn?.addEventListener('click', () => {
    closeIngestModal();
  });

  nodes.hideArticleBtn?.addEventListener('click', () => {
    if (!isAdminUser()) return;
    openHideArticleModal();
  });

  nodes.hideArticleCloseBtn?.addEventListener('click', () => {
    closeHideArticleModal();
  });

  const handleHideArticleSubmit = async () => {
    if (!isAdminUser()) return;
    const detail = state.currentArticle;
    if (!detail?.id) {
      showToast('未找到文章', 2000);
      return;
    }
    const reason = String(nodes.hideArticleReasonInput?.value || '').trim();
    if (!reason) {
      showToast('请填写隐藏原因', 2000);
      return;
    }
    try {
      await updateAdminArticleStatus(detail.id, 'hidden', reason);
      closeHideArticleModal();
      showToast('已隐藏', 2000);
      await exitReaderView(true);
    } catch (err) {
      showToast(`隐藏失败：${err.message}`, 2000);
    }
  };

  nodes.hideArticleSubmitBtn?.addEventListener('touchend', (event) => {
    event.preventDefault();
    handleHideArticleSubmit();
  });
  nodes.hideArticleSubmitBtn?.addEventListener('click', () => {
    handleHideArticleSubmit();
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
      showToast('发送成功，感谢反馈', 2000);
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
      if (message.includes('涓婇檺')) {
        showToast('今日投喂次数已达上限（3篇）', 2000);
      } else if (message.includes('瀛樺湪')) {
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

  nodes.readerContent?.addEventListener('click', () => {
    if (!isReadingMode()) return;
    const selectionText = window.getSelection()?.toString()?.trim();
    if (selectionText) return;
    document.body.classList.toggle('reader-bar-hidden');
  });

  if (!state.historyBound) {
    window.addEventListener('popstate', () => {
      if (document.body.classList.contains('admin-mode')) {
        closeAdminConsole({ fromPopstate: true });
        return;
      }
      if (isReadingMode()) {
        exitReaderView(false);
      }
    });
    state.historyBound = true;
  }
}
function getInviteCodeLabel() {
  const inviteCode = String(state.currentUser?.inviteCode || '').trim() || getStoredInviteCode() || '-';
  return `\u9080\u8bf7\u7801\uff1a${inviteCode}`;
}

function getUserId() {
  if (state.currentUser?.userId) return state.currentUser.userId;
  return getStoredUserId();
}

function getUid() {
  if (state.currentUser?.uid) return state.currentUser.uid;
  return getStoredUid();
}

function getAuthIdentity() {
  return getUid() || getUserId() || getStoredInviteCode() || '';
}

function getNicknameLabel() {
  const nickname = String(state.currentUser?.nickname || '').trim();
  return `\u6635\u79f0\uff1a${nickname || '-'}`;
}

function isAdminUser() {
  return getUserId() === 'admin';
}

function refreshMeTab() {
  if (nodes.inviteCodeDisplay) {
    nodes.inviteCodeDisplay.textContent = getInviteCodeLabel();
  }
  if (nodes.nicknameDisplay) {
    nodes.nicknameDisplay.textContent = getNicknameLabel();
  }
  if (nodes.nicknameHintRow) {
    const shouldShow = !String(state.currentUser?.nickname || '').trim();
    nodes.nicknameHintRow.classList.toggle('hidden', !shouldShow);
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

function setAdminBlockCollapsed(block, collapsed) {
  if (!block) return;
  block.classList.toggle('is-collapsed', collapsed);
  const heading = block.querySelector('h3');
  if (!heading) return;
  heading.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function resetAdminBlocksCollapsed() {
  nodes.adminBlocks.forEach((block) => {
    setAdminBlockCollapsed(block, true);
  });
}

function bindAdminBlockAccordion() {
  nodes.adminBlocks.forEach((block) => {
    const heading = block.querySelector('h3');
    if (!heading) return;
    heading.setAttribute('role', 'button');
    heading.setAttribute('tabindex', '0');
    const toggle = () => {
      const collapsed = block.classList.contains('is-collapsed');
      setAdminBlockCollapsed(block, !collapsed);
    };
    heading.addEventListener('click', toggle);
    heading.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle();
    });
  });
}

async function openAdminConsole() {
  if (getUserId() !== 'admin') {
    showToast('仅管理员可访问', 2000);
    switchTab('today');
    return;
  }
  if (!nodes.adminConsole) return;
  if (!history.state || history.state.view !== 'admin') {
    history.pushState({ view: 'admin' }, '', '?view=admin');
  }
  document.body.classList.add('admin-mode');
  nodes.todayTab.classList.add('hidden');
  nodes.notesTab.classList.add('hidden');
  resetAdminBlocksCollapsed();
  nodes.adminConsole.classList.remove('hidden');
  await Promise.all([loadAdminFeedback(), loadAdminStats(), loadInviteCodes(), loadHiddenArticles()]);
}

function closeAdminConsole(options = {}) {
  const fromPopstate = Boolean(options.fromPopstate);
  document.body.classList.remove('admin-mode');
  if (nodes.adminConsole) {
    nodes.adminConsole.classList.add('hidden');
  }
  switchTab('notes');
  if (!fromPopstate && history.state?.view === 'admin') {
    history.back();
  }
}

async function loadAdminFeedback() {
  if (!nodes.adminFeedbackList) return;
  nodes.adminFeedbackList.innerHTML = '';
  try {
    const items = await getFeedback();
    if (!items.length) {
      nodes.adminFeedbackList.innerHTML = '<div class="state-text">鏆傛棤鍙嶉</div>';
      return;
    }
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'admin-item';
      div.innerHTML = `
        <div class="admin-item-meta">
          <span>${escapeHtml(item.user_id || '鏈煡鐢ㄦ埛')}</span>
          <span>${escapeHtml(formatAdminTime(item.created_at))}</span>
        </div>
        <div>${escapeHtml(item.content || '')}</div>
      `;
      nodes.adminFeedbackList.appendChild(div);
    });
  } catch (_) {
    nodes.adminFeedbackList.innerHTML = '<div class="state-text">鍔犺浇澶辫触</div>';
  }
}

async function loadAdminStats() {
  if (!nodes.adminStatsList) return;
  nodes.adminStatsList.innerHTML = '';
  try {
    const data = await getAdminStats();
    const activeUsers = Array.isArray(data.today_active_user_ids)
      ? data.today_active_user_ids.filter(Boolean)
      : [];
    nodes.adminStatsList.appendChild(
      renderStatBlock('今日概览', [
        { label: '今日活跃用户数', value: String(data.today_active_users ?? 0) },
        { label: '今日活跃用户', value: activeUsers.length ? activeUsers.join(', ') : '-' },
        { label: '今日文章打开次数', value: String(data.today_open_articles ?? 0) }
      ])
    );
    nodes.adminStatsList.appendChild(
      renderStatBlock(
        '本周阅读排行（按用户）',
        (data.weekly_user_finishes || []).map((item) => ({
          label: item.user_id || '未知用户',
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
          label: item.user_id || '未知用户',
          value: `${item.count || 0} 次`
        }))
      )
    );
    nodes.adminStatsList.appendChild(
      renderStatBlock(
        '核心功能使用（提问）',
        (data.qa_by_user || []).map((item) => ({
          label: item.user_id || '未知用户',
          value: `${item.count || 0} 次`
        }))
      )
    );
  } catch (err) {
    const message = err?.message ? `加载失败：${escapeHtml(err.message)}` : '加载失败';
    nodes.adminStatsList.innerHTML = `<div class="state-text">${message}</div>`;
  }
}

async function loadInviteCodes() {
  if (!nodes.adminInviteList) return;
  nodes.adminInviteList.innerHTML = '';
  try {
    const items = await getInviteCodes();
    if (!items.length) {
      nodes.adminInviteList.innerHTML = '<div class="state-text">鏆傛棤閭€璇风爜</div>';
      return;
    }
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'admin-item';
      const sourceLabel = item.source === 'self_register' ? '鑷姪娉ㄥ唽' : '鎵嬪姩鍒涘缓';
      const nickname = item.nickname ? `昵称：${item.nickname}` : '昵称：-';
      div.innerHTML = `
        <div class="admin-item-meta">
          <span>${escapeHtml(item.code || '')}</span>
          <span>${escapeHtml(item.user_id || '')}</span>
        </div>
        <div>${escapeHtml(sourceLabel)} | ${escapeHtml(nickname)}</div>
        <div>${escapeHtml(formatAdminTime(item.created_at))}</div>
      `;
      nodes.adminInviteList.appendChild(div);
    });
  } catch (_) {
    nodes.adminInviteList.innerHTML = '<div class="state-text">鍔犺浇澶辫触</div>';
  }
}
async function loadHiddenArticles() {
  if (!nodes.adminHiddenList) return;
  nodes.adminHiddenList.innerHTML = '';
  try {
    const items = await getHiddenArticles();
    if (!items.length) {
      nodes.adminHiddenList.innerHTML = '<div class="state-text">鏆傛棤闅愯棌鏂囩珷</div>';
      return;
    }
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'admin-item';
      div.innerHTML = `
        <div class="admin-item-meta">
          <span>${escapeHtml(item.title_zh || item.title_en || '未命名文章')}</span>
          <span>${escapeHtml(formatAdminTime(item.hidden_at))}</span>
        </div>
        <div>${escapeHtml(item.hidden_reason || '（无原因）')}</div>
        <div class="admin-item-actions">
          <button class="danger" type="button" data-id="${escapeHtml(item.id)}">鍙栨秷闅愯棌</button>
        </div>
      `;
      const btn = div.querySelector('button');
      btn?.addEventListener('click', async () => {
        try {
          await updateAdminArticleStatus(item.id, 'ready');
          showToast('已取消隐藏', 2000);
          await loadHiddenArticles();
        } catch (err) {
          showToast(`操作失败：${err.message}`, 2000);
        }
      });
      nodes.adminHiddenList.appendChild(div);
    });
  } catch (_) {
    nodes.adminHiddenList.innerHTML = '<div class="state-text">鍔犺浇澶辫触</div>';
  }
}

async function handleInviteAdd() {
  const code = String(nodes.adminInviteCode?.value || '').trim();
  const userId = String(nodes.adminInviteUserId?.value || '').trim();
  if (!code || !userId) {
    showToast('璇峰～鍐欓個璇风爜鍜岀敤鎴稩D', 2000);
    return;
  }
  try {
    await addInviteCode(code, userId);
    if (nodes.adminInviteCode) nodes.adminInviteCode.value = '';
    if (nodes.adminInviteUserId) nodes.adminInviteUserId.value = '';
    showToast('閭€璇风爜宸叉坊鍔狅紝绔嬪嵆鐢熸晥', 2000);
    await loadInviteCodes();
  } catch (err) {
    if (String(err.message || '').includes('conflict')) {
      showToast('code or userId exists', 2000);
    } else {
      showToast('娣诲姞澶辫触锛岃閲嶈瘯', 2000);
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

function openHideArticleModal() {
  if (!nodes.hideArticleModal) return;
  nodes.hideArticleModal.classList.remove('hidden');
  if (nodes.hideArticleReasonInput) {
    nodes.hideArticleReasonInput.value = '';
    nodes.hideArticleReasonInput.focus();
  }
}

function closeHideArticleModal() {
  nodes.hideArticleModal?.classList.add('hidden');
}

function setIngestSubmitting(isSubmitting) {
  if (!nodes.ingestSubmitBtn) return;
  nodes.ingestSubmitBtn.disabled = isSubmitting;
  nodes.ingestSubmitBtn.textContent = isSubmitting ? '澶勭悊涓?..' : '娣诲姞';
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
  if (!isoString) return '鏈煡鏃堕棿';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '鏈煡鏃堕棿';
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

async function loadCurrentUserProfile() {
  try {
    const user = await getCurrentUser();
    state.currentUser = user || null;
  } catch (_) {
    state.currentUser = null;
  }
}

async function promptForNickname() {
  const current = String(state.currentUser?.nickname || '').trim();
  const input = window.prompt('璁剧疆鏄电О锛?-20 瀛楋級', current);
  if (input == null) return;
  const nickname = String(input || '').trim();
  if (!nickname) {
    showToast('请输入昵称', 2000);
    return;
  }
  try {
    const updated = await updateUserProfile({ nickname });
    if (updated) {
      state.currentUser = {
        ...(state.currentUser || {}),
        nickname: updated.nickname || nickname
      };
      refreshMeTab();
      showToast('昵称已更新', 1500);
    }
  } catch (err) {
    showToast(err.message || '鏇存柊澶辫触', 2000);
  }
}

async function bootstrapAuth() {
  const uid = getStoredUid();
  if (uid) {
    await loadCurrentUserProfile();
    return true;
  }

  const legacyInviteCode = getStoredInviteCode();
  if (legacyInviteCode) {
    try {
      await migrateLegacyUser(legacyInviteCode);
      clearLegacyAuth();
      await loadCurrentUserProfile();
      return true;
    } catch (_) {
      clearLegacyAuth();
      return false;
    }
  }

  return false;
}

function bindLoginEvents() {
  if (!nodes.loginButton || !nodes.loginInput || !nodes.nicknameInput) return;

  const attemptRegister = async () => {
    const nickname = nodes.nicknameInput.value.trim();
    const inviteCode = nodes.loginInput.value.trim();
    if (!nickname) {
      showLoginOverlay('请输入昵称');
      return;
    }

    try {
      await registerUser(nickname, inviteCode);
      await loadCurrentUserProfile();
      hideLoginOverlay();
      await startApp();
    } catch (err) {
      const message = String(err.message || '娉ㄥ唽澶辫触');
      if (message.includes('invite') || message.toLowerCase().includes('invite')) {
        nodes.loginInput.value = '';
      }
      showLoginOverlay(message);
    }
  };

  nodes.loginButton.addEventListener('click', attemptRegister);
  nodes.nicknameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      attemptRegister();
    }
  });
  nodes.loginInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      attemptRegister();
    }
  });
}

async function startApp() {
  if (state.appStarted) return;
  state.appStarted = true;
  trackEvent('open_app');
  bindEvents();
  bindAdminBlockAccordion();
  nodes.articleNotesBtn.addEventListener('click', async () => {
    await ensureReaderFeaturesInitialized();
    if (openArticleNotesHandler) {
      openArticleNotesHandler();
    }
  });
  nodes.readerThemeBtn?.addEventListener('click', () => {
    cycleTheme();
  });
  switchTab('today');
  const loadPromise = loadArticles();
  requestAnimationFrame(() => {
    hideSplashScreen();
  });
  loadPromise.catch(() => {});
  scheduleServiceWorkerRegistration();
}

async function init() {
  splashFallbackTimer = setTimeout(() => {
    hideSplashScreen();
  }, SPLASH_FALLBACK_MS);

  initTheme();
  bindLoginEvents();

  const authed = await bootstrapAuth();
  if (authed) {
    hideLoginOverlay();
    await startApp();
    return;
  }

  if (isLoggedIn()) {
    hideLoginOverlay();
    await startApp();
  } else {
    hideSplashScreen();
    showLoginOverlay('请输入昵称（邀请码可选）');
  }
}

init();



