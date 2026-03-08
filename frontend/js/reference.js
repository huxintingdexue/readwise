import { postSearchReference } from './api.js';

let bannerNodes = null;
let pendingCandidate = null;

function ensureBanner() {
  if (bannerNodes) return bannerNodes;

  const banner = document.getElementById('referenceBanner');
  const text = document.getElementById('referenceBannerText');
  const addBtn = document.getElementById('referenceAddBtn');
  const dismissBtn = document.getElementById('referenceDismissBtn');

  bannerNodes = { banner, text, addBtn, dismissBtn };
  return bannerNodes;
}

export function hideReferenceBanner() {
  const nodes = ensureBanner();
  if (!nodes?.banner) return;
  nodes.banner.classList.add('hidden');
  nodes.text.textContent = '';
  pendingCandidate = null;
}

function showReferenceBanner(candidate, onAdd, onDismiss) {
  const nodes = ensureBanner();
  if (!nodes?.banner) return;

  nodes.text.textContent = `找到来源：${candidate.title || '未知标题'}`;
  nodes.banner.classList.remove('hidden');

  nodes.addBtn.onclick = onAdd;
  nodes.dismissBtn.onclick = onDismiss;
}

export async function searchReference({
  text,
  articleId,
  highlightId,
  showToast
}) {
  if (!text || !text.trim()) {
    showToast('请选择更完整的文字');
    return;
  }

  hideReferenceBanner();
  showToast('正在查引用...');

  try {
    const result = await postSearchReference({
      text,
      article_id: articleId,
      highlight_id: highlightId
    });

    if (result?.status === 'book_added') {
      const title = result?.entry?.title || '书籍';
      showToast(`《${title}》已加入书单`);
      return;
    }

    if (result?.status === 'article_found') {
      pendingCandidate = {
        candidate: result?.candidate,
        articleId,
        highlightId
      };

      showReferenceBanner(result.candidate, async () => {
        if (!pendingCandidate?.candidate) return;
        try {
          await postSearchReference({
            confirm_add: true,
            candidate: pendingCandidate.candidate,
            article_id: pendingCandidate.articleId,
            highlight_id: pendingCandidate.highlightId
          });
          showToast('已加入阅读列表');
          hideReferenceBanner();
        } catch (err) {
          showToast(err?.message || '加入失败，请稍后重试');
        }
      }, () => {
        hideReferenceBanner();
      });
      return;
    }

    showToast('未找到来源，请尝试更完整的文字');
  } catch (err) {
    showToast(err?.message || '引用识别失败，请稍后重试');
  }
}

export function initReferenceTestPanel(showToast) {
  const panel = document.getElementById('referenceTestPanel');
  const input = document.getElementById('referenceTestInput');
  const btn = document.getElementById('referenceTestBtn');
  if (!panel || !input || !btn) return;

  panel.classList.remove('hidden');
  btn.addEventListener('click', async () => {
    const text = input.value || '';
    if (!text.trim()) {
      showToast('请输入测试文本');
      return;
    }
    await searchReference({ text, articleId: null, highlightId: null, showToast });
  });
}
