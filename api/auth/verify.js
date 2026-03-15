import { getUserIdFromInviteCode } from '../_utils/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const inviteCode = req.body?.inviteCode || '';
  const userId = getUserIdFromInviteCode(inviteCode);

  if (!userId) {
    res.status(401).json({ success: false, message: '邀请码无效' });
    return;
  }

  res.status(200).json({ success: true, userId });
}
