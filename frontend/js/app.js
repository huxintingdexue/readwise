import { getArticles, getArticleById, getReadingProgress, saveReadingProgress, logout, postFeedback, getFeedback, getAdminStats, getInviteCodes, addInviteCode, getHiddenArticles, getPendingArticles, updateAdminArticleStatus, updatePendingPublishStatus, ingestUrl, translateIngestStep, trackEvent, migrateLegacyUser, getCurrentUser, updateUserProfile, getStoredUid, getStoredInviteCode, getStoredUserId, clearLegacyAuth, createGuestSession, quickAuth, setAccountSession, getStoredJwtToken, getStoredNickname } from './api.js';
import { closeOriginSnippetPanel, closeReader, openOriginSnippetPanel, renderReader, renderReaderLoading, scrollToPlainPosition, getReadingBaseLength } from './reader.js';
import { DEFAULT_AVATAR_URL, SOURCE_AVATAR_URLS } from './avatar-config.js';
import { getAuthors } from './api.js';

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
  authors: [],
  selectedTagFilter: '全部',
  listScrollTop: {
    today: 0,
    people: 0,
    notes: 0
  },
  briefHistoryOpen: false,
  peopleFilter: 'all',
  peopleDetailId: null,
  followedAuthorIds: new Set(),
  peopleShowZeroAuthors: false
};

const ARTICLE_LIST_CACHE_KEY = 'rw:article-list-cache:v3';
const ARTICLE_DETAIL_CACHE_PREFIX = 'rw:article-detail:v1:';
const ONE_TIME_CACHE_RESET_KEY = 'rw:cache-reset:v1:2026-03-28';
const TAG_FILTER_STORAGE_KEY = 'rw:today-tag-filter:v1';
const TAG_FILTER_OPTIONS = ['全部', '科技', '商业', '产品', '人生哲学'];
const LEGACY_TAG_MAP = {
  个人成长: '人生哲学'
};
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
const PEOPLE_FOLLOW_STORAGE_KEY = 'rw:people-follow:v1';
const PEOPLE_FILTER_OPTIONS = ['all', 'following'];

const PEOPLE_PRESET = [
  {
    id: 'sam',
    name: 'Sam Altman',
    avatar_url: SOURCE_AVATAR_URLS.sam || DEFAULT_AVATAR_URL,
    bio_one_line: 'OpenAI CEO · AI 研究者',
    bio_full: 'Sam Altman 是 OpenAI CEO，长期关注通用人工智能的落地路径。他的公开内容常围绕 AI 能力边界、产品化节奏与产业影响。阅读他的文章，适合快速把握 AI 行业的重要变化与长期判断。',
    tag: ['科技', '商业']
  },
  {
    id: 'andrej',
    name: 'Andrej Karpathy',
    avatar_url: SOURCE_AVATAR_URLS.andrej || DEFAULT_AVATAR_URL,
    bio_one_line: 'AI 工程专家 · 教育型创作者',
    bio_full: 'Andrej Karpathy 擅长把复杂模型机制讲清楚，内容覆盖 LLM、训练范式和工程实现细节。他的文章对工程团队非常实用，既有方法论也有可执行的实践路径。',
    tag: ['科技', '产品']
  },
  {
    id: 'naval',
    name: 'Naval Ravikant',
    avatar_url: SOURCE_AVATAR_URLS.naval || DEFAULT_AVATAR_URL,
    bio_one_line: '创业者与思想者 · AngelList 创始人',
    bio_full: 'Naval 的内容兼具商业视角与人生哲学视角，常从第一性原理讨论财富、判断与长期主义。阅读他的文章有助于在技术趋势之外，建立更稳的认知框架与决策体系。',
    tag: ['商业', '人生哲学']
  },
  {
    id: 'peter',
    name: 'Peter Steinberger',
    avatar_url: SOURCE_AVATAR_URLS.peter || DEFAULT_AVATAR_URL,
    bio_one_line: 'iOS 工程负责人 · 开发者工具专家',
    bio_full: 'Peter 长期深耕 Apple 平台开发与工程效率，内容聚焦架构、性能和开发体验。他的文章适合希望提升工程质量与产品交付效率的开发者阅读。',
    tag: ['科技', '产品']
  }
];
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

function runOneTimeCacheReset() {
  try {
    if (localStorage.getItem(ONE_TIME_CACHE_RESET_KEY) === '1') return;
    sessionStorage.removeItem('rw:article-list-cache:v2');
    localStorage.setItem(ONE_TIME_CACHE_RESET_KEY, '1');
  } catch (_) {}
}

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

