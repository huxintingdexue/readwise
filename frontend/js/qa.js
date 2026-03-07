let modalNodes = null;

function ensureModal() {
  if (modalNodes) return modalNodes;

  const modal = document.getElementById('qaModal');
  const closeBtn = document.getElementById('qaCloseBtn');
  const submitBtn = document.getElementById('qaSubmitBtn');
  const questionInput = document.getElementById('qaQuestionInput');
  const contextPreview = document.getElementById('qaContextPreview');
  const errorText = document.getElementById('qaError');

  modalNodes = { modal, closeBtn, submitBtn, questionInput, contextPreview, errorText };
  return modalNodes;
}

export function openQaModal({ selectionText, contextText, onSubmit }) {
  const nodes = ensureModal();
  nodes.contextPreview.textContent = selectionText || '';
  nodes.errorText.textContent = '';
  nodes.questionInput.value = '';
  nodes.modal.classList.remove('hidden');

  nodes.closeBtn.onclick = () => {
    nodes.modal.classList.add('hidden');
  };

  nodes.submitBtn.onclick = async () => {
    const question = nodes.questionInput.value.trim();
    if (!question) {
      nodes.errorText.textContent = '请输入问题';
      return;
    }

    nodes.errorText.textContent = '';
    nodes.submitBtn.disabled = true;
    try {
      await onSubmit(question, contextText);
      nodes.modal.classList.add('hidden');
    } catch (err) {
      nodes.errorText.textContent = err?.message || '提交失败';
    } finally {
      nodes.submitBtn.disabled = false;
    }
  };
}
