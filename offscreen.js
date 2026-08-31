// offscreen.js - Web Audio API Processing Engine in Offscreen Document

const tabSessions = new Map();

/**
 * Creates and initializes the audio graph for a tab stream.
 */
async function startCapture(tabId, streamId, gain = 1.0, isMuted = false) {
  // If already active, cleanup first
  if (tabSessions.has(tabId)) {
    stopCapture(tabId);
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    
    // Create Audio Nodes
    const sourceNode = audioCtx.createMediaStreamSource(stream);
    const gainNode = audioCtx.createGain();
    const compressorNode = audioCtx.createDynamicsCompressor();
    const analyserNode = audioCtx.createAnalyser();

    // Configure Dynamics Compressor (Anti-Clipping & Distortion Prevention)
    compressorNode.threshold.setValueAtTime(-12, audioCtx.currentTime); // dB
    compressorNode.knee.setValueAtTime(30, audioCtx.currentTime);       // dB
    compressorNode.ratio.setValueAtTime(12, audioCtx.currentTime);      // Compression ratio
    compressorNode.attack.setValueAtTime(0.003, audioCtx.currentTime);  // 3ms attack
    compressorNode.release.setValueAtTime(0.25, audioCtx.currentTime);  // 250ms release

    // Configure Analyser for Visualizer VU meters
    analyserNode.fftSize = 64;
    analyserNode.smoothingTimeConstant = 0.8;

    // Set Initial Gain
    const targetGain = isMuted ? 0 : gain;
    gainNode.gain.setValueAtTime(targetGain, audioCtx.currentTime);

    // Build Single-Output Pipeline (Zero-Echo):
    // Source -> Gain -> Compressor -> Analyser -> audioCtx.destination
    sourceNode.connect(gainNode);
    gainNode.connect(compressorNode);
    compressorNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    // Save session
    tabSessions.set(tabId, {
      audioCtx,
      stream,
      sourceNode,
      gainNode,
      compressorNode,
      analyserNode,
      gain,
      isMuted
    });

    // Handle stream end event
    stream.getAudioTracks().forEach(track => {
      track.onended = () => {
        stopCapture(tabId);
      };
    });

    return { success: true, tabId };
  } catch (error) {
    console.error(`[Offscreen] Failed to start tab ${tabId} capture:`, error);
    throw error;
  }
}

/**
 * Smoothly updates gain without audio pops or clicks.
 */
function setGain(tabId, gain, isMuted = false) {
  const session = tabSessions.get(tabId);
  if (!session) return false;

  session.gain = gain;
  session.isMuted = isMuted;

  if (session.audioCtx.state === 'suspended') {
    session.audioCtx.resume().catch(() => {});
  }

  const targetVal = isMuted ? 0 : gain;
  session.gainNode.gain.setTargetAtTime(targetVal, session.audioCtx.currentTime, 0.02);
  return true;
}

/**
 * Stops audio capture and frees audio context resources.
 */
function stopCapture(tabId) {
  const session = tabSessions.get(tabId);
  if (!session) return false;

  try {
    if (session.stream) {
      session.stream.getTracks().forEach(track => track.stop());
    }
    if (session.audioCtx && session.audioCtx.state !== 'closed') {
      session.audioCtx.close();
    }
  } catch (e) {
    console.warn(`Error closing audio context for tab ${tabId}:`, e);
  }

  tabSessions.delete(tabId);
  return true;
}

/**
 * Returns the current audio peak levels for visualizer rendering.
 */
function getAudioLevels(tabId) {
  const session = tabSessions.get(tabId);
  if (!session || !session.analyserNode) {
    return { active: false, levels: [] };
  }

  const bufferLength = session.analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  session.analyserNode.getByteFrequencyData(dataArray);

  const bands = [];
  const step = Math.floor(bufferLength / 6);
  for (let i = 0; i < 6; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) {
      sum += dataArray[i * step + j] || 0;
    }
    const avg = sum / step;
    bands.push(Math.round((avg / 255) * 100));
  }

  return {
    active: true,
    gain: session.gain,
    isMuted: session.isMuted,
    levels: bands
  };
}

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  switch (message.type) {
    case 'START_CAPTURE': {
      const { tabId, streamId, gain, isMuted } = message.data;
      startCapture(tabId, streamId, gain, isMuted)
        .then(res => sendResponse({ success: true, res }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'SET_GAIN': {
      const { tabId, gain, isMuted } = message.data;
      const success = setGain(tabId, gain, isMuted);
      sendResponse({ success });
      break;
    }

    case 'STOP_CAPTURE': {
      const { tabId } = message.data;
      const success = stopCapture(tabId);
      sendResponse({ success });
      break;
    }

    case 'CLEANUP_TAB': {
      const { tabId } = message.data;
      stopCapture(tabId);
      sendResponse({ success: true });
      break;
    }

    case 'GET_STATUS': {
      const { tabId } = message.data;
      const data = getAudioLevels(tabId);
      sendResponse(data);
      break;
    }

    default:
      sendResponse({ error: `Unknown offscreen message type: ${message.type}` });
  }

  return false;
});
