import dotenv from 'dotenv';
import { Pool } from 'pg';
import { resolveUserId, getClientIp } from './_utils/auth.js';

dotenv.config({ path: '.env.local' });

const VALID_EVENTS = new Set(['open_app', 'open_article', 'finish_article']);
const POSTHOG_API_KEY = String(process.env.POSTHOG_API_KEY || '').trim();
const POSTHOG_HOST = String(process.env.POSTHOG_HOST || '').trim().replace(/\/+$/, '');
const IS_PRODUCTION_ENV = String(process.env.VERCEL_ENV || '').trim() === 'production';

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.NEON_DATABASE_URL;
    if (!connectionString) {
      throw new Error('Missing NEON_DATABASE_URL');
    }
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

async function getUserId(req, res) {
  return resolveUserId(req, res);
}

async function ensureTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50),
      client_ip TEXT,
      event VARCHAR(50),
      article_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await getPool().query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS client_ip TEXT
  `);
  // Older environments created article_id as integer/uuid; normalize to text for compatibility.
  await getPool().query(`
    ALTER TABLE events
    ALTER COLUMN article_id TYPE TEXT
    USING article_id::text
  `);
}

async function sendToPostHog({ userId, clientIp, event, articleId }) {
  if (!IS_PRODUCTION_ENV) return;
  if (!POSTHOG_API_KEY || !POSTHOG_HOST) return;
  const endpoint = `${POSTHOG_HOST}/capture/`;
  const distinctId = String(userId || '').trim() || String(clientIp || '').trim() || 'anonymous';
  const payload = {
    api_key: POSTHOG_API_KEY,
    event,
    distinct_id: distinctId,
    properties: {
      distinct_id: distinctId,
      user_id: userId || null,
      article_id: articleId || null,
      client_ip: clientIp || null,
      source: 'readwise-web'
    }
  };
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('[api/events] posthog capture failed', err?.message || err);
  }
}

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const event = String(req.body?.event || '').trim();
    const articleId = req.body?.article_id || null;
    if (!VALID_EVENTS.has(event)) {
      res.status(200).json({ success: false });
      return;
    }

    await ensureTable();
    const clientIp = getClientIp(req) || null;
    await getPool().query(
      'INSERT INTO events (user_id, client_ip, event, article_id) VALUES ($1, $2, $3, $4)',
      [userId, clientIp, event, articleId]
    );
    sendToPostHog({ userId, clientIp, event, articleId });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[api/events] error', err);
    res.status(200).json({ success: false });
  }
}
