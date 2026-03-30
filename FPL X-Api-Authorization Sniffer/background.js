const TARGET_HEADER = 'x-api-authorization';
const APP_ORIGIN = 'http://localhost:8000';
let lastToken = null;

async function pushTokenToApp(token) {
  try {
    await fetch(`${APP_ORIGIN}/api/admin/set-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token })
    });
  } catch {
    // app not running, ignore
  }
}

// Utility: ensure content.js is present in a tab, then send a message
async function sendToTab(tabId, msg) {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    // Likely "Receiving end does not exist" -> inject then retry once
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, msg);
    } catch (e2) {
      // Give up silently
      console.warn('[FPL Sniffer] Could not message tab', tabId, e2);
    }
  }
}

// Broadcast to all FPL tabs (used when details.tabId is -1)
async function broadcastToFplTabs(msg) {
  const tabs = await chrome.tabs.query({ url: "https://fantasy.premierleague.com/*" });
  await Promise.all(tabs.map(t => sendToTab(t.id, msg)));
}

// Listen for outgoing request headers
chrome.webRequest.onBeforeSendHeaders.addListener(
  async (details) => {
    if (!details.requestHeaders) return;

    const h = details.requestHeaders.find(x => x.name.toLowerCase() === TARGET_HEADER);
    if (!h || !h.value) return;

    const token = h.value;
    if (token === lastToken) return; // de-dupe a bit

    lastToken = token;
    await chrome.storage.local.set({ lastToken: token, lastSeenUrl: details.url, lastAt: Date.now() });
    pushTokenToApp(token);

    // Visual badge ping
    if (chrome.action?.setBadgeText) {
      chrome.action.setBadgeBackgroundColor({ color: '#000' });
      chrome.action.setBadgeText({ text: 'TOK' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
    }

    // Deliver token to page (for clipboard + toast)
    if (details.tabId && details.tabId >= 0) {
      await sendToTab(details.tabId, { type: 'copy-token', token });
    } else {
      // No tabId (service worker / prefetch) -> broadcast
      await broadcastToFplTabs({ type: 'copy-token', token });
    }

    // Log in SW console
    console.log('[FPL Sniffer] Token captured from', details.url, '\n', token);
  },
  { urls: ["https://fantasy.premierleague.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

// Click the extension icon to copy the last token again
chrome.action.onClicked.addListener(async (tab) => {
  const { lastToken: token } = await chrome.storage.local.get('lastToken');
  if (!token) {
    console.warn('[FPL Sniffer] No token captured yet');
    return;
  }
  if (tab && tab.id) {
    await sendToTab(tab.id, { type: 'copy-token', token, replay: true });
  } else {
    await broadcastToFplTabs({ type: 'copy-token', token, replay: true });
  }
});