function getListPanels() {
  return [nodes.todayTab, nodes.peopleTab, nodes.notesTab].filter(Boolean);
}

function updateTopbarForTab(tab) {
  const h1 = nodes.topbarTitle?.querySelector('h1');
  const p = nodes.topbarTitle?.querySelector('p');
  if (!h1 || !p) return;
  void tab;
  h1.textContent = '今日硅谷';
  p.textContent = '全球一手信息 触手可及';
}

const nodes = {
  appShell: document.querySelector('.app-shell'),
  tabButtons: [...document.querySelectorAll('.tab-btn')],
  splashScreen: document.querySelector('#splashScreen'),
  todayTab: document.querySelector('#tab-today'),
  peopleTab: document.querySelector('#tab-people'),
  notesTab: document.querySelector('#tab-notes'),
  statusFilter: document.querySelector('#statusFilter'),
  authorFilter: document.querySelector('#authorFilter'),
  sortFilter: document.querySelector('#sortFilter'),
  todayTagFilterBar: document.querySelector('#todayTagFilterBar'),
  todayTagFilterChips: [...document.querySelectorAll('#todayTagFilterBar .tag-filter-chip')],
  articlesState: document.querySelector('#articlesState'),
  articlesList: document.querySelector('#articlesList'),
  peopleListState: document.querySelector('#peopleListState'),
  peopleList: document.querySelector('#peopleList'),
  peopleExpandBtn: document.querySelector('#peopleExpandBtn'),
  peopleFilterBar: document.querySelector('.people-filter-bar'),
  peopleFilterChips: [...document.querySelectorAll('.people-filter-chip')],
  personDetail: document.querySelector('#personDetail'),
  personDetailBack: document.querySelector('#personDetailBack'),
  personDetailAvatar: document.querySelector('#personDetailAvatar'),
  personDetailName: document.querySelector('#personDetailName'),
  personDetailOneLine: document.querySelector('#personDetailOneLine'),
  personDetailTags: document.querySelector('#personDetailTags'),
  personDetailFollowBtn: document.querySelector('#personDetailFollowBtn'),
  personDetailBio: document.querySelector('#personDetailBio'),
  personArticleCount: document.querySelector('#personArticleCount'),
  personArticleList: document.querySelector('#personArticleList'),
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
  accountDisplay: document.querySelector('#accountDisplay'),
  nicknameDisplay: document.querySelector('#nicknameDisplay'),
  profileAvatarText: document.querySelector('#profileAvatarText'),
  authEntryBtn: document.querySelector('#authEntryBtn'),
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
  authSheetTitle: document.querySelector('#authSheetTitle'),
  authQuickForm: document.querySelector('#authQuickForm'),
  authQuickAccount: document.querySelector('#authQuickAccount'),
  authQuickSubmit: document.querySelector('#authQuickSubmit'),
  forgotPasswordText: document.querySelector('#forgotPasswordText'),
  bindPromptBox: document.querySelector('#bindPromptBox'),
  bindNowBtn: document.querySelector('#bindNowBtn'),
  bindLaterBtn: document.querySelector('#bindLaterBtn'),
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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === 'year')?.value || 0);
  const month = Number(parts.find((p) => p.type === 'month')?.value || 0);
  const day = Number(parts.find((p) => p.type === 'day')?.value || 0);
  if (!year || !month || !day) return '未知时间';

  const now = new Date();
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric'
  }).formatToParts(now);
  const currentYear = Number(nowParts.find((p) => p.type === 'year')?.value || 0);
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) {
    return `${month}/${day}`;
  }

  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  if (diffMs < hourMs) return '刚刚';
  if (diffMs < dayMs) return `${Math.max(1, Math.floor(diffMs / hourMs))}小时前`;

  const nowDayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(now);
  const nowYear = Number(nowDayParts.find((p) => p.type === 'year')?.value || 0);
  const nowMonth = Number(nowDayParts.find((p) => p.type === 'month')?.value || 0);
  const nowDay = Number(nowDayParts.find((p) => p.type === 'day')?.value || 0);
  const nowDayUtc = Date.UTC(nowYear, nowMonth - 1, nowDay);
  const targetDayUtc = Date.UTC(year, month - 1, day);
  const dayDiff = Math.max(0, Math.floor((nowDayUtc - targetDayUtc) / dayMs));

  if (dayDiff === 1) return '昨天';
  if (dayDiff >= 2 && dayDiff <= 6) return `${dayDiff}天前`;
  if (dayDiff >= 7 && dayDiff <= 27) return `${Math.max(1, Math.floor(dayDiff / 7))}周前`;

  const monthDiff = (nowYear - year) * 12 + (nowMonth - month);
  if (monthDiff >= 1 && monthDiff <= 11) return `${monthDiff}个月前`;

  if (year === currentYear) {
    return `${month}/${day}`;
  }
  return `${year}/${month}/${day}`;
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

