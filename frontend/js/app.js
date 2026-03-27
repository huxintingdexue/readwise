import { getArticles, getArticleById, getReadingProgress, saveReadingProgress, registerUser, logout, postFeedback, getFeedback, getAdminStats, getInviteCodes, addInviteCode, getHiddenArticles, getPendingArticles, updateAdminArticleStatus, updatePendingPublishStatus, ingestUrl, translateIngestStep, trackEvent, migrateLegacyUser, getCurrentUser, updateUserProfile, getStoredUid, getStoredInviteCode, getStoredUserId, clearLegacyAuth, createGuestSession } from './api.js';
import { closeOriginSnippetPanel, closeReader, openOriginSnippetPanel, renderReader, renderReaderLoading, scrollToPlainPosition, getReadingBaseLength } from './reader.js';
import { DEFAULT_AVATAR_URL, SOURCE_AVATAR_URLS } from './avatar-config.js';

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
  },
  briefHistoryOpen: false,
  readerExitInFlight: false
};

const ARTICLE_LIST_CACHE_KEY = 'rw:article-list-cache:v2';
const ARTICLE_DETAIL_CACHE_PREFIX = 'rw:article-detail:v1:';
const UI_STATE_STORAGE_KEY = 'rw:ui-state:v1';
const LAST_READER_STATE_KEY = 'rw:last-reader:v1';
const LAST_READER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FONT_PRESET_STORAGE_KEY = 'rw_font_preset';
const MAX_DETAIL_CACHE_ITEMS = 30;
const SPLASH_FALLBACK_MS = 5000;
const SW_REGISTER_DELAY_MS = 1200;
const DESKTOP_TIP_KEY = 'rw_desktop_tip_dismissed';
const INSTALL_CTA_DISMISS_KEY = 'rw_install_cta_dismiss_until';
const INSTALL_CTA_DISMISS_MS = 24 * 60 * 60 * 1000;
const ANDROID_APK_URL = 'https://gitee.com/byguang/apk-download/releases/download/v1.0.0/readwise.apk';
let splashFallbackTimer = null;
let swRegisterTimer = null;
let readerFeaturesReady = false;
let readerFeaturesInitPromise = null;
let openArticleNotesHandler = null;
const searchParams = new URLSearchParams(window.location.search);
const PERF_FLAGS = {
  noSelection: ['1', 'true', 'yes'].includes(String(searchParams.get('perf_no_selection') || '').toLowerCase()),
  noGlass: ['1', 'true', 'yes'].includes(String(searchParams.get('perf_no_glass') || '').toLowerCase()),
  noReaderContain: ['1', 'true', 'yes'].includes(String(searchParams.get('perf_no_reader_contain') || '').toLowerCase()),
  noReaderSticky: ['1', 'true', 'yes'].includes(String(searchParams.get('perf_no_reader_sticky') || '').toLowerCase()),
  noLayerPromote: ['1', 'true', 'yes'].includes(String(searchParams.get('perf_no_layer_promote') || '').toLowerCase()),
  overlay: ['1', 'true', 'yes'].includes(String(searchParams.get('perf_overlay') || '').toLowerCase())
};

function applyPerfFlags() {
  if (PERF_FLAGS.noGlass) {
    document.body.classList.add('perf-no-glass');
  }
  if (PERF_FLAGS.noReaderContain) {
    document.body.classList.add('perf-no-reader-contain');
  }
  if (PERF_FLAGS.noReaderSticky) {
    document.body.classList.add('perf-no-reader-sticky');
  }
  if (PERF_FLAGS.noLayerPromote) {
    document.body.classList.add('perf-no-layer-promote');
  }
  if (PERF_FLAGS.noSelection) {
    document.body.classList.add('no-custom-selection');
  }
}

