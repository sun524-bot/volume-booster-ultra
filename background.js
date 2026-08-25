// background.js - Background Service Worker for Volume Booster Ultra (Manifest V3)

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// Maintain creating offscreen document promise to prevent race conditions
let creatingOffscreenPromise = null;

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

// Listen for messages from popup or offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'background') return false;

  (async () => {
    try {
      switch (message.type) {
        case 'INIT_TAB_STREAM': {
          const { tabId, gain, isMuted } = message.data;
          await ensureOffscreenDocument();

          // Get media stream ID for the target tab
          const streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: tabId
          });

          // Forward to offscreen document to initiate Web Audio node graph
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

          // Pass directly to offscreen processor
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

    // Clean stored state for this tab
    chrome.storage.local.remove([`tab_${tabId}`]).catch(() => {});
  } catch (e) {
    console.debug('Tab removal cleanup error:', e);
  }
});
