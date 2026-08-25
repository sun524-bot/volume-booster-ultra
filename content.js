// content.js - In-Page Web Audio Processing Engine (Zero-Latency Booster)

let audioCtx = null;
let gainNode = null;
let compressorNode = null;
const hookedElements = new WeakSet();

/**
 * Initializes the Web Audio API graph inside the webpage.
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
 */
function hookAllMedia() {
  initWebAudio();
  if (!audioCtx || !gainNode) return;

  const mediaElements = document.querySelectorAll('video, audio');
  mediaElements.forEach(media => {
    if (!hookedElements.has(media)) {
      try {
        const source = audioCtx.createMediaElementSource(media);
        source.connect(gainNode);
        hookedElements.add(media);

        // Resume AudioContext on playback start
        media.addEventListener('play', () => {
          if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
          }
        }, { passive: true });
      } catch (err) {
        // Element may already be hooked or CORS restricted
      }
    }
  });
}

// Observe DOM for dynamic media elements (YouTube player swaps, SPA navigation)
const domObserver = new MutationObserver(() => {
  hookAllMedia();
});

if (document.documentElement) {
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

// Initial hook
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hookAllMedia);
} else {
  hookAllMedia();
}

// User interaction unlocks AudioContext if blocked by autoplay policy
window.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}, { once: true, passive: true });

// Listen for gain adjustment messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_SET_GAIN') {
    hookAllMedia();

    if (audioCtx && gainNode) {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const targetGain = message.isMuted ? 0 : message.gain;
      // Smooth exponential/linear ramp
      gainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.02);
      sendResponse({ success: true, gain: targetGain, active: true });
    } else {
      sendResponse({ success: false, reason: 'No AudioContext' });
    }
    return true;
  }
});
