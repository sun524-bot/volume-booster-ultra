// content.js - In-Page Web Audio Processing Engine (Zero-Latency Booster)
// v1.3.0 - Fix: Lazy AudioContext creation (browser autoplay policy compliance)

let audioCtx = null;
let gainNode = null;
let compressorNode = null;
const hookedElements = new WeakSet();

/**
 * Initializes the Web Audio API graph LAZILY.
 * MUST only be called from a user-gesture context (media play event or
 * popup message triggered by user click) to comply with browser autoplay policy.
 * Calling new AudioContext() without a prior user gesture throws:
 * "AudioContext was not allowed to start. It must be resumed after a user gesture."
 */
function initWebAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    audioCtx = new AudioContextClass();
    gainNode = audioCtx.createGain();
    compressorNode = audioCtx.createDynamicsCompressor();

    // Configure Anti-Clipping Dynamics Compressor
    compressorNode.threshold.setValueAtTime(-12, audioCtx.currentTime);
    compressorNode.knee.setValueAtTime(30, audioCtx.currentTime);
    compressorNode.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressorNode.attack.setValueAtTime(0.003, audioCtx.currentTime);
    compressorNode.release.setValueAtTime(0.25, audioCtx.currentTime);

    gainNode.connect(compressorNode);
    compressorNode.connect(audioCtx.destination);
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

/**
 * Discovers and connects all <video> and <audio> elements on the page.
 * Only call this AFTER a user gesture has occurred (autoplay policy requirement).
 */
function hookAllMedia() {
  if (!audioCtx || !gainNode) return; // Don't create AudioContext here — caller must ensure gesture

  const mediaElements = document.querySelectorAll('video, audio');
  mediaElements.forEach(media => {
    if (!hookedElements.has(media)) {
      try {
        const source = audioCtx.createMediaElementSource(media);
        source.connect(gainNode);
        hookedElements.add(media);
      } catch (err) {
        // Element may already be hooked or CORS restricted — ignore
      }
    }
  });
}

/**
 * Scan DOM for unhookable media elements and attach play-event listeners.
 * This runs eagerly (before user gesture) but only registers listeners —
 * it does NOT create an AudioContext itself (safe, no autoplay violation).
 */
function observeMediaElements() {
  const mediaElements = document.querySelectorAll('video, audio');
  mediaElements.forEach(media => {
    if (!hookedElements.has(media)) {
      // On first play, the user has made a gesture — safe to create AudioContext now
      media.addEventListener('play', () => {
        if (!audioCtx) {
          initWebAudio(); // Lazy init on first real user-initiated playback
        } else if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        hookAllMedia(); // Now safe to hook all discovered elements
      }, { passive: true });
    }
  });
}

// Observe DOM for dynamic media elements (YouTube player swaps, SPA navigation).
// Only registers play-event listeners — does NOT create AudioContext eagerly.
const domObserver = new MutationObserver(() => {
  observeMediaElements();
});

if (document.documentElement) {
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

// Scan for any media already in the DOM at injection time
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeMediaElements);
} else {
  observeMediaElements();
}

// Listen for gain adjustment messages from popup/background.
// These are always triggered by the user clicking in the popup — a valid user gesture.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_GET_MEDIA_STATUS') {
    const count = document.querySelectorAll('video, audio').length;
    sendResponse({
      count,
      hasAudioCtx: !!audioCtx,
      active: !!audioCtx && audioCtx.state === 'running'
    });
    return true;
  }

  if (message.type === 'PAGE_SET_GAIN') {
    // Popup click = user gesture: safe to create AudioContext now if not yet created
    if (!audioCtx) {
      initWebAudio();
    }
    hookAllMedia(); // Hook any newly discovered elements

    const mediaCount = document.querySelectorAll('video, audio').length;

    if (audioCtx && gainNode) {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const targetGain = message.isMuted ? 0 : message.gain;
      gainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.02);
      sendResponse({ success: true, gain: targetGain, active: true, mediaCount });
    } else {
      sendResponse({ success: false, reason: 'AudioContext unavailable — no user gesture yet', mediaCount });
    }
    return true;
  }

  // Bulk mute handler: silences the GainNode when chrome.tabs.update({ muted: true })
  // is called externally (chrome.tabs mute flag bypasses in-page AudioContext).
  if (message.type === 'PAGE_MUTE_TAB') {
    if (audioCtx && gainNode) {
      if (message.muted) {
        gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
      } else {
        const restoreGain = (typeof message.restoreGain === 'number') ? message.restoreGain : 1.0;
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        gainNode.gain.setTargetAtTime(restoreGain, audioCtx.currentTime, 0.02);
      }
    }
    sendResponse({ success: true });
    return true;
  }
});
