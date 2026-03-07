function formatDate(isoString) {
  if (!isoString) return '未知时间';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '未知时间';
  return d.toLocaleString('zh-CN', { hour12: false });
}

function escapeHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderReader(detail, nodes) {
  const { readerView, readerTitle, readerMeta, readerContent, listPanels } = nodes;
  listPanels.forEach((el) => el.classList.add('hidden'));
  readerView.classList.remove('hidden');

  readerTitle.textContent = detail.title_zh || detail.title_en || '未命名文章';
  readerMeta.textContent = `${detail.source_key || 'unknown'} · ${formatDate(detail.published_at)}`;

  if (detail.content_zh && detail.content_zh.trim()) {
    readerContent.innerHTML = `<p>${escapeHtml(detail.content_zh).replace(/\n/g, '<br/>')}</p>`;
    return;
  }

  if (detail.content_en && detail.content_en.trim()) {
    readerContent.innerHTML = detail.content_en;
    return;
  }

  readerContent.innerHTML = `<p>${escapeHtml(detail.content_plain || '暂无内容').replace(/\n/g, '<br/>')}</p>`;
}

export function closeReader(nodes) {
  const { readerView, listPanels } = nodes;
  readerView.classList.add('hidden');
  listPanels.forEach((el) => el.classList.remove('hidden'));
}
