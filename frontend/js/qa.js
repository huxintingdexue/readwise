let modalNodes = null;
let chatHistory = [];
let conversationHistory = [];
let conversationRound = 0;

const LIMIT_MESSAGE = `不好意思，产品内测阶段，每次对话最多只支持10轮交互。
如果有更多需求可以联系开发者Guang（微信huxinting0725）`;

// Resize a textarea to fit its content.
// Setting height to '1px' first forces the browser to recalculate scrollHeight
// from scratch (avoids stale values from a previous larger height).
function autoResize(el, minH = 40) {
  el.style.height = '1px';
  el.style.height = Math.max(minH, el.scrollHeight) + 'px';
}

function trimHistory() {
  if (chatHistory.length <= 10) return;
  chatHistory = chatHistory.slice(chatHistory.length - 10);
}

function buildChatBubble(role, text, isThinking = false) {
  const bubble = document.createElement('div');
  bubble.className = `qa-bubble ${role}${isThinking ? ' thinking' : ''}`;
  bubble.textContent = text;
  return bubble;
}

function buildModal() {
  const modal = document.createElement('div');
  modal.id = 'qaModal';
  modal.className = 'qa-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="qa-sheet">
      <div class="qa-sheet-head">
        <strong>AI 问答</strong>
        <button id="qaCloseBtn" type="button" aria-label="关闭">✕</button>
      </div>
      <div id="qaChatBody" class="qa-chat-body"></div>
      <div class="qa-input-bar">
        <textarea id="qaQuestionInput" rows="1" placeholder="输入你的问题..."></textarea>
        <button id="qaSubmitBtn" type="button">发送</button>
      </div>
      <div id="qaError" class="qa-error"></div>
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
  const chatBody = modal.querySelector('#qaChatBody');
  const errorText = modal.querySelector('#qaError');

  // On Android WebView, tapping the send button while the keyboard is open causes:
  //   textarea blur → keyboard closes → viewport/layout shifts → click misses the button.
  // Using touchend + preventDefault bypasses the entire blur/layout-shift cycle:
  // the button receives touchend before the keyboard has a chance to dismiss,
  // and we call the submit handler directly without waiting for a click event.
  submitBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!submitBtn.disabled && modalNodes?._submitFn) {
      modalNodes._submitFn();
    }
  }, { passive: false });

  // Prevent the QA chat scroll from bleeding into the background article.
  // Touches inside the chat body scroll the chat; everywhere else (sheet header,
  // input bar, backdrop) is locked down.
  modal.addEventListener('touchmove', (e) => {
    if (!e.target.closest('.qa-chat-body')) {
      e.preventDefault();
    }
  }, { passive: false });

  // Auto-resize as the user types so the textarea always fits its content.
  questionInput.addEventListener('input', () => autoResize(questionInput));

  modalNodes = { modal, closeBtn, submitBtn, questionInput, chatBody, errorText, _submitFn: null };
  return modalNodes;
}

export function openQaModal({ selectionText, onSubmit }) {
  const nodes = ensureModal();
  nodes.errorText.textContent = '';
  nodes.questionInput.value = selectionText || '';
  nodes.chatBody.innerHTML = '';
  chatHistory = [];
  conversationHistory = [];
  conversationRound = 0;
  nodes.modal.classList.remove('hidden');
  // Lock background scroll while the modal is open
  document.body.style.overflow = 'hidden';

  // Auto-size the textarea after the modal is rendered, then focus (shows keyboard)
  // so the user can immediately continue typing after the pre-filled selection.
  requestAnimationFrame(() => {
    autoResize(nodes.questionInput);
    if (selectionText) {
      nodes.questionInput.focus();
      // Move cursor to end of pre-filled text
      const len = nodes.questionInput.value.length;
      nodes.questionInput.setSelectionRange(len, len);
    }
  });

  nodes.closeBtn.onclick = () => {
    nodes.modal.classList.add('hidden');
    nodes.chatBody.innerHTML = '';
    chatHistory = [];
    conversationHistory = [];
    conversationRound = 0;
    document.body.style.overflow = '';
  };

  async function handleSubmit() {
    const question = nodes.questionInput.value.trim();
    if (!question) {
      nodes.errorText.textContent = '请输入问题';
      return;
    }

    nodes.errorText.textContent = '';
    nodes.questionInput.value = '';
    nodes.questionInput.style.height = '40px'; // reset to single-line height
    nodes.questionInput.blur(); // dismiss keyboard on Android after sending

    if (conversationRound >= 10) {
      const limitBubble = buildChatBubble('ai', LIMIT_MESSAGE);
      nodes.chatBody.appendChild(limitBubble);
      nodes.chatBody.scrollTop = nodes.chatBody.scrollHeight;
      return;
    }

    nodes.submitBtn.disabled = true;
    let thinkingBubble = null;
    try {
      const userBubble = buildChatBubble('user', question);
      nodes.chatBody.appendChild(userBubble);

      thinkingBubble = buildChatBubble('ai', '思考中', true);
      nodes.chatBody.appendChild(thinkingBubble);
      nodes.chatBody.scrollTop = nodes.chatBody.scrollHeight;

      const answer = await onSubmit({
        selectedText: selectionText || '',
        question,
        history: conversationHistory.slice()
      });
      thinkingBubble.classList.remove('thinking');
      thinkingBubble.textContent = answer || '（暂无回答）';
      conversationRound += 1;
      conversationHistory.push({ role: 'user', content: question });
      conversationHistory.push({ role: 'assistant', content: answer || '（暂无回答）' });
      chatHistory.push({ role: 'user', text: question });
      chatHistory.push({ role: 'ai', text: answer || '（暂无回答）' });
      trimHistory();
      nodes.chatBody.scrollTop = nodes.chatBody.scrollHeight;
    } catch (err) {
      nodes.errorText.textContent = err?.message || '提交失败';
      if (thinkingBubble) {
        thinkingBubble.classList.remove('thinking');
        thinkingBubble.textContent = '（回答失败）';
      }
    } finally {
      nodes.submitBtn.disabled = false;
    }
  }

  nodes._submitFn = handleSubmit;
  nodes.submitBtn.onclick = handleSubmit;
}
