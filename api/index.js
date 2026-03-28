import articles from './articles.js';
import highlights from './highlights.js';
import qa from './qa.js';
import readingList from './reading-list.js';
import readingProgress from './reading-progress.js';
import searchReference from './search-reference.js';
import exportHandler from './export.js';
import authVerify from './auth/verify.js';
import userRegister from './user/register.js';
import userGuest from './user/guest.js';
import userMigrate from './user/migrate.js';
import userMe from './user/me.js';
import userProfile from './user/profile.js';
import feedback from './feedback.js';
import events from './events.js';
import authors from './authors.js';
import adminStats from './admin/stats.js';
import adminInviteCodes from './admin/invite-codes.js';
import adminArticles from './admin/articles.js';
import ingest from './ingest.js';
import share from './share.js';

function getPathname(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return url.pathname;
}

export default async function handler(req, res) {
  const pathname = getPathname(req);

  if (pathname === '/api/articles' || pathname.startsWith('/api/articles/')) {
    return articles(req, res);
  }
  if (pathname === '/api/highlights') {
    return highlights(req, res);
  }
  if (pathname === '/api/qa') {
    return qa(req, res);
  }
  if (pathname === '/api/reading-list') {
    return readingList(req, res);
  }
  if (pathname === '/api/reading-progress') {
    return readingProgress(req, res);
  }
  if (pathname === '/api/search-reference') {
    return searchReference(req, res);
  }
  if (pathname === '/api/export') {
    return exportHandler(req, res);
  }
  if (pathname === '/api/auth/verify') {
    return authVerify(req, res);
  }
  if (pathname === '/api/user/register') {
    return userRegister(req, res);
  }
  if (pathname === '/api/user/guest') {
    return userGuest(req, res);
  }
  if (pathname === '/api/user/migrate') {
    return userMigrate(req, res);
  }
  if (pathname === '/api/user/me') {
    return userMe(req, res);
  }
  if (pathname === '/api/user/profile') {
    return userProfile(req, res);
  }
  if (pathname === '/api/feedback') {
    return feedback(req, res);
  }
  if (pathname === '/api/events') {
    return events(req, res);
  }
  if (pathname === '/api/authors') {
    return authors(req, res);
  }
  if (pathname === '/api/admin/stats') {
    return adminStats(req, res);
  }
  if (pathname === '/api/admin/invite-codes') {
    return adminInviteCodes(req, res);
  }
  if (pathname === '/api/admin/articles' || pathname.startsWith('/api/admin/articles/')) {
    return adminArticles(req, res);
  }
  if (pathname === '/api/ingest') {
    return ingest(req, res);
  }
  if (pathname.startsWith('/api/share/articles/')) {
    return share(req, res);
  }

  res.status(404).json({ error: 'not_found' });
}