function normalizePeopleFilter(value) {
  const normalized = String(value || '').trim();
  return PEOPLE_FILTER_OPTIONS.includes(normalized) ? normalized : 'all';
}

function readFollowedAuthorIds() {
  try {
    const raw = localStorage.getItem(PEOPLE_FOLLOW_STORAGE_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.map((id) => String(id || '').trim()).filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

function writeFollowedAuthorIds(nextSet) {
  try {
    localStorage.setItem(PEOPLE_FOLLOW_STORAGE_KEY, JSON.stringify([...nextSet]));
  } catch (_) {}
}

function personTags(person) {
  if (Array.isArray(person?.tag)) {
    return person.tag.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(person?.tag || '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function personArticleCount(person) {
  if (!person?.id) return 0;
  return state.articles.filter((article) => articleBelongsToPerson(article, person)).length;
}

function articleBelongsToPerson(article, person) {
  if (!article || !person?.id) return false;
  const authorKey = String(article.author_key || '').trim();
  if (authorKey && authorKey === person.id) return true;
  const sourceKey = String(article.source_key || '').trim();
  if (sourceKey && sourceKey === person.id) return true;
  const authorName = String(article.author || '').trim().toLowerCase();
  const personName = String(person.name || '').trim().toLowerCase();
  return Boolean(authorName && personName && authorName.includes(personName));
}

function getPeopleList() {
  const source = Array.isArray(state.authors) && state.authors.length ? state.authors : PEOPLE_PRESET;
  return source
    .map((item) => {
      const id = String(item.source_key || item.id || '').trim();
      const sourceKey = String(item.source_key || id || '').trim();
      const normalized = {
        ...item,
        id,
        source_key: sourceKey,
        name: String(item.name || item.name_zh || id || '').trim(),
        avatar_url: String(item.avatar_url || '').trim() || sourceFallbackAvatar(sourceKey)
      };
      const countFromApi = Number(item?.article_count || 0);
      const countFromLocal = personArticleCount(normalized);
      return {
        ...normalized,
        count: Number.isFinite(countFromApi) && countFromApi >= 0
          ? Math.max(countFromApi, countFromLocal)
          : countFromLocal
      };
    })
    .filter((item) => {
      const key = String(item.source_key || '').trim();
      return Boolean(item.id) && key !== 'daily_brief' && key !== 'unknown';
    })
    .sort((a, b) => {
      const aIsSpecial = ['manual', 'daily_brief'].includes(String(a.source_key || ''));
      const bIsSpecial = ['manual', 'daily_brief'].includes(String(b.source_key || ''));
      if (aIsSpecial !== bIsSpecial) return aIsSpecial ? 1 : -1;
      const aCount = Number(a.count || 0);
      const bCount = Number(b.count || 0);
      const aHas = aCount > 0 ? 0 : 1;
      const bHas = bCount > 0 ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      if (bCount !== aCount) return bCount - aCount;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });
}

function renderPeopleFilterSelection() {
  const active = normalizePeopleFilter(state.peopleFilter);
  nodes.peopleFilterChips.forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.peopleFilter === active);
  });
}

function toggleFollowAuthor(authorId) {
  const id = String(authorId || '').trim();
  if (!id) return;
  if (!isAccountLoggedIn()) {
    if (isInviteUserWithoutAccount()) {
      showBindPromptOverlay();
    } else {
      showLoginOverlay('登录后可以保存你关注的博主，同步阅读进度，换设备也不会丢失。');
    }
    return;
  }
  if (state.followedAuthorIds.has(id)) {
    state.followedAuthorIds.delete(id);
  } else {
    state.followedAuthorIds.add(id);
  }
  writeFollowedAuthorIds(state.followedAuthorIds);
}

function resolvePersonZhName(person) {
  const direct = String(person?.name_zh || '').trim();
  if (direct) return direct;
  const id = String(person?.id || person?.source_key || '').trim();
  const name = String(person?.name || '').trim().toLowerCase();
  const source = Array.isArray(state.authors) && state.authors.length ? state.authors : PEOPLE_PRESET;
  const list = Array.isArray(source) ? source : [];
  const byId = list.find((item) => {
    const key = String(item?.source_key || item?.id || '').trim();
    return Boolean(key) && key === id;
  });
  if (byId?.name_zh) return String(byId.name_zh).trim();
  const byName = list.find((item) => String(item?.name || '').trim().toLowerCase() === name);
  return byName?.name_zh ? String(byName.name_zh).trim() : '';
}

function buildPeopleCard(person) {
  const li = document.createElement('li');
  li.className = 'people-card';
  const followed = state.followedAuthorIds.has(person.id);
  const tags = personTags(person);
  const tagText = tags.length ? tags.join(' / ') : '科技';
  const countValue = Number(person.count || 0);
  const countLabel = countValue > 0 ? `${countValue}篇文章` : '计划同步中';
  const zhName = resolvePersonZhName(person);
  li.innerHTML = `
    <div class="people-card-main" data-person-open="${escapeHtml(person.id)}">
      <img class="people-avatar" src="${escapeHtml(person.avatar_url || DEFAULT_AVATAR_URL)}" alt="${escapeHtml(person.name)}" />
      <div class="people-body">
        <div class="people-row">
          <h3 class="people-name">${escapeHtml(person.name)}</h3>
          <button class="people-follow-btn ${followed ? 'is-following' : ''}" type="button" data-person-follow="${escapeHtml(person.id)}">
            ${followed ? '已关注' : '关注'}
          </button>
        </div>
        ${zhName ? `<p class="people-name-zh">${escapeHtml(zhName)}</p>` : ''}
        <p class="people-one-line">${escapeHtml(person.bio_one_line || '暂无简介')}</p>
        <div class="people-meta">
          <span class="people-tag">${escapeHtml(tagText)}</span>
          <span class="people-dot"></span>
          <span class="people-count">${escapeHtml(countLabel)}</span>
        </div>
      </div>
    </div>
  `;
  const openBtn = li.querySelector('[data-person-open]');
  const followBtn = li.querySelector('[data-person-follow]');
  openBtn?.addEventListener('click', () => openPersonDetail(person.id));
  followBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFollowAuthor(person.id);
    renderPeople();
  });
  return li;
}

