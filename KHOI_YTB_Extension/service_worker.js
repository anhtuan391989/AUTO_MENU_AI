const APP_ENDPOINT = 'http://127.0.0.1:8765/youtube';

async function postInfo(info) {
  if (!info || !/^[A-Za-z0-9_-]{11}$/.test(info.video_id || '')) return;
  try {
    await fetch(APP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
      cache: 'no-store'
    });
  } catch (_) { /* The desktop app may not be running yet. */ }
}

// Never synthesize playback state from chrome.tabs: tab metadata cannot tell
// whether the actual YouTube video is playing or provide its playhead.
async function requestPlayerState(tabId) {
  if (!Number.isInteger(tabId)) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'ht-request-youtube-state' });
  } catch (_) {
    // Content script may not be injected yet. It will publish on its next poll.
  }
}

async function inspectActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length && Number.isInteger(tabs[0].id))
      await requestPlayerState(tabs[0].id);
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'ht-youtube-state' || !sender.tab) return;
  postInfo(message.info || {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(tabs => {
      const active = tabs && tabs[0];
      if (active && active.id === tabId) requestPlayerState(tabId);
    }).catch(() => {});
  }
});
chrome.tabs.onActivated.addListener(activeInfo => requestPlayerState(activeInfo.tabId));
chrome.windows.onFocusChanged.addListener(() => inspectActiveTab());
chrome.alarms.create('ht-audio-youtube-watch', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => inspectActiveTab());
chrome.runtime.onInstalled.addListener(() => inspectActiveTab());
