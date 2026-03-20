import { ensureUsersTable, getUserByInviteCode } from '../_utils/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const inviteCode = String(req.body?.inviteCode || '').trim();
  if (!inviteCode) {
    res.status(400).json({ success: false, error: 'bad_request', message: 'inviteCode is required' });
    return;
  }

  try {
    await ensureUsersTable();
    const user = await getUserByInviteCode(inviteCode);
    if (!user?.id) {
      res.status(404).json({ success: false, error: 'not_found', message: '邀请码不存在' });
      return;
    }
    res.status(200).json({ success: true, data: { uid: user.id } });
  } catch (err) {
    console.error('[api/user/migrate] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