function renderPeople() {
  if (!nodes.peopleList || !nodes.peopleListState) return;
  const people = getPeopleList();
  const filter = normalizePeopleFilter(state.peopleFilter);
  const base = filter === 'following'
    ? people.filter((person) => state.followedAuthorIds.has(person.id))
    : people;
  const nonZero = base.filter((person) => Number(person.count || 0) > 0);
  const zero = base.filter((person) => Number(person.count || 0) <= 0);
  const visible = state.peopleShowZeroAuthors ? base : nonZero;
  const hasCollapsed = !state.peopleShowZeroAuthors && zero.length > 0;

  nodes.peopleList.innerHTML = '';
  nodes.peopleExpandBtn?.classList.add('hidden');
  if (!visible.length) {
    nodes.peopleListState.textContent = filter === 'following' ? '你还没有关注人物' : '暂无人物';
    nodes.peopleListState.classList.remove('hidden');
  } else {
    nodes.peopleListState.classList.add('hidden');
    visible.forEach((person) => nodes.peopleList.appendChild(buildPeopleCard(person)));
  }

  if (hasCollapsed) {
    nodes.peopleExpandBtn?.classList.remove('hidden');
    if (nodes.peopleExpandBtn) {
      nodes.peopleExpandBtn.textContent = `查看更多（${zero.length}位）`;
    }
    if (!visible.length) {
      nodes.peopleListState.classList.add('hidden');
    }
  }

  if (state.peopleDetailId) {
    const current = people.find((item) => item.id === state.peopleDetailId);
    if (current) {
      renderPersonDetail(current);
    } else {
      closePersonDetail();
    }
  }
}

function openPersonDetail(authorId) {
  const person = getPeopleList().find((item) => item.id === authorId);
  if (!person || !nodes.personDetail) return;
  state.peopleDetailId = person.id;
  if (!history.state || history.state.view !== 'people_detail' || history.state.authorId !== person.id) {
    history.pushState({ view: 'people_detail', authorId: person.id }, '', location.href);
  }
  renderPersonDetail(person);
}

