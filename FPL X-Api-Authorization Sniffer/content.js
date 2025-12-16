function showToast(msg) {
  const div = document.createElement('div');
  div.textContent = msg;
  Object.assign(div.style, {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    zIndex: 2147483647,
    background: '#0f172a',
    color: '#fff',
    padding: '8px 10px',
    borderRadius: '8px',
    font: '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
    opacity: '0.95'
  });
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1800);
}

async function copyToken(token) {
  try {
    await navigator.clipboard.writeText(token);
    showToast('✅ FPL token copied');
  } catch {
    showToast('📋 Copy manual');
    prompt('Copy token:', token);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'copy-token') return;
  copyToken(msg.token);
});