function initPerfOverlay() {
  if (!PERF_FLAGS.overlay) return;

  const panel = document.createElement('div');
  panel.className = 'perf-overlay';
  panel.innerHTML = `
    <div class="perf-overlay-title">Perf Overlay</div>
    <div class="perf-overlay-grid">
      <span>FPS</span><strong data-k="fps">0</strong>
      <span>慢帧 &gt;16.7ms</span><strong data-k="slow">0</strong>
      <span>超长帧 &gt;50ms</span><strong data-k="jank">0</strong>
      <span>LongTask &gt;50ms</span><strong data-k="longtask">0</strong>
      <span>滚动活跃</span><strong data-k="scroll">否</strong>
    </div>
  `;
  document.body.appendChild(panel);

  const fpsEl = panel.querySelector('[data-k="fps"]');
  const slowEl = panel.querySelector('[data-k="slow"]');
  const jankEl = panel.querySelector('[data-k="jank"]');
  const longTaskEl = panel.querySelector('[data-k="longtask"]');
  const scrollEl = panel.querySelector('[data-k="scroll"]');

  let lastTs = performance.now();
  let frameCount = 0;
  let sumDelta = 0;
  let slowFrames = 0;
  let jankFrames = 0;
  let longTaskCount = 0;
  let lastScrollAt = 0;
  let lastUiUpdate = 0;

  const onScroll = () => {
    lastScrollAt = performance.now();
  };
  nodes.readerView?.addEventListener('scroll', onScroll, { passive: true });
  nodes.appShell?.addEventListener('scroll', onScroll, { passive: true });

  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (let i = 0; i < entries.length; i += 1) {
          if (entries[i].duration > 50) longTaskCount += 1;
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  }

  function tick(ts) {
    const delta = ts - lastTs;
    lastTs = ts;
    frameCount += 1;
    sumDelta += delta;
    if (delta > 16.7) slowFrames += 1;
    if (delta > 50) jankFrames += 1;

    if (ts - lastUiUpdate >= 500) {
      const avgDelta = frameCount > 0 ? (sumDelta / frameCount) : 16.7;
      const fps = Math.max(0, Math.min(60, Math.round(1000 / Math.max(1, avgDelta))));
      const scrolling = (performance.now() - lastScrollAt) < 140;

      if (fpsEl) fpsEl.textContent = String(fps);
      if (slowEl) slowEl.textContent = String(slowFrames);
      if (jankEl) jankEl.textContent = String(jankFrames);
      if (longTaskEl) longTaskEl.textContent = String(longTaskCount);
      if (scrollEl) scrollEl.textContent = scrolling ? '是' : '否';

      lastUiUpdate = ts;
      frameCount = 0;
      sumDelta = 0;
      slowFrames = 0;
      jankFrames = 0;
      longTaskCount = 0;
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function setReadingMode(enabled) {
  document.body.classList.toggle('reading-mode', enabled);
  document.documentElement.classList.toggle('reading-mode', enabled);
}

function isReadingMode() {
  return document.body.classList.contains('reading-mode');
}

const nodes = {
  appShell: document.querySelector('.app-shell'),
  tabButtons: [...document.querySelectorAll('.tab-btn')],
  splashScreen: document.querySelector('#splashScreen'),
  todayTab: document.querySelector('#tab-today'),
  notesTab: document.querySelector('#tab-notes'),
  statusFilter: document.querySelector('#statusFilter'),
  authorFilter: document.querySelector('#authorFilter'),
  sortFilter: document.querySelector('#sortFilter'),
  articlesState: document.querySelector('#articlesState'),
  articlesList: document.querySelector('#articlesList'),
  briefHistoryHeader: document.querySelector('#briefHistoryHeader'),
  briefHistoryBack: document.querySelector('#briefHistoryBack'),
  readerView: document.querySelector('#readerView'),
  readerTitle: document.querySelector('#readerTitle'),
  readerMeta: document.querySelector('#readerMeta'),
  readerContent: document.querySelector('#readerContent'),
  articleNotesBtn: document.querySelector('#articleNotesBtn'),
  shareArticleBtn: document.querySelector('#shareArticleBtn'),
  readerAppearanceBtn: document.querySelector('#readerAppearanceBtn'),
  articleNotesPanel: document.querySelector('#articleNotesPanel'),
  articleNotesBody: document.querySelector('#articleNotesBody'),
  closeArticleNotes: document.querySelector('#closeArticleNotes'),
  inviteCodeDisplay: document.querySelector('#inviteCodeDisplay'),
  nicknameDisplay: document.querySelector('#nicknameDisplay'),
  profileAvatarText: document.querySelector('#profileAvatarText'),
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
  adminPendingList: document.querySelector('#adminPendingList'),
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
  desktopTip: document.querySelector('#desktopTip'),
  desktopTipCopy: document.querySelector('#desktopTipCopy'),
  desktopTipClose: document.querySelector('#desktopTipClose'),
  homeInstallCta: document.querySelector('#homeInstallCta'),
  homeInstallClose: document.querySelector('#homeInstallClose'),
  homeInstallBtn: document.querySelector('#homeInstallBtn'),
  homeInstallSub: document.querySelector('#homeInstallSub'),
  homeInstallGuide: document.querySelector('#homeInstallGuide'),
  homeInstallGuideTitle: document.querySelector('#homeInstallGuideTitle'),
  homeInstallGuideText: document.querySelector('#homeInstallGuideText'),
  homeInstallGuideClose: document.querySelector('#homeInstallGuideClose'),
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
  appearanceModal: document.querySelector('#appearanceModal'),
  appearanceCloseBtn: document.querySelector('#appearanceCloseBtn'),
  meAppearanceEntry: document.querySelector('#meAppearanceEntry'),
  themeChoices: [...document.querySelectorAll('.theme-choice')],
  fontChoices: [...document.querySelectorAll('.font-choice')]
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

function isDesktopDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const isMobileUa = /iphone|ipad|ipod|android/i.test(ua);
  return !isMobileUa && window.innerWidth >= 960;
}

function getMobilePlatform() {
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'other';
}

function isWeChat() {
  return /micromessenger/i.test(navigator.userAgent || '');
}

function isAndroidWebViewShell() {
  const ua = String(navigator.userAgent || '').toLowerCase();
  if (!ua.includes('android')) return false;
  if (isWeChat()) return false;
  if (/\bwv\b/.test(ua)) return true;
  return false;
}

function isInstalledAppRuntime() {
  if (isStandalonePwa()) return true;
  if ((document.referrer || '').startsWith('android-app://')) return true;
  if (isAndroidWebViewShell()) return true;
  return false;
}

function showHomeInstallGuide(text, title = '') {
  if (!nodes.homeInstallGuide || !nodes.homeInstallGuideText) return;
  nodes.homeInstallGuideTitle.textContent = title;
  nodes.homeInstallGuideTitle.classList.toggle('hidden', !title);
  nodes.homeInstallGuideText.textContent = text;
  nodes.homeInstallGuide.classList.remove('hidden');
}

function getInstallCtaDismissUntil() {
  try {
    return Number(localStorage.getItem(INSTALL_CTA_DISMISS_KEY) || 0);
  } catch (_) {
    return 0;
  }
}

function isInstallCtaDismissed() {
  return getInstallCtaDismissUntil() > Date.now();
}

function dismissInstallCtaForOneDay() {
  try {
    localStorage.setItem(INSTALL_CTA_DISMISS_KEY, String(Date.now() + INSTALL_CTA_DISMISS_MS));
  } catch (_) {
    // ignore storage failures
  }
}

function initHomeInstallPrompt() {
  if (!nodes.homeInstallCta || !nodes.homeInstallBtn) return;
  if (isInstallCtaDismissed()) return;
  if (isInstalledAppRuntime()) return;
  if (isDesktopDevice()) return;

  const platform = getMobilePlatform();
  const inWechat = isWeChat();
  if (!inWechat && platform === 'other') return;

  nodes.homeInstallSub.textContent = '每天更新硅谷圈大佬最新动态和文章';
  if (inWechat) {
    nodes.homeInstallBtn.textContent = '安装APP';
  } else if (platform === 'android') {
    nodes.homeInstallBtn.textContent = '立即下载';
  } else if (platform === 'ios') {
    nodes.homeInstallBtn.textContent = '添加到主屏幕';
  }

  window.setTimeout(() => {
    nodes.homeInstallCta.classList.remove('hidden');
  }, 600);

  nodes.homeInstallBtn.addEventListener('click', () => {
    if (isWeChat()) {
      showHomeInstallGuide('点击右上角 ... ，选择用浏览器打开');
      return;
    }
    const currentPlatform = getMobilePlatform();
    if (currentPlatform === 'android') {
      if (ANDROID_APK_URL) {
        window.location.href = ANDROID_APK_URL;
      } else {
        showToast('下载链接暂不可用，请稍后重试');
      }
      return;
    }
    if (currentPlatform === 'ios') {
      showHomeInstallGuide('点击浏览器下方“分享”按钮，选择“添加到主屏幕”。', '添加到主屏幕');
      return;
    }
  });

  nodes.homeInstallClose?.addEventListener('click', () => {
    dismissInstallCtaForOneDay();
    nodes.homeInstallCta.classList.add('hidden');
  });

  nodes.homeInstallGuideClose?.addEventListener('click', () => {
    nodes.homeInstallGuide.classList.add('hidden');
  });

  nodes.homeInstallGuide?.addEventListener('click', (event) => {
    if (event.target === nodes.homeInstallGuide) {
      nodes.homeInstallGuide.classList.add('hidden');
    }
  });
}

function initDesktopTip() {
  if (!nodes.desktopTip || !nodes.desktopTipClose) return;
  if (!isDesktopDevice()) return;
  const dismissed = localStorage.getItem(DESKTOP_TIP_KEY);
  if (dismissed === '1') return;
  nodes.desktopTip.classList.remove('hidden');
  nodes.desktopTipClose.addEventListener('click', () => {
    localStorage.setItem(DESKTOP_TIP_KEY, '1');
    nodes.desktopTip.classList.add('hidden');
  });
  nodes.desktopTipCopy?.addEventListener('click', async () => {
    const copied = await copyTextWithFallback(window.location.origin);
    showToast('阅读链接已复制', 1800);
    localStorage.setItem(DESKTOP_TIP_KEY, '1');
    nodes.desktopTip.classList.add('hidden');
  });
}

function buildShareUrl(articleId) {
  if (!articleId) return '';
  const encoded = encodeURIComponent(articleId);
  return `${window.location.origin}/share/${encoded}`;
}

async function copyTextWithFallback(text) {
  const value = String(text || '');
  if (!value) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      // fallback below
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand && document.execCommand('copy');
    document.body.removeChild(textarea);
    return Boolean(copied);
  } catch (_) {
    return false;
  }
}

function hideSplashScreen() {
  if (!nodes.splashScreen) return;
  nodes.splashScreen.classList.add('is-hidden');
  if (splashFallbackTimer) {
    clearTimeout(splashFallbackTimer);
    splashFallbackTimer = null;
  }
}

function isStandalonePwa() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator?.standalone === true
  );
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
    const [highlightModule, notesModule] = await Promise.all([
      PERF_FLAGS.noSelection ? Promise.resolve(null) : import('./highlight.js'),
      import('./notes.js')
    ]);
    const { initArticleNotesPanel } = notesModule;

    openArticleNotesHandler = initArticleNotesPanel({
      panel: nodes.articleNotesPanel,
      body: nodes.articleNotesBody,
      closeBtn: nodes.closeArticleNotes,
      getCurrentArticle: () => state.currentArticle,
      showToast,
      scrollToPosition: scrollToPlainPosition
    });

    if (highlightModule?.initHighlightFeature) {
      document.body.classList.remove('no-custom-selection');
      highlightModule.initHighlightFeature({
        readerContent: nodes.readerContent,
        getCurrentArticle: () => state.currentArticle,
        showToast,
        openOriginSnippet: (text) =>
          openOriginSnippetPanel(
            { originSnippet: nodes.originSnippet, originSnippetText: nodes.originSnippetText },
            text
          )
      });
    } else {
      document.body.classList.add('no-custom-selection');
    }

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

function applyFontPreset(preset) {
  document.body.classList.remove('font-serif', 'font-sans', 'font-system');
  if (preset === 'sans') {
    document.body.classList.add('font-sans');
    return;
  }
  if (preset === 'system') {
    document.body.classList.add('font-system');
    return;
  }
  document.body.classList.add('font-serif');
}

function normalizeThemeValue(value) {
  if (value === 'day') return 'light';
  if (value === 'warm') return 'eye';
  if (value === 'dark' || value === 'light' || value === 'eye') return value;
  return 'light';
}

function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua);
}

