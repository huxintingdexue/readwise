#!/usr/bin/env node
// AI 编辑室命令行工具，供 Codex 定时任务调用。规则见 docs/EDITOR.md。
//
//   node scripts/editor/editor.mjs brief-source            拉 Zara follow-builders 当日素材
//   node scripts/editor/editor.mjs existing [url...]       查已入库链接（去重）
//   node scripts/editor/editor.mjs extract <url> [out.json] 提取正文并去广告
//   node scripts/editor/editor.mjs check <payload.json>     本地质量自查（不入库）
//   node scripts/editor/editor.mjs submit <payload.json> [--allow-old] [--dry-run]
//   node scripts/editor/editor.mjs notify <text>            给主编发飞书私信
//   node scripts/editor/editor.mjs state                    查看巡检状态
//   node scripts/editor/editor.mjs mark-checked <key...>    记录人物已巡检
//
// 本机配置 ~/.readwise-editor/.env：READWISE_EDITOR_CODE、READWISE_API_BASE、FEISHU_NOTIFY_OPEN_ID

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fetchAndExtract } from '../lib/extract-article.js';
import {
  checkTranslatedArticle,
  maxTier,
  normalizeReviewTier
} from '../../api/_utils/content-quality.js';

const HOME_DIR = path.join(os.homedir(), '.readwise-editor');
const WORK_DIR = path.join(HOME_DIR, 'work');
const STATE_PATH = path.join(HOME_DIR, 'state.json');
const LOG_PATH = path.join(HOME_DIR, 'log.jsonl');
const LARK_CLI = path.join(os.homedir(), '.local', 'bin', 'lark-cli');

const ZARA_BASE = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main';
const ZARA_FEEDS = ['feed-x.json', 'feed-podcasts.json', 'feed-blogs.json'];
const ZARA_STALE_HOURS = 36;

function loadEnv() {
  const envPath = path.join(HOME_DIR, '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return {
    code: process.env.READWISE_EDITOR_CODE || env.READWISE_EDITOR_CODE || '',
    apiBase: (process.env.READWISE_API_BASE || env.READWISE_API_BASE || 'https://readwise.byguang.online').replace(/\/$/, ''),
    notifyOpenId: process.env.FEISHU_NOTIFY_OPEN_ID || env.FEISHU_NOTIFY_OPEN_ID || ''
  };
}

function ensureDirs() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (_) {
    return { lastBriefZaraGeneratedAt: null, lastBriefDate: null, checked: {} };
  }
}

