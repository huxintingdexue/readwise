const TAG_OPTIONS = ['科技', '商业', '产品', '个人成长'];

const TAG_PROMPT_PREFIX = '从以下四个标签中选择一个最匹配的，只返回标签名，不要其他内容：科技、商业、产品、个人成长。文章摘要：';

export function normalizeArticleTag(rawValue) {
  const text = String(rawValue || '').trim();
  if (!text) return null;
  const direct = TAG_OPTIONS.find((tag) => tag === text);
  if (direct) return direct;
  return TAG_OPTIONS.find((tag) => text.includes(tag)) || null;
}

export async function inferArticleTag(apiKey, summaryZh) {
  const normalizedSummary = String(summaryZh || '').trim();
  if (!apiKey || !normalizedSummary) return null;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `${TAG_PROMPT_PREFIX}${normalizedSummary}`
        }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content || '';
  return normalizeArticleTag(content);
}

