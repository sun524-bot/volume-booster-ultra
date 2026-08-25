// background.js - Background Service Worker for Volume Booster Ultra (Manifest V3)

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// Maintain creating offscreen document promise to prevent race conditions
let creatingOffscreenPromise = null;
let isAutoSoloEnabled = false;

// Initialize Auto Solo setting from storage
chrome.storage.local.get(['autoSoloEnabled'], (res) => {
  isAutoSoloEnabled = !!res.autoSoloEnabled;
});

/**
 * Ensures the offscreen document is open and ready for Web Audio processing.
 */
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: 'Capturing and processing tab audio stream with Web Audio API for volume amplification and dynamic compression.'
  });

  try {
    await creatingOffscreenPromise;
  } finally {
    creatingOffscreenPromise = null;
  }
}

/**
 * Updates the action badge on the toolbar icon.
 */
function updateBadge(tabId, gain, isMuted = false) {
  if (!tabId) return;

  if (isMuted) {
    chrome.action.setBadgeText({ tabId, text: 'MUT' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#64748b' });
    return;
  }

  if (gain === 1.0 || gain === undefined || gain === null) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  const percent = Math.round(gain * 100);
  chrome.action.setBadgeText({ tabId, text: `${percent}%` });

  let badgeColor = '#10b981'; // Green (100%-200%)
  if (percent > 400) {
    badgeColor = '#ef4444'; // Red (401%-600%)
  } else if (percent > 200) {
    badgeColor = '#f59e0b'; // Amber (201%-400%)
  } else if (percent < 100) {
    badgeColor = '#06b6d4'; // Cyan (<100%)
  }

  chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor });
}

// -------------------------------------------------------------
// Multi-Tab & Multi-Window Muting Helper Functions
// -------------------------------------------------------------

/**
 * Mutes all tabs in the active window except the active tab.
 */
async function muteOthersInWindow(activeTabId, windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  for (const tab of tabs) {
    if (tab.id !== activeTabId && tab.id) {
      chrome.tabs.update(tab.id, { muted: true }).catch(() => {});
    }
  }
  if (activeTabId) {
    chrome.tabs.update(activeTabId, { muted: false }).catch(() => {});
  }
}

/**
 * Mutes all tabs across all browser windows except the active tab.
 */
async function muteOthersAllWindows(activeTabId) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== activeTabId && tab.id) {
      chrome.tabs.update(tab.id, { muted: true }).catch(() => {});
    }
  }
  if (activeTabId) {
    chrome.tabs.update(activeTabId, { muted: false }).catch(() => {});
  }
}

/**
 * Mutes all open tabs across all windows.
 */
async function muteAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.update(tab.id, { muted: true }).catch(() => {});
    }
  }
}

/**
 * Unmutes all open tabs across all windows.
 */
async function unmuteAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.update(tab.id, { muted: false }).catch(() => {});
    }
  }
}

/**
 * Returns all currently audible or boosted tabs across all windows.
 */
async function getAudibleTabs() {
  const allTabs = await chrome.tabs.query({});
  const audibleTabs = allTabs.filter(tab => tab.audible || (tab.mutedInfo && tab.mutedInfo.muted));
  
  return audibleTabs.map(t => ({
    id: t.id,
    title: t.title || 'Untitled Tab',
    url: t.url || '',
    favIconUrl: t.favIconUrl || '',
    audible: !!t.audible,
    isMuted: !!(t.mutedInfo && t.mutedInfo.muted),
    windowId: t.windowId
  }));
}

// -------------------------------------------------------------
// Auto Solo Focus Mode Listeners
// -------------------------------------------------------------
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!isAutoSoloEnabled) return;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && (tab.audible || tab.url.includes('youtube') || tab.url.includes('spotify'))) {
      muteOthersAllWindows(activeInfo.tabId);
    }
  } catch (e) {
    console.debug('Auto solo tab activation check:', e);
  }
});

// -------------------------------------------------------------
// Global Keyboard Shortcut Command Listener
// -------------------------------------------------------------
chrome.commands.onCommand.addListener(async (command) => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTabId = activeTab ? activeTab.id : null;
  const activeWindowId = activeTab ? activeTab.windowId : null;

  if (command === 'mute_others_window') {
    if (activeTabId && activeWindowId) {
      await muteOthersInWindow(activeTabId, activeWindowId);
    }
  } else if (command === 'unmute_all') {
    await unmuteAllTabs();
  }
});

// -------------------------------------------------------------
// IPC Message Listener
// -------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'background') return false;

  (async () => {
    try {
      switch (message.type) {
        case 'INIT_TAB_STREAM': {
          const { tabId, gain, isMuted } = message.data;
          await ensureOffscreenDocument();

          const streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: tabId
          });

          const response = await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'START_CAPTURE',
            data: { tabId, streamId, gain, isMuted }
          });

          updateBadge(tabId, isMuted ? 0 : gain, isMuted);
          sendResponse({ success: true, response });
          break;
        }

        case 'SET_GAIN': {
          const { tabId, gain, isMuted } = message.data;
          await ensureOffscreenDocument();

          await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'SET_GAIN',
            data: { tabId, gain, isMuted }
          });

          updateBadge(tabId, gain, isMuted);
          sendResponse({ success: true });
          break;
        }

        case 'STOP_CAPTURE': {
          const { tabId } = message.data;
          await ensureOffscreenDocument();

          await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'STOP_CAPTURE',
            data: { tabId }
          });

          updateBadge(tabId, 1.0, false);
          sendResponse({ success: true });
          break;
        }

        case 'GET_STATUS': {
          const { tabId } = message.data;
          await ensureOffscreenDocument();

          const status = await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'GET_STATUS',
            data: { tabId }
          });

          sendResponse({ success: true, status });
          break;
        }

        // Multi-Tab Audio Manager Actions
        case 'MUTE_OTHERS_WINDOW': {
          const { tabId, windowId } = message.data;
          await muteOthersInWindow(tabId, windowId);
          sendResponse({ success: true });
          break;
        }

        case 'MUTE_OTHERS_ALL_WINDOWS': {
          const { tabId } = message.data;
          await muteOthersAllWindows(tabId);
          sendResponse({ success: true });
          break;
        }

        case 'MUTE_ALL_TABS': {
          await muteAllTabs();
          sendResponse({ success: true });
          break;
        }

        case 'UNMUTE_ALL_TABS': {
          await unmuteAllTabs();
          sendResponse({ success: true });
          break;
        }

        case 'GET_AUDIBLE_TABS': {
          const tabs = await getAudibleTabs();
          sendResponse({ success: true, tabs });
          break;
        }

        case 'TOGGLE_TAB_MUTE': {
          const { tabId, muted } = message.data;
          await chrome.tabs.update(tabId, { muted });
          sendResponse({ success: true });
          break;
        }

        case 'SET_AUTO_SOLO': {
          const { enabled } = message.data;
          isAutoSoloEnabled = !!enabled;
          await chrome.storage.local.set({ autoSoloEnabled: isAutoSoloEnabled });
          sendResponse({ success: true, isAutoSoloEnabled });
          break;
        }

        default:
          sendResponse({ error: `Unknown message type: ${message.type}` });
      }
    } catch (error) {
      console.error('[Background Worker Error]', error);
      sendResponse({ error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });

    if (existingContexts.length > 0) {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'CLEANUP_TAB',
        data: { tabId }
      }).catch(() => {});
    }

    chrome.storage.local.remove([`tab_${tabId}`]).catch(() => {});
  } catch (e) {
    console.debug('Tab removal cleanup error:', e);
  }
});