function closePersonDetail(options = {}) {
  state.peopleDetailId = null;
  if (nodes.personDetail) {
    nodes.personDetail.classList.add('hidden');
  }
  if (nodes.peopleList) {
    nodes.peopleList.classList.remove('hidden');
  }
  nodes.peopleExpandBtn?.classList.add('hidden');
  if (nodes.peopleListState && !nodes.peopleList.children.length) {
    nodes.peopleListState.classList.remove('hidden');
  }
  nodes.peopleFilterBar?.classList.remove('hidden');
  if (!options.fromPopstate && history.state?.view === 'people_detail') {
    history.back();
  }
}

function renderPersonDetail(person) {
  if (!nodes.personDetail || !nodes.personArticleList) return;
  const tags = personTags(person);
  const followed = state.followedAuthorIds.has(person.id);
  nodes.personDetail.classList.remove('hidden');
  nodes.peopleList.classList.add('hidden');
  nodes.peopleExpandBtn?.classList.add('hidden');
  nodes.peopleListState.classList.add('hidden');
  nodes.peopleFilterBar?.classList.add('hidden');

  if (nodes.personDetailAvatar) {
    nodes.personDetailAvatar.src = person.avatar_url || DEFAULT_AVATAR_URL;
    nodes.personDetailAvatar.alt = person.name;
  }
  if (nodes.personDetailName) nodes.personDetailName.textContent = person.name;
  if (nodes.personDetailOneLine) nodes.personDetailOneLine.textContent = person.bio_one_line || '暂无简介';
  if (nodes.personDetailBio) nodes.personDetailBio.textContent = person.bio_full || '';
  if (nodes.personDetailFollowBtn) {
    nodes.personDetailFollowBtn.textContent = followed ? '已关注' : '关注';
    nodes.personDetailFollowBtn.classList.toggle('is-following', followed);
    nodes.personDetailFollowBtn.onclick = () => {
      toggleFollowAuthor(person.id);
      renderPeople();
    };
  }
  if (nodes.personDetailTags) {
    nodes.personDetailTags.innerHTML = tags
      .slice(0, 2)
      .map((tag) => `<span class="person-tag-chip">${escapeHtml(tag)}</span>`)
      .join('');
  }

  const articles = state.articles
    .filter((article) => articleBelongsToPerson(article, person))
    .slice()
    .sort((a, b) => (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0));
  if (nodes.personArticleCount) nodes.personArticleCount.textContent = `共${articles.length}篇`;
  nodes.personArticleList.innerHTML = '';
  articles.forEach((item) => nodes.personArticleList.appendChild(buildArticleCard(item)));
}

function normalizeTagFilter(value) {
  const raw = String(value || '').trim();
  const text = LEGACY_TAG_MAP[raw] || raw;
  if (TAG_FILTER_OPTIONS.includes(text)) return text;
  return '全部';
}

function readTagFilter() {
  try {
    return normalizeTagFilter(localStorage.getItem(TAG_FILTER_STORAGE_KEY));
  } catch (_) {
    return '全部';
  }
}

function writeTagFilter(value) {
  try {
    localStorage.setItem(TAG_FILTER_STORAGE_KEY, normalizeTagFilter(value));
  } catch (_) {}
}

function renderTagFilterSelection() {
  const selected = normalizeTagFilter(state.selectedTagFilter);
  nodes.todayTagFilterChips.forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.tagFilter === selected);
  });
}

function matchesTagFilter(item) {
  const selected = normalizeTagFilter(state.selectedTagFilter);
  if (selected === '全部') return true;
  const itemTag = normalizeTagFilter(String(item?.tag || '').trim());
  return itemTag === selected;
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

function calcScrollPositionByBaseLength(baseLength, scroller = window) {
  if (!baseLength || baseLength <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, currentScrollTop(scroller) / maxScrollableDistance(scroller)));
  return Math.round(baseLength * ratio);
}