function maybeShowA2hsHint() {
  const url = new URL(window.location.href);
  if (url.searchParams.get('a2hs') !== '1') return;
  url.searchParams.delete('a2hs');
  history.replaceState(null, '', url.toString());
  if (isIOS()) {
    showToast('请点击浏览器下方“分享”按钮，选择“添加到主屏幕”');
  }
}

function setThemeChoice(theme) {
  const normalized = normalizeThemeValue(theme);
  localStorage.setItem('theme', normalized);
  updateTheme(normalized);
  renderThemeChoices(normalized);
}

function normalizeFontPresetValue(value) {
  if (value === 'serif' || value === 'sans' || value === 'system') return value;
  return 'sans';
}

function setFontChoice(preset) {
  const normalized = normalizeFontPresetValue(preset);
  localStorage.setItem(FONT_PRESET_STORAGE_KEY, normalized);
  updateFontPreset(normalized);
  renderFontChoices(normalized);
}
function updateTheme(theme) {
  applyTheme(theme);
}

function updateFontPreset(preset) {
  applyFontPreset(preset);
}

function renderThemeChoices(active) {
  nodes.themeChoices.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.theme === active);
  });
}

function renderFontChoices(active) {
  nodes.fontChoices.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.font === active);
  });
}

function initTheme() {
  const saved = normalizeThemeValue(localStorage.getItem('theme'));
  updateTheme(saved);
  renderThemeChoices(saved);
}

