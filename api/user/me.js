import { ensureUsersTable, getUserByUid, getUserIdFromInviteCode, resolveAuthContext } from '../_utils/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    await ensureUsersTable();
    const ctx = await resolveAuthContext(req, res);
    if (!ctx) return;

    let user = ctx.user;
    if (!user && ctx.uid) {
      user = await getUserByUid(ctx.uid);
    }

    if (!user) {
      const inviteCode = String(req.headers['x-invite-code'] || '').trim();
      if (inviteCode) {
        const legacyUserId = await getUserIdFromInviteCode(inviteCode);
        if (legacyUserId) {
          res.status(200).json({
            success: true,
            data: {
              uid: null,
              userId: legacyUserId,
              nickname: null,
              contact: null,
              source: 'manual_invite',
              inviteCode
            }
          });
          return;
        }
      }
    }

    if (!user) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        uid: user.id,
        userId: ctx.userId,
        nickname: user.nickname || null,
        contact: user.contact || null,
        source: user.source || 'self_register',
        inviteCode: user.invite_code || null
      }
    });
  } catch (err) {
    console.error('[api/user/me] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
