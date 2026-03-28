import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const VALID_EVENTS = new Set(['open_app', 'open_article', 'finish_article']);
const POSTHOG_API_KEY = String(process.env.POSTHOG_API_KEY || '').trim();
const POSTHOG_HOST = String(process.env.POSTHOG_HOST || '').trim().replace(/\/+$/, '');
const NEON_DATABASE_URL = String(process.env.NEON_DATABASE_URL || '').trim();

const DAYS = Number.parseInt(process.env.POSTHOG_BACKFILL_DAYS || '7', 10);
const BATCH_SIZE = Number.parseInt(process.env.POSTHOG_BACKFILL_BATCH || '100', 10);
const CONCURRENCY = Number.parseInt(process.env.POSTHOG_BACKFILL_CONCURRENCY || '2', 10);
const MAX_RETRIES = Number.parseInt(process.env.POSTHOG_BACKFILL_RETRIES || '4', 10);
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.POSTHOG_BACKFILL_TIMEOUT_MS || '12000', 10);

if (!POSTHOG_API_KEY || !POSTHOG_HOST) {
  console.error('[backfill-posthog] Missing POSTHOG_API_KEY or POSTHOG_HOST');
  process.exit(1);
}
if (!NEON_DATABASE_URL) {
  console.error('[backfill-posthog] Missing NEON_DATABASE_URL');
  process.exit(1);
}
if (!Number.isFinite(DAYS) || DAYS <= 0) {
  console.error('[backfill-posthog] POSTHOG_BACKFILL_DAYS must be a positive number');
  process.exit(1);
}

const pool = new Pool({
  connectionString: NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function splitBatches(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function captureEvent(row) {
  const distinctId = String(row.user_id || '').trim() || String(row.client_ip || '').trim() || `anonymous-${row.id}`;
  const articleTitle = row.title_zh || row.title_en || null;
  const eventTimestamp = toIso(row.created_at);
  const payload = {
    api_key: POSTHOG_API_KEY,
    event: row.event,
    distinct_id: distinctId,
    timestamp: eventTimestamp,
    properties: {
      distinct_id: distinctId,
      user_id: row.user_id || null,
      article_id: row.article_id || null,
      client_ip: row.client_ip || null,
      source: 'readwise-web-backfill-v2',
      backfill: true,
      backfill_version: 'v2',
      source_key: row.source_key || null,
      article_title: articleTitle
    }
  };

  const endpoint = `${POSTHOG_HOST}/capture/`;
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 280)}` : ''}`);
      }
      clearTimeout(timeoutId);
      return;
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt >= MAX_RETRIES) {
        throw err;
      }
      const backoffMs = 400 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      attempt += 1;
    }
  }
}

async function run() {
  const now = new Date();
  const start = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const endIso = now.toISOString();

  console.log(`[backfill-posthog] Start backfill, window: ${startIso} -> ${endIso}`);
  console.log(
    `[backfill-posthog] Config: days=${DAYS}, batch=${BATCH_SIZE}, concurrency=${CONCURRENCY}, retries=${MAX_RETRIES}, timeout_ms=${FETCH_TIMEOUT_MS}`
  );

  const { rows } = await pool.query(
    `
      SELECT
        e.id,
        e.user_id,
        e.client_ip,
        e.event,
        e.article_id::text AS article_id,
        e.created_at,
        a.source_key,
        a.title_zh,
        a.title_en
      FROM events e
      LEFT JOIN articles a ON a.id::text = e.article_id::text
      WHERE e.created_at >= $1
        AND e.created_at <= $2
        AND e.event = ANY($3::text[])
      ORDER BY e.created_at ASC, e.id ASC
    `,
    [startIso, endIso, Array.from(VALID_EVENTS)]
  );

  console.log(`[backfill-posthog] Found ${rows.length} events to send`);
  if (!rows.length) return;

  let success = 0;
  let failed = 0;
  const batches = splitBatches(rows, BATCH_SIZE);

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    for (let j = 0; j < batch.length; j += CONCURRENCY) {
      const chunk = batch.slice(j, j + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map((row) => captureEvent(row)));
      for (let k = 0; k < results.length; k += 1) {
        const result = results[k];
        if (result.status === 'fulfilled') {
          success += 1;
        } else {
          failed += 1;
          console.warn(
            `[backfill-posthog] send failed: id=${chunk[k]?.id || 'unknown'} reason=${result.reason?.message || result.reason}`
          );
        }
      }
    }
    console.log(`[backfill-posthog] Batch ${i + 1}/${batches.length} done`);
  }

  console.log(`[backfill-posthog] Completed. total=${rows.length}, success=${success}, failed=${failed}`);
}

run()
  .catch((err) => {
    console.error('[backfill-posthog] Fatal error:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