function initFontPreset() {
  const saved = normalizeFontPresetValue(localStorage.getItem(FONT_PRESET_STORAGE_KEY));
  updateFontPreset(saved);
  renderFontChoices(saved);
}

function formatDate(isoString) {
  if (!isoString) return '未知时间';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '未知时间';
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function displayAuthorName(author) {
  const normalized = String(author || '').trim();
  if (normalized === 'AI小编') return 'AI编辑室';
  return normalized;
}

function sourceName(sourceKey, author) {
  if (sourceKey === 'manual') return displayAuthorName(author) || '未知作者';
  if (sourceKey === 'daily_brief') return '今日硅谷';
  if (sourceKey === 'sam') return 'Sam Altman';
  if (sourceKey === 'andrej') return 'Andrej Karpathy';
  if (sourceKey === 'peter') return 'Peter Steipete';
  if (sourceKey === 'naval') return 'Naval Ravikant';
  return sourceKey || '未知来源';
}

function topicLabel(sourceKey) {
  if (sourceKey === 'daily_brief') return '快讯';
  if (sourceKey === 'sam') return 'Sam';
  if (sourceKey === 'andrej') return 'Andrej';
  if (sourceKey === 'naval') return 'Naval';
  if (sourceKey === 'manual') return '读友导入';
  return '资讯';
}

function sourceFallbackAvatar(sourceKey) {
  return SOURCE_AVATAR_URLS[sourceKey] || DEFAULT_AVATAR_URL;
}

function resolveAuthorAvatarUrl(item) {
  const dbAvatar = String(item?.author_avatar_url || '').trim();
  return dbAvatar || sourceFallbackAvatar(item?.source_key);
}

function estimatedReadMinutes(item) {
  const apiEstimate = Number(item?.estimated_read_minutes || 0);
  if (Number.isFinite(apiEstimate) && apiEstimate > 0) {
    return Math.max(1, Math.round(apiEstimate));
  }
  const fallbackText = String(item?.summary_zh || item?.summary_en || '');
  return Math.max(1, Math.round(fallbackText.length / 90));
}

function progressMeta(item) {
  const isTranslating = item?.status === 'translating';
  if (isTranslating) {
    return { label: '翻译中...', className: 'is-translating' };
  }
  const progress = Math.max(0, Math.min(100, Number(item?.read_progress || 0)));
  if (progress > 0) {
    return { label: `${Math.round(progress)}%`, className: 'is-read' };
  }
  return { label: '未读', className: 'is-unread' };
}

function readStatusLabel(status, progress) {
  if (status === 'archived') return '存档';
  if (status === 'read') return `已读 ${progress}%`;
  if (progress > 0) return `已读 ${progress}%`;
  return '未读';
}

function getListScroller() {
  return nodes.appShell || window;
}

function getActiveReaderScroller() {
  if (isReadingMode() && nodes.readerView) {
    return nodes.readerView;
  }
  return getListScroller();
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

function readUiState() {
  try {
    const raw = localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const tab = parsed.tab === 'notes' ? 'notes' : 'today';
    const today = Math.max(0, Number(parsed?.listScrollTop?.today || 0));
    const notes = Math.max(0, Number(parsed?.listScrollTop?.notes || 0));
    return {
      tab,
      listScrollTop: { today, notes }
    };
  } catch (_) {
    return null;
  }
}

function writeUiState() {
  try {
    localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify({
      tab: state.tab === 'notes' ? 'notes' : 'today',
      listScrollTop: {
        today: Math.max(0, Number(state.listScrollTop?.today || 0)),
        notes: Math.max(0, Number(state.listScrollTop?.notes || 0))
      },
      savedAt: Date.now()
    }));
  } catch (_) {}
}

function readLastReaderState() {
  try {
    const raw = localStorage.getItem(LAST_READER_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const articleId = String(parsed?.articleId || '').trim();
    if (!articleId) return null;
    const savedAt = Number(parsed?.savedAt || 0);
    if (!Number.isFinite(savedAt) || savedAt <= 0) {
      clearLastReaderState();
      return null;
    }
    if ((Date.now() - savedAt) > LAST_READER_MAX_AGE_MS) {
      clearLastReaderState();
      return null;
    }
    return { articleId };
  } catch (_) {
    return null;
  }
}

function writeLastReaderState(articleId) {
  const id = String(articleId || '').trim();
  if (!id) return;
  try {
    localStorage.setItem(LAST_READER_STATE_KEY, JSON.stringify({
      articleId: id,
      savedAt: Date.now()
    }));
  } catch (_) {}
}

function clearLastReaderState() {
  try {
    localStorage.removeItem(LAST_READER_STATE_KEY);
  } catch (_) {}
}

function getCleanHomeUrl() {
  const baseUrl = new URL(window.location.href);
  baseUrl.searchParams.delete('article');
  if (baseUrl.searchParams.get('view') === 'admin') {
    baseUrl.searchParams.delete('view');
  }
  return `${baseUrl.pathname}${baseUrl.search}${baseUrl.hash}`;
}

function ensureHomeHistoryState() {
  const view = String(history.state?.view || '').trim();
  if (view === 'home' || view === 'admin' || view === 'brief_history') return;
  history.replaceState({ view: 'home' }, '', getCleanHomeUrl());
}

function pushHomeHistoryAnchor() {
  const view = String(history.state?.view || '').trim();
  if (view !== 'home') return;
  const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  history.pushState({ view: 'home_restore_anchor' }, '', url);
}

function ensureAutoRestoreHistoryStack() {
  const cleanUrl = getCleanHomeUrl();
  const currentView = String(history.state?.view || '').trim();

  if (currentView !== 'home') {
    history.replaceState({ view: 'home' }, '', cleanUrl);
  } else if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== cleanUrl) {
    history.replaceState({ view: 'home' }, '', cleanUrl);
  }

  pushHomeHistoryAnchor();
}

function pushReaderHistoryState(articleId, options = {}) {
  const id = String(articleId || '').trim();
  if (!id) return;
  const withBackGuard = options.withBackGuard === true;
  const readerUrl = `?article=${encodeURIComponent(id)}`;
  const currentView = String(history.state?.view || '').trim();
  const currentArticleId = String(history.state?.articleId || '').trim();

  if (currentView !== 'reader' || currentArticleId !== id) {
    history.pushState({ view: 'reader', articleId: id }, '', readerUrl);
  }
  if (withBackGuard) {
    history.pushState({ view: 'reader_back_guard', articleId: id }, '', readerUrl);
  }
}

function calcScrollPositionByBaseLength(baseLength, scroller = window) {
  if (!baseLength || baseLength <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, currentScrollTop(scroller) / maxScrollableDistance(scroller)));
  return Math.round(baseLength * ratio);
}

