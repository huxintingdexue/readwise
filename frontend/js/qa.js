let modalNodes = null;

function buildModal() {
  const modal = document.createElement('div');
  modal.id = 'qaModal';
  modal.className = 'qa-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="qa-card">
      <div class="qa-card-head">
        <strong>提问</strong>
        <button id="qaCloseBtn" type="button">关闭</button>
      </div>
      <div class="qa-card-body">
        <p class="qa-label">选中文本</p>
        <div id="qaContextPreview" class="qa-context"></div>
        <label class="qa-label" for="qaQuestionInput">你的问题</label>
        <textarea id="qaQuestionInput" rows="3" placeholder="输入你的问题..."></textarea>
        <div id="qaError" class="qa-error"></div>
      </div>
      <div class="qa-card-actions">
        <button id="qaSubmitBtn" type="button">提交</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function ensureModal() {
  if (modalNodes) return modalNodes;

  let modal = document.getElementById('qaModal');
  if (!modal) {
    modal = buildModal();
  }

  const closeBtn = modal.querySelector('#qaCloseBtn');
  const submitBtn = modal.querySelector('#qaSubmitBtn');
  const questionInput = modal.querySelector('#qaQuestionInput');
  const contextPreview = modal.querySelector('#qaContextPreview');
  const errorText = modal.querySelector('#qaError');

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