function writeState(state) {
  ensureDirs();
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function appendLog(entry) {
  ensureDirs();
  fs.appendFileSync(LOG_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

function beijingDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(date);
}

function print(value) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

async function api(pathname, options = {}) {
  const { code, apiBase } = loadEnv();
  if (!code) fail('缺少 READWISE_EDITOR_CODE，请配置 ~/.readwise-editor/.env');
  const res = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Invite-Code': code,
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_) {
    body = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body };
}

function notify(text) {
  const { notifyOpenId } = loadEnv();
  if (!notifyOpenId) {
    process.stderr.write('[notify] 未配置 FEISHU_NOTIFY_OPEN_ID，跳过\n');
    return false;
  }
  try {
    execFileSync('bash', [LARK_CLI, 'im', '+messages-send', '--as', 'bot', '--user-id', notifyOpenId, '--markdown', text], {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 30000
    });
    return true;
  } catch (err) {
    process.stderr.write(`[notify] 发送失败：${String(err.stderr || err.message).slice(0, 300)}\n`);
    return false;
  }
}

async function cmdBriefSource() {
  ensureDirs();
  const [feedX, feedPodcasts, feedBlogs] = await Promise.all(
    ZARA_FEEDS.map(async (name) => {
      const res = await fetch(`${ZARA_BASE}/${name}`);
      if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
      return res.json();
    })
  );
  const generatedAt = feedX.generatedAt;
  const ageHours = (Date.now() - new Date(generatedAt).getTime()) / 3600000;
  const state = readState();
  const today = beijingDate();

  let skip = null;
  if (state.lastBriefDate === today) skip = `今天（${today}）的快讯已经发过`;
  else if (state.lastBriefZaraGeneratedAt === generatedAt) skip = `Zara 素材未更新（generatedAt=${generatedAt}，上一期已用过）`;
  else if (ageHours > ZARA_STALE_HOURS) skip = `Zara 素材已 ${Math.round(ageHours)} 小时未更新`;

  const builders = (feedX.x || [])
    .map((builder) => ({
      name: builder.name,
      handle: builder.handle,
      bio: builder.bio,
      tweets: (builder.tweets || []).map((tweet) => ({
        text: tweet.text,
        url: tweet.url || (tweet.id ? `https://x.com/${builder.handle}/status/${tweet.id}` : null),
        createdAt: tweet.createdAt || tweet.created_at || null,
        likes: tweet.likes ?? null,
        replies: tweet.replies ?? null,
        isQuote: Boolean(tweet.isQuote),
        quotedUrl: tweet.quotedTweetId ? `https://x.com/i/status/${tweet.quotedTweetId}` : null
      }))
    }))
    .filter((builder) => builder.tweets.length > 0);

  const out = {
    date: today,
    zaraGeneratedAt: generatedAt,
    skip,
    counts: {
      builders: builders.length,
      tweets: builders.reduce((n, b) => n + b.tweets.length, 0),
      podcasts: (feedPodcasts.podcasts || []).length,
      blogs: (feedBlogs.blogs || []).length
    },
    builders,
    podcasts: (feedPodcasts.podcasts || []).map((p) => ({
      name: p.name,
      title: p.title,
      url: p.url,
      publishedAt: p.publishedAt,
      transcript: String(p.transcript || '').slice(0, 30000)
    })),
    blogs: feedBlogs.blogs || []
  };
  const outPath = path.join(WORK_DIR, `brief-source-${today}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  print({ file: outPath, date: today, zaraGeneratedAt: generatedAt, skip, counts: out.counts });
}

async function cmdExisting(urls) {
  const { status, body } = await api('/api/articles/urls');
  if (status !== 200) fail(`查询已入库链接失败：HTTP ${status} ${JSON.stringify(body).slice(0, 200)}`);
  const known = new Set();
  for (const row of body.urls || []) {
    if (row.url) known.add(normalizeUrl(row.url));
    if (row.source_url) known.add(normalizeUrl(row.source_url));
  }
  if (!urls.length) {
    print({ total: known.size });
    return;
  }
  print(urls.map((url) => ({ url, exists: known.has(normalizeUrl(url)) })));
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_|^ref$|^source$/i.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.replace(/^www\./, '');
    return u.toString().replace(/\/$/, '');
  } catch (_) {
    return String(url || '').trim();
  }
}

async function cmdExtract(url, outPath) {
  if (!url) fail('用法：extract <url> [out.json]');
  const article = await fetchAndExtract(url);
  if (!article) fail(`无法提取正文：${url}`, 2);
  ensureDirs();
  const target = outPath || path.join(WORK_DIR, `extract-${Date.now()}.json`);
  fs.writeFileSync(target, `${JSON.stringify(article, null, 2)}\n`);
  print({
    file: target,
    title: article.title,
    byline: article.byline,
    publishedTime: article.publishedTime,
    textLength: article.textContent.length,
    removedNoiseBlocks: article.removedNoiseBlocks,
    remainingNoise: article.remainingNoise,
    paywalled: article.paywalled
  });
}

function readPayload(file) {
  if (!file) fail('缺少 payload.json 路径');
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  return payload;
}

function localCheck(payload) {
  const quality = checkTranslatedArticle({
    contentZh: payload.content_zh,
    contentEnPlain: String(payload.content_en || '').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' '),
    contentEnHtml: payload.content_en
  });
  const missing = ['title_zh', 'summary_zh', 'content_zh', 'author', 'source_url', 'published_at', 'review_tier']
    .filter((key) => !String(payload[key] || '').trim());
  if (payload.source_key !== 'daily_brief' && !String(payload.title_en || '').trim()) missing.push('title_en');
  const requested = normalizeReviewTier(payload.review_tier);
  return {
    missing,
    quality,
    finalTier: requested ? maxTier(requested, quality.impliedTier) : null
  };
}

function cmdCheck(file) {
  const payload = readPayload(file);
  const result = localCheck(payload);
  print({
    ok: result.missing.length === 0 && result.quality.errors.length === 0,
    missing: result.missing,
    ratio: result.quality.ratio,
    errors: result.quality.errors,
    warnings: result.quality.warnings,
    finalTier: result.finalTier
  });
}

async function cmdSubmit(file, flags) {
  const payload = readPayload(file);
  const local = localCheck(payload);
  if (local.missing.length || local.quality.errors.length) {
    print({ ok: false, stage: 'local-check', missing: local.missing, errors: local.quality.errors });
    process.exit(2);
  }
  const body = { ...payload };
  delete body._meta;
  if (flags.dryRun) {
    print({ ok: true, dryRun: true, finalTier: local.finalTier, ratio: local.quality.ratio, warnings: local.quality.warnings });
    return;
  }
  const { status, body: result } = await api('/api/ingest', {
    method: 'POST',
    headers: flags.allowOld ? { 'X-Allow-Old': '1' } : {},
    body: JSON.stringify(body)
  });
  const ok = status === 200 && result.success === true;
  appendLog({ kind: 'submit', ok, status, title: payload.title_zh, url: payload.source_url, result });

  if (ok) {
    const state = readState();
    if (payload.source_key === 'daily_brief') {
      state.lastBriefDate = beijingDate();
      if (payload._meta?.zaraGeneratedAt) state.lastBriefZaraGeneratedAt = payload._meta.zaraGeneratedAt;
    }
    writeState(state);
    const tier = result.review_tier || payload.review_tier;
    if (tier === 'B' || tier === 'C') {
      const { apiBase } = loadEnv();
      const rule = tier === 'C' ? '不确认不会发布' : '4 小时内不处理将自动发布';
      notify([
        `**ReadWise 待确认（${tier} 档）**`,
        `《${payload.title_zh}》 — ${payload.author}`,
        result.review_note ? `原因：${result.review_note}` : '',
        `${rule}。到「我的 → 待主编确认」处理：${apiBase}`,
        `原文：${payload.source_url}`
      ].filter(Boolean).join('\n'));
    }
  }
  print({ ok, status, result });
  if (!ok && status !== 200) process.exit(3);
}

function cmdState() {
  print(readState());
}

function cmdMarkChecked(keys) {
  const state = readState();
  state.checked = state.checked || {};
  const now = new Date().toISOString();
  for (const key of keys) state.checked[key] = now;
  writeState(state);
  print({ updated: keys, at: now });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = {
    allowOld: rest.includes('--allow-old'),
    dryRun: rest.includes('--dry-run')
  };
  const args = rest.filter((arg) => !arg.startsWith('--'));
  switch (command) {
    case 'brief-source':
      return cmdBriefSource();
    case 'existing':
      return cmdExisting(args);
    case 'extract':
      return cmdExtract(args[0], args[1]);
    case 'check':
      return cmdCheck(args[0]);
    case 'submit':
      return cmdSubmit(args[0], flags);
    case 'notify':
      if (!notify(args.join(' '))) process.exit(4);
      return print({ ok: true });
    case 'state':
      return cmdState();
    case 'mark-checked':
      return cmdMarkChecked(args);
    default:
      print(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).join('\n'));
  }
}

main().catch((err) => fail(`[editor] ${err.stack || err.message}`));