function captureListScroll() {
  const tab = state.tab || 'today';
  state.listScrollTop[tab] = currentScrollTop(getListScroller());
  writeUiState();
}

function restoreListScroll() {
  const tab = state.tab || 'today';
  const target = Number(state.listScrollTop[tab] || 0);
  const scroller = getListScroller();
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      if (scroller && scroller !== window) {
        scroller.scrollTop = Math.max(0, target);
      } else {
        window.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
      }
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
  const percent = Math.max(0, Math.min(100, Math.round((scrollPosition / baseLength) * 100)));
  try {
    await saveReadingProgress(detail.id, scrollPosition);
  } catch (err) {
    console.warn('[reading-progress] save failed', err.message);
  }
  return { articleId: detail.id, percent };
}

function updateListProgress(articleId, percent) {
  if (!articleId || !Array.isArray(state.articles) || state.articles.length === 0) return;
  let updated = false;
  const next = state.articles.map((item) => {
    if (item?.id !== articleId) return item;
    updated = true;
    const current = Math.max(0, Number(item?.read_progress || 0));
    const nextProgress = Math.max(current, Math.max(0, Math.min(100, Number(percent || 0))));
    return { ...item, read_progress: nextProgress };
  });
  if (updated) {
    state.articles = next;
    writeListCache(state.articles);
    renderArticles();
  }
}

async function exitReaderView(shouldReload = false) {
  if (state.readerExitInFlight) return;
  state.readerExitInFlight = true;
  let progressResult = null;
  try {
    progressResult = await persistReadingProgressNow();
    clearLastReaderState();
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
    if (state.tab === 'today' && progressResult?.articleId) {
      updateListProgress(progressResult.articleId, progressResult.percent);
    }
    if (shouldReload && state.tab === 'today') {
      await loadArticles();
    }
    await restoreListScroll();
    const view = String(history.state?.view || '').trim();
    if (view === 'reader' || view === 'reader_back_guard') {
      history.replaceState({ view: 'home' }, '', getCleanHomeUrl());
    }
  } finally {
    document.body.classList.remove('restoring-list-scroll');
    state.readerExitInFlight = false;
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

function buildArticleCard(item, showBriefHistoryEntry = false) {
  const li = document.createElement('li');
  const isTranslating = item.status === 'translating';
  const isOwner = item.submitted_by && item.submitted_by === getUserId();
  const showBadge = Boolean(isOwner);
  const badgeLabel = isTranslating ? '导入中' : '已导入';
  const isManual = Boolean(item.submitted_by || item.source_key === 'manual');
  const isManualTranslating = isManual && isTranslating;
  const progress = progressMeta(item);
  const readMinutes = estimatedReadMinutes(item);
  const avatarUrl = resolveAuthorAvatarUrl(item);
  const summaryText = String(item.summary_zh || item.summary_en || '暂无摘要');
  const summaryClass = summaryText.length > 66 ? 'article-summary summary-long' : 'article-summary';
  li.innerHTML = `
    <article class="article-card${isTranslating ? ' is-disabled' : ''}${isManualTranslating ? ' is-recommend' : ''} bg-white rounded-xl p-4 relative group active:scale-[0.99] transition-all duration-200 shadow-[0_1px_6px_rgba(0,0,0,0.02)]" data-id="${item.id}">
      <div class="article-card-top">
        <div class="article-author">
          <img class="article-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(sourceName(item.source_key, item.author))}"/>
          <div class="article-author-text">
            <span class="article-author-name">${escapeHtml(sourceName(item.source_key, item.author))}</span>
            <span class="article-reading-time">· ${readMinutes} min</span>
          </div>
        </div>
        <div class="article-card-status">
          ${showBadge ? `<span class="article-badge">${badgeLabel}</span>` : ''}
          <span class="article-progress ${progress.className}">${escapeHtml(progress.label)}</span>
        </div>
      </div>
      <div class="article-body">
        <h3 class="article-title">${escapeHtml(item.title_zh || item.title_en || '未命名文章')}</h3>
        <p class="${summaryClass}">${escapeHtml(summaryText)}</p>
      </div>
      <div class="article-bottom">
        <span class="article-topic">${escapeHtml(topicLabel(item.source_key))}</span>
        <span class="article-dot"></span>
        <span class="article-date">${escapeHtml(formatDate(item.published_at))}</span>
      </div>
      ${showBriefHistoryEntry ? '<div class="brief-history-card-entry"><button class="brief-history-btn">查看历史快讯</button></div>' : ''}
    </article>
  `;

  const card = li.firstElementChild;
  const avatarNode = li.querySelector('.article-avatar');
  if (avatarNode) {
    avatarNode.addEventListener('error', () => {
      if (avatarNode.src.endsWith(DEFAULT_AVATAR_URL)) return;
      avatarNode.src = DEFAULT_AVATAR_URL;
    }, { once: true });
  }
  if (showBriefHistoryEntry) {
    const btn = li.querySelector('.brief-history-btn');
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openBriefHistory();
    });
  }
  if (!isTranslating) {
    card.addEventListener('click', () => openArticle(item.id));
  }
  return li;
}