function captureListScroll() {
  const tab = state.tab || 'today';
  state.listScrollTop[tab] = currentScrollTop(getListScroller());
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
  const progressResult = await persistReadingProgressNow();
  state.currentArticle = null;
  document.body.classList.add('restoring-list-scroll');
  setReadingMode(false);
  document.body.classList.remove('reader-bar-hidden');
  closeReader({
    readerView: nodes.readerView,
    listPanels: getListPanels(),
    readerContent: nodes.readerContent,
    originSnippet: nodes.originSnippet,
    originSnippetText: nodes.originSnippetText
  });
  setReaderAdminActionsVisible(false);
  closeHideArticleModal();
  nodes.todayTab.classList.toggle('hidden', state.tab !== 'today');
  nodes.peopleTab.classList.toggle('hidden', state.tab !== 'people');
  nodes.notesTab.classList.toggle('hidden', state.tab !== 'notes');
  if (state.tab === 'today' && progressResult?.articleId) {
    updateListProgress(progressResult.articleId, progressResult.percent);
  }
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

function buildArticleCard(item, showBriefHistoryEntry = false) {
  const li = document.createElement('li');
  const isTranslating = item.status === 'translating';
  const isOwner = item.submitted_by && item.submitted_by === getUserId();
  const showBadge = Boolean(isOwner);
  const badgeLabel = isTranslating ? '导入中' : '已导入';
  const isManual = Boolean(item.submitted_by || item.source_key === 'manual');
  const isManualTranslating = isManual && isTranslating;
  const progress = progressMeta(item);
  const avatarUrl = resolveAuthorAvatarUrl(item);
  const summaryText = String(item.summary_zh || item.summary_en || '暂无摘要');
  li.innerHTML = `
    <article class="article-card${isTranslating ? ' is-disabled' : ''}${isManualTranslating ? ' is-recommend' : ''} bg-white rounded-xl p-4 relative group active:scale-[0.99] transition-all duration-200 shadow-[0_1px_6px_rgba(0,0,0,0.02)]" data-id="${item.id}">
      <div class="article-card-top">
        <div class="article-author">
          <img class="article-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(sourceName(item.source_key, item.author))}"/>
          <div class="article-author-text">
            <div class="article-author-row">
              <span class="article-author-name">${escapeHtml(sourceName(item.source_key, item.author))}</span>
              <span class="article-reading-time">· ${escapeHtml(formatDate(item.published_at))}</span>
            </div>
          </div>
        </div>
        <div class="article-card-status">
          ${showBadge ? `<span class="article-badge">${badgeLabel}</span>` : ''}
          <span class="article-progress ${progress.className}">${escapeHtml(progress.label)}</span>
        </div>
      </div>
      <div class="article-body">
        <h3 class="article-title">${escapeHtml(item.title_zh || item.title_en || '未命名文章')}</h3>
        <p class="article-summary">${escapeHtml(summaryText)}</p>
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
  const filteredArticles = state.articles.filter((item) => matchesTagFilter(item));

  if (state.briefHistoryOpen) {
    nodes.articlesState.textContent = '';
    const briefs = filteredArticles
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

  if (filteredArticles.length === 0) {
    nodes.articlesState.textContent = state.selectedTagFilter === '全部' ? '暂无文章' : '该标签下暂无文章';
    return;
  }

  nodes.articlesState.textContent = '';

  const toTs = (value) => Date.parse(value || '') || 0;
  const briefs = filteredArticles
    .filter((a) => a.source_key === 'daily_brief')
    .slice()
    .sort((a, b) => (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0));

  const normal = filteredArticles
    .filter((a) => a.source_key !== 'daily_brief')
    .slice()
    .sort((a, b) => toTs(b.published_at) - toTs(a.published_at));

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
        renderPeople();
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
    renderPeople();
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

async function loadAuthors() {
  try {
    const rows = await getAuthors();
    state.authors = Array.isArray(rows) ? rows : [];
    renderPeople();
  } catch (_) {
    state.authors = [];
    renderPeople();
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
        listPanels: getListPanels(),
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
        listPanels: getListPanels(),
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
      listPanels: getListPanels(),
      originSnippet: nodes.originSnippet,
      originSnippetText: nodes.originSnippetText,
      articleNotesPanel: nodes.articleNotesPanel
    }, progress);
    if (jumpTo != null) {
      const baseLength = getReadingBaseLength(detail, nodes.readerContent);
      scrollToPlainPosition(baseLength, jumpTo);
    }
  } catch (err) {
    showToast(`打开文章失败：${err.message}`);
    setReadingMode(false);
    document.body.classList.remove('reader-bar-hidden');
    setReaderAdminActionsVisible(false);
    closeReader({
      readerView: nodes.readerView,
      listPanels: getListPanels(),
      readerContent: nodes.readerContent,
      originSnippet: nodes.originSnippet,
      originSnippetText: nodes.originSnippetText
    });
  }
}

function switchTab(nextTab) {
  state.tab = nextTab;
  updateTopbarForTab(nextTab);
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
    listPanels: getListPanels(),
    readerContent: nodes.readerContent,
    originSnippet: nodes.originSnippet,
    originSnippetText: nodes.originSnippetText
  });
  nodes.todayTab.classList.toggle('hidden', nextTab !== 'today');
  nodes.peopleTab.classList.toggle('hidden', nextTab !== 'people');
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
  if (nextTab === 'people') {
    renderPeopleFilterSelection();
    renderPeople();
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

  nodes.todayTagFilterBar?.addEventListener('click', (event) => {
    const chip = event.target.closest('.tag-filter-chip');
    if (!chip) return;
    const previous = state.selectedTagFilter;
    const next = normalizeTagFilter(chip.dataset.tagFilter);
    if (next === state.selectedTagFilter) return;
    state.selectedTagFilter = next;
    writeTagFilter(next);
    trackEvent('filter_tag', null, {
      tag: next,
      prev_tag: previous || '',
      page: 'today'
    });
    renderTagFilterSelection();
    renderArticles();
  });

  nodes.peopleFilterBar?.addEventListener('click', (event) => {
    const chip = event.target.closest('.people-filter-chip');
    if (!chip) return;
    const next = normalizePeopleFilter(chip.dataset.peopleFilter);
    if (next === state.peopleFilter) return;
    state.peopleFilter = next;
    state.peopleShowZeroAuthors = false;
    renderPeopleFilterSelection();
    renderPeople();
  });

  nodes.peopleExpandBtn?.addEventListener('click', () => {
    state.peopleShowZeroAuthors = true;
    renderPeople();
  });

  nodes.backBtn?.addEventListener('click', async () => {
    await exitReaderView(false);
  });

  nodes.briefHistoryBack?.addEventListener('click', () => {
    history.back();
  });

  nodes.personDetailBack?.addEventListener('click', () => {
    closePersonDetail();
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
    const confirmed = window.confirm('确定退出登录吗？');
    if (!confirmed) return;
    logout();
  });

  nodes.authEntryBtn?.addEventListener('click', () => {
    showLoginOverlay('登录后可以保存你关注的博主，同步阅读进度，换设备也不会丢失。');
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
        return;
      }
      if (state.peopleDetailId) {
        closePersonDetail({ fromPopstate: true });
      }
    });
    state.historyBound = true;
  }
}
function getInviteCodeLabel() {
  return String(state.currentUser?.inviteCode || '').trim() || getStoredInviteCode() || '-';
}

function getAccountValue() {
  return String(state.currentUser?.account || '').trim();
}

function maskAccount(account) {
  const text = String(account || '').trim();
  if (!text) return '-';
  if (/^\d{11}$/.test(text)) {
    return `${text.slice(0, 3)}****${text.slice(-4)}`;
  }
  if (text.includes('@')) {
    const [name, domain] = text.split('@');
    const safeName = name.length <= 1 ? '*' : `${name.slice(0, 1)}***`;
    return `${safeName}@${domain || ''}`;
  }
  return text;
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
  return nickname || getStoredNickname() || '-';
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

function isAccountLoggedIn() {
  return Boolean(getStoredJwtToken() && getAccountValue());
}

function isInviteUserWithoutAccount() {
  return Boolean(getStoredInviteCode() && !isAccountLoggedIn());
}

function normalizeAuthAccountInput(value) {
  return String(value || '').trim();
}

function isValidAccountFormat(account) {
  if (!account) return false;
  if (/^\d{11}$/.test(account)) return true;
  if (account.includes('@')) return true;
  return false;
}

function refreshMeTab() {
  if (nodes.inviteCodeDisplay) {
    nodes.inviteCodeDisplay.textContent = getInviteCodeLabel();
  }
  if (nodes.accountDisplay) {
    nodes.accountDisplay.textContent = maskAccount(getAccountValue());
  }
  if (nodes.nicknameDisplay) {
    nodes.nicknameDisplay.textContent = getNicknameLabel();
  }
  if (nodes.profileAvatarText) {
    nodes.profileAvatarText.textContent = getAvatarDisplayText();
  }
  if (nodes.nicknameHintRow) {
    const shouldShow = isAccountLoggedIn() && !String(state.currentUser?.nickname || '').trim();
    nodes.nicknameHintRow.classList.toggle('hidden', !shouldShow);
  }
  if (nodes.authEntryBtn) {
    nodes.authEntryBtn.classList.toggle('hidden', isAccountLoggedIn());
  }
  if (nodes.logoutBtn) {
    nodes.logoutBtn.classList.toggle('hidden', !isAccountLoggedIn());
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
  nodes.peopleTab.classList.add('hidden');
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

function setAuthError(message = '') {
  if (!nodes.loginError) return;
  nodes.loginError.textContent = String(message || '').trim();
}

function showLoginOverlay(message = '') {
  if (!nodes.loginOverlay) return;
  nodes.loginOverlay.classList.remove('hidden');
  if (nodes.authSheetTitle) {
    nodes.authSheetTitle.textContent = String(message || '登录后可以保存你关注的博主，同步阅读进度，换设备也不会丢失。');
  }
  nodes.bindPromptBox?.classList.add('hidden');
  nodes.authQuickForm?.classList.remove('hidden');
  setAuthError('');
  const input = nodes.authQuickAccount;
  if (input) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          input.focus({ preventScroll: true });
        } catch (_) {
          input.focus();
        }
      });
    });
  }
}

function showBindPromptOverlay() {
  if (!nodes.loginOverlay) return;
  nodes.loginOverlay.classList.remove('hidden');
  if (nodes.authSheetTitle) {
    nodes.authSheetTitle.textContent = '绑定账号后，换设备也能找回你的阅读记录和关注列表。';
  }
  nodes.bindPromptBox?.classList.remove('hidden');
  nodes.authQuickForm?.classList.add('hidden');
  setAuthError('');
}

function hideLoginOverlay() {
  nodes.loginOverlay?.classList.add('hidden');
  setAuthError('');
  nodes.bindPromptBox?.classList.add('hidden');
  nodes.authQuickForm?.classList.remove('hidden');
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
    if (state.currentUser) return true;
    if (getStoredJwtToken()) {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('nickname');
    }
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
  if (!nodes.loginOverlay) return;

  const runWithButton = async (button, fn) => {
    if (!button) return;
    if (button.disabled) return;
    button.disabled = true;
    const text = button.textContent;
    button.textContent = '处理中...';
    try {
      await fn();
    } finally {
      button.disabled = false;
      button.textContent = text || '提交';
    }
  };

  const validateAccount = (account) => {
    if (!account) return '请输入账号';
    if (!isValidAccountFormat(account)) return '请输入邮箱或11位手机号';
    return '';
  };

  const afterAuthSuccess = async (payload) => {
    const token = String(payload?.token || '').trim();
    const userId = String(payload?.user_id || '').trim();
    const nickname = String(payload?.nickname || '').trim();
    if (!token || !userId) {
      throw new Error('登录结果异常');
    }
    setAccountSession({ token, userId, nickname });
    await loadCurrentUserProfile();
    refreshMeTab();
    renderPeople();
    hideLoginOverlay();
  };

  nodes.authQuickSubmit?.addEventListener('click', () => runWithButton(nodes.authQuickSubmit, async () => {
    const account = normalizeAuthAccountInput(nodes.authQuickAccount?.value);
    const formatErr = validateAccount(account);
    if (formatErr) {
      setAuthError(formatErr);
      return;
    }
    const data = await quickAuth({
      account,
      user_id: getUid() || getStoredUserId()
    });
    await afterAuthSuccess(data);
  }).catch((err) => {
    setAuthError(err.message || '登录失败');
  }));
  nodes.authQuickAccount?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      nodes.authQuickSubmit?.click();
    }
  });

  nodes.bindNowBtn?.addEventListener('click', () => {
    showLoginOverlay('绑定账号后，换设备也能找回你的阅读记录和关注列表。');
  });
  nodes.bindLaterBtn?.addEventListener('click', () => {
    hideLoginOverlay();
  });

  const onForgotPassword = () => {
    showToast('请添加微信 huxinting0725 联系我们重置密码');
  };
  nodes.forgotPasswordText?.addEventListener('click', onForgotPassword);
  nodes.forgotPasswordText?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onForgotPassword();
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
  state.selectedTagFilter = readTagFilter();
  state.peopleFilter = 'all';
  state.followedAuthorIds = readFollowedAuthorIds();
  trackEvent('open_app');
  bindEvents();
  renderTagFilterSelection();
  renderPeopleFilterSelection();
  renderPeople();
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
  switchTab('today');
  loadAuthors().catch(() => {});
  const loadPromise = loadArticles();
  requestAnimationFrame(() => {
    hideSplashScreen();
  });
  loadPromise.catch(() => {});
  scheduleServiceWorkerRegistration();
}

async function init() {
  runOneTimeCacheReset();
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