function openBriefHistory() {
  state.briefHistoryOpen = true;
  history.pushState({ view: 'brief_history' }, '', location.href);
  nodes.briefHistoryHeader?.classList.remove('hidden');
  renderArticles();
}

function closeBriefHistory() {
  state.briefHistoryOpen = false;
  nodes.briefHistoryHeader?.classList.add('hidden');
  renderArticles();
}

function renderArticles() {
  nodes.articlesList.innerHTML = '';

  if (state.briefHistoryOpen) {
    nodes.articlesState.textContent = '';
    const briefs = state.articles
      .filter((a) => a.source_key === 'daily_brief')
      .slice()
      .sort((a, b) => (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0));
    if (briefs.length === 0) {
      nodes.articlesState.textContent = '暂无历史快讯';
      return;
    }
    briefs.forEach((item) => nodes.articlesList.appendChild(buildArticleCard(item)));
    return;
  }

  if (state.articles.length === 0) {
    nodes.articlesState.textContent = '暂无文章';
    return;
  }

  nodes.articlesState.textContent = '';

  const briefs = state.articles
    .filter((a) => a.source_key === 'daily_brief')
    .slice()
    .sort((a, b) => (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0));

  const normal = state.articles
    .filter((a) => a.source_key !== 'daily_brief')
    .slice()
    .sort((a, b) => (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0));

  if (briefs.length > 0) {
    nodes.articlesList.appendChild(buildArticleCard(briefs[0], true));
  }

  normal.forEach((item) => nodes.articlesList.appendChild(buildArticleCard(item)));
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
      nodes.articlesState.textContent = '加载中...';
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
      nodes.articlesState.textContent = `加载失败：${err.message}`;
    }
    const message = String(err.message || '');
    const authFailed = message.includes('UID') || message.includes('unauthorized') || message.includes('缺少身份凭证');
    if (authFailed) {
      showToast('会话已失效，正在恢复');
      state.appStarted = false;
      const ok = await bootstrapAuth();
      if (ok) {
        await startApp();
      } else {
        showLoginOverlay('登录失败，请稍后重试');
      }
      return;
    }
    if (!renderedFromCache) {
      showToast('加载失败，请稍后重试');
    }
  }
}
async function openArticle(id, jumpTo = null, options = {}) {
  try {
    const readerFeaturesPromise = ensureReaderFeaturesInitialized();
    if (options.preserveSavedListScroll !== true) {
      captureListScroll();
    }
    pushReaderHistoryState(id, options);
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
      writeLastReaderState(cachedDetail.id);
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
    writeLastReaderState(detail.id);
  } catch (err) {
    clearLastReaderState();
    showToast(`打开文章失败：${err.message}`);
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

function switchTab(nextTab, options = {}) {
  if (options.captureScroll !== false) {
    captureListScroll();
  }
  state.tab = nextTab;
  writeUiState();
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
  let listScrollRaf = null;
  nodes.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  nodes.appShell?.addEventListener('scroll', () => {
    if (isReadingMode() || document.body.classList.contains('admin-mode')) return;
    if (listScrollRaf) return;
    listScrollRaf = requestAnimationFrame(() => {
      listScrollRaf = null;
      const tab = state.tab || 'today';
      state.listScrollTop[tab] = currentScrollTop(getListScroller());
      writeUiState();
    });
  }, { passive: true });

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
    const view = String(history.state?.view || '').trim();
    if (view === 'reader' || view === 'reader_back_guard') {
      history.back();
      return;
    }
    await exitReaderView(false);
  });

  nodes.briefHistoryBack?.addEventListener('click', () => {
    history.back();
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

  nodes.fontChoices.forEach((btn) => {
    btn.addEventListener('click', () => {
      setFontChoice(btn.dataset.font || 'serif');
    });
  });

  nodes.logoutBtn?.addEventListener('click', () => {
    if (isGuestUser()) {
      showLoginOverlay();
      return;
    }
    const confirmed = window.confirm('确定退出登录吗？');
    if (!confirmed) return;
    logout();
  });

  nodes.exportEntry?.addEventListener('click', () => {
    showToast('功能开发中，敬请期待。着急可微信联系 Guang', 2000);
  });

  nodes.feedbackEntry?.addEventListener('click', () => {
    openFeedbackModal();
  });

  nodes.meAppearanceEntry?.addEventListener('click', () => {
    openAppearanceModal();
  });

  nodes.appearanceCloseBtn?.addEventListener('click', () => {
    closeAppearanceModal();
  });

  nodes.appearanceModal?.addEventListener('click', (event) => {
    if (event.target === nodes.appearanceModal) {
      closeAppearanceModal();
    }
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

  nodes.shareArticleBtn?.addEventListener('click', async () => {
    const detail = state.currentArticle;
    if (!detail?.id) {
      showToast('未找到文章', 1800);
      return;
    }

    const shareUrl = buildShareUrl(detail.id);
    const shareTitle = detail.title_zh || detail.title_en || '推荐阅读';
    const shareText = detail.summary_zh || detail.summary_en || '来自 ReadWise 的精选内容';

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
        return;
      } catch (err) {
        if (String(err?.name || '') === 'AbortError') {
          return;
        }
      }
    }

    const copied = await copyTextWithFallback(shareUrl);
    if (copied) {
      showToast('分享链接已复制', 1800);
      return;
    }
    showToast('分享链接已复制', 1800);
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
      if (state.readerExitInFlight) return;
      if (document.body.classList.contains('admin-mode')) {
        closeAdminConsole({ fromPopstate: true });
        return;
      }
      if (isReadingMode()) {
        exitReaderView(false);
        return;
      }
      if (state.briefHistoryOpen) {
        closeBriefHistory();
      }
    });
    state.historyBound = true;
  }
}
function getInviteCodeLabel() {
  return String(state.currentUser?.inviteCode || '').trim() || getStoredInviteCode() || '-';
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
  return nickname || '-';
}

function getAvatarDisplayText() {
  const nickname = String(state.currentUser?.nickname || '').trim();
  if (nickname) return nickname.slice(0, 1).toUpperCase();
  const invite = getInviteCodeLabel();
  if (invite && invite !== '-') return invite.slice(0, 1).toUpperCase();
  return '-';
}

function isAdminUser() {
  return getUserId() === 'admin';
}

function isGuestUser() {
  return state.currentUser?.source === 'guest_auto';
}

function refreshMeTab() {
  if (nodes.inviteCodeDisplay) {
    nodes.inviteCodeDisplay.textContent = getInviteCodeLabel();
  }
  if (nodes.nicknameDisplay) {
    nodes.nicknameDisplay.textContent = getNicknameLabel();
  }
  if (nodes.profileAvatarText) {
    nodes.profileAvatarText.textContent = getAvatarDisplayText();
  }
  if (nodes.nicknameHintRow) {
    const shouldShow = !isGuestUser() && !String(state.currentUser?.nickname || '').trim();
    nodes.nicknameHintRow.classList.toggle('hidden', !shouldShow);
  }
  if (nodes.logoutBtn) {
    nodes.logoutBtn.textContent = isGuestUser() ? '登录' : '退出登录';
  }
  const userId = getUserId();
  if (nodes.adminSection) {
    nodes.adminSection.classList.toggle('hidden', userId !== 'admin');
  }
  renderThemeChoices(normalizeThemeValue(localStorage.getItem('theme')));
  renderFontChoices(normalizeFontPresetValue(localStorage.getItem(FONT_PRESET_STORAGE_KEY)));
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
  await Promise.all([loadAdminFeedback(), loadAdminStats(), loadInviteCodes(), loadPendingArticles(), loadHiddenArticles()]);
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
      nodes.adminFeedbackList.innerHTML = '<div class="state-text">暂无反馈</div>';
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
    nodes.adminFeedbackList.innerHTML = '<div class="state-text">加载失败</div>';
  }
}

async function loadAdminStats() {
  if (!nodes.adminStatsList) return;
  nodes.adminStatsList.innerHTML = '';
  try {
    const data = await getAdminStats();
    const activeUsers = Array.isArray(data.today_active_users_detail) && data.today_active_users_detail.length
      ? data.today_active_users_detail.map((item) => formatAdminUserLabel(item)).filter(Boolean)
      : (Array.isArray(data.today_active_user_ids)
          ? data.today_active_user_ids.filter(Boolean)
          : []);
    nodes.adminStatsList.appendChild(
      renderStatBlock('今日概览', [
        { label: '今日活跃用户数', value: String(data.today_active_users ?? 0) },
        { label: '独立访客数', value: String(data.today_unique_visitors ?? 0) },
        { label: '今日活跃用户', value: activeUsers.length ? activeUsers.join(', ') : '-' },
        { label: '今日文章打开次数', value: String(data.today_open_articles ?? 0) }
      ])
    );
    nodes.adminStatsList.appendChild(
      renderStatBlock(
        '本周阅读排行（按用户）',
        (data.weekly_user_finishes || []).map((item) => ({
          label: formatAdminUserLabel(item),
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
          label: formatAdminUserLabel(item),
          value: `${item.count || 0} 次`
        }))
      )
    );
    nodes.adminStatsList.appendChild(
      renderStatBlock(
        '核心功能使用（提问）',
        (data.qa_by_user || []).map((item) => ({
          label: formatAdminUserLabel(item),
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
      nodes.adminInviteList.innerHTML = '<div class="state-text">暂无邀请码</div>';
      return;
    }
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'admin-item';
      const sourceLabel = item.source === 'self_register' ? '自助注册' : '手动创建';
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
    nodes.adminInviteList.innerHTML = '<div class="state-text">加载失败</div>';
  }
}
async function loadHiddenArticles() {
  if (!nodes.adminHiddenList) return;
  nodes.adminHiddenList.innerHTML = '';
  try {
    const items = await getHiddenArticles();
    if (!items.length) {
      nodes.adminHiddenList.innerHTML = '<div class="state-text">暂无隐藏文章</div>';
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
          <button class="danger" type="button" data-id="${escapeHtml(item.id)}">取消隐藏</button>
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
    nodes.adminHiddenList.innerHTML = '<div class="state-text">加载失败</div>';
  }
}

async function loadPendingArticles() {
  if (!nodes.adminPendingList) return;
  nodes.adminPendingList.innerHTML = '';
  try {
    const items = await getPendingArticles();
    if (!items.length) {
      nodes.adminPendingList.innerHTML = '<div class="state-text">暂无待确认文章</div>';
      return;
    }
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'admin-item';
      div.innerHTML = `
        <div class="admin-item-meta">
          <span>${escapeHtml(item.title_zh || item.title_en || '未命名文章')}</span>
          <span>${escapeHtml(formatAdminTime(item.fetched_at || item.published_at))}</span>
        </div>
        <div>提交者：${escapeHtml(item.submitted_by || '-')}</div>
        <div class="admin-item-actions">
          <button class="ok" type="button" data-action="publish">发布</button>
          <button class="danger" type="button" data-action="hide">隐藏</button>
        </div>
      `;
      const publishBtn = div.querySelector('button[data-action="publish"]');
      const hideBtn = div.querySelector('button[data-action="hide"]');
      publishBtn?.addEventListener('click', async () => {
        try {
          await updatePendingPublishStatus(item.id, 'published');
          showToast('已发布', 2000);
          await Promise.all([loadPendingArticles(), loadArticles()]);
        } catch (err) {
          showToast(`操作失败：${err.message}`, 2000);
        }
      });
      hideBtn?.addEventListener('click', async () => {
        const reason = window.prompt('请输入隐藏原因');
        if (!reason || !String(reason).trim()) {
          return;
        }
        try {
          await updatePendingPublishStatus(item.id, 'hidden', String(reason).trim());
          showToast('已隐藏', 2000);
          await Promise.all([loadPendingArticles(), loadHiddenArticles(), loadArticles()]);
        } catch (err) {
          showToast(`操作失败：${err.message}`, 2000);
        }
      });
      nodes.adminPendingList.appendChild(div);
    });
  } catch (_) {
    nodes.adminPendingList.innerHTML = '<div class="state-text">加载失败</div>';
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

function openAppearanceModal() {
  renderThemeChoices(normalizeThemeValue(localStorage.getItem('theme')));
  renderFontChoices(normalizeFontPresetValue(localStorage.getItem(FONT_PRESET_STORAGE_KEY)));
  nodes.appearanceModal?.classList.remove('hidden');
}

function closeAppearanceModal() {
  nodes.appearanceModal?.classList.add('hidden');
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
  nodes.ingestSubmitBtn.textContent = isSubmitting ? '处理中...' : '确定';
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
  if (!isoString) return '未知时间';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '未知时间';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function formatAdminUserLabel(item) {
  const nickname = String(item?.nickname || '').trim();
  const userId = String(item?.user_id || '').trim();
  if (nickname && userId && nickname !== userId) {
    return `${nickname} (${userId})`;
  }
  return nickname || userId || '未知用户';
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
  const input = window.prompt('设置昵称（1-20 字）', current);
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

  try {
    await createGuestSession();
    await loadCurrentUserProfile();
    return true;
  } catch (_) {
    return false;
  }
}

function bindLoginEvents() {
  if (!nodes.loginButton || !nodes.loginInput || !nodes.nicknameInput) return;
  let loginSubmitting = false;

  const attemptRegister = async () => {
    if (loginSubmitting) return;
    const nickname = nodes.nicknameInput.value.trim();
    const inviteCode = nodes.loginInput.value.trim();
    if (!nickname) {
      showLoginOverlay('请输入昵称');
      return;
    }

    loginSubmitting = true;
    nodes.loginButton.disabled = true;
    const originText = nodes.loginButton.textContent;
    nodes.loginButton.textContent = '处理中...';

    try {
      if (isGuestUser() && !inviteCode) {
        await updateUserProfile({ nickname });
      } else {
        if (isGuestUser() && inviteCode) {
          // Ensure virtual keyboard is dismissed before showing confirm on mobile.
          nodes.nicknameInput.blur();
          nodes.loginInput.blur();
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
          await new Promise((resolve) => setTimeout(resolve, 160));
          const confirmed = window.confirm('使用邀请码会切换到新账号，当前游客数据不会自动合并。是否继续？');
          if (!confirmed) return;
        }
        await registerUser(nickname, inviteCode);
      }
      await loadCurrentUserProfile();
      hideLoginOverlay();
      refreshMeTab();
      await startApp();
    } catch (err) {
      const message = String(err.message || '娉ㄥ唽澶辫触');
      if (message.includes('invite') || message.toLowerCase().includes('invite')) {
        nodes.loginInput.value = '';
      }
      showLoginOverlay(message);
    } finally {
      loginSubmitting = false;
      nodes.loginButton.disabled = false;
      nodes.loginButton.textContent = originText || '进入';
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

  nodes.loginOverlay?.addEventListener('click', (event) => {
    if (event.target === nodes.loginOverlay) {
      hideLoginOverlay();
    }
  });
}

async function startApp() {
  if (state.appStarted) return;
  state.appStarted = true;
  ensureHomeHistoryState();
  const uiState = readUiState();
  const lastReaderState = readLastReaderState();
  if (uiState?.listScrollTop) {
    state.listScrollTop = {
      today: Math.max(0, Number(uiState.listScrollTop.today || 0)),
      notes: Math.max(0, Number(uiState.listScrollTop.notes || 0))
    };
  }
  trackEvent('open_app');
  bindEvents();
  bindAdminBlockAccordion();
  nodes.articleNotesBtn.addEventListener('click', async () => {
    await ensureReaderFeaturesInitialized();
    if (openArticleNotesHandler) {
      openArticleNotesHandler();
    }
  });
  nodes.readerAppearanceBtn?.addEventListener('click', () => {
    openAppearanceModal();
  });
  const initialTab = uiState?.tab === 'notes' ? 'notes' : 'today';
  switchTab(initialTab, { captureScroll: false });
  const loadPromise = loadArticles();
  loadPromise
    .then(async () => {
      await restoreListScroll();
    })
    .catch(() => {});
  requestAnimationFrame(() => {
    hideSplashScreen();
  });
  loadPromise.catch(() => {});
  scheduleServiceWorkerRegistration();
}

async function init() {
  if (isStandalonePwa()) {
    requestAnimationFrame(() => {
      hideSplashScreen();
    });
  }
  applyPerfFlags();
  initPerfOverlay();
  splashFallbackTimer = setTimeout(() => {
    hideSplashScreen();
  }, SPLASH_FALLBACK_MS);

  initTheme();
  initFontPreset();
  bindLoginEvents();
  maybeShowA2hsHint();
  initDesktopTip();
  initHomeInstallPrompt();

  const authed = await bootstrapAuth();
  hideLoginOverlay();
  if (!authed) {
    hideSplashScreen();
    showToast('初始化失败，请稍后重试');
    return;
  }
  await startApp();
}

init();
