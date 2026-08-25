// popup.js - Interactive Controller for Volume Booster Ultra

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  const volumeTier = document.getElementById('volumeTier');
  const gaugeProgress = document.getElementById('gaugeProgress');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const muteBtn = document.getElementById('muteBtn');
  const resetBtn = document.getElementById('resetBtn');
  const powerBtn = document.getElementById('powerBtn');
  const statusIndicator = document.getElementById('statusIndicator');
  const vuBarFills = document.querySelectorAll('.vu-bar-fill');

  const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 68; // ~427.256

  let currentTabId = null;
  let currentVolume = 100;
  let isMuted = false;
  let isCaptured = false;
  let vuInterval = null;

  // 1. Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    currentTabId = tab.id;
  } else {
    statusIndicator.classList.remove('active');
    statusIndicator.querySelector('.status-label').textContent = 'NO TAB';
    return;
  }

  // 2. Load stored state for this tab
  const storageKey = `tab_${currentTabId}`;
  const storedData = await chrome.storage.local.get([storageKey]);
  if (storedData[storageKey]) {
    const saved = storedData[storageKey];
    currentVolume = saved.volume !== undefined ? saved.volume : 100;
    isMuted = !!saved.isMuted;
    isCaptured = !!saved.isCaptured;
  }

  // Initial UI Render
  updateUI(currentVolume, isMuted);

  // Check backend capture status
  try {
    const res = await chrome.runtime.sendMessage({
      target: 'background',
      type: 'GET_STATUS',
      data: { tabId: currentTabId }
    });
    if (res && res.status && res.status.active) {
      isCaptured = true;
      statusIndicator.classList.add('active');
      statusIndicator.querySelector('.status-label').textContent = 'BOOSTING';
      startVUMeter();
    }
  } catch (e) {
    console.debug('Status check:', e);
  }

  // 3. UI Update Helpers
  function updateUI(vol, muted) {
    volumeSlider.value = vol;
    volumeValue.textContent = muted ? '0' : vol;

    // Gauge circle offset
    const displayVol = muted ? 0 : vol;
    const offset = GAUGE_CIRCUMFERENCE - (displayVol / 600) * GAUGE_CIRCUMFERENCE;
    gaugeProgress.style.strokeDashoffset = offset;

    // Dynamic Color & Tier Text
    let color = 'var(--accent-cyan)';
    let tierText = 'NORMAL';

    if (muted) {
      tierText = 'MUTED';
      color = 'var(--text-muted)';
    } else if (vol === 0) {
      tierText = 'MUTED';
      color = 'var(--text-muted)';
    } else if (vol <= 100) {
      tierText = 'STANDARD';
      color = '#38bdf8';
    } else if (vol <= 250) {
      tierText = 'ENHANCED';
      color = '#10b981';
    } else if (vol <= 450) {
      tierText = 'LOUD';
      color = '#f59e0b';
    } else {
      tierText = 'MAX BOOST 🔥';
      color = '#f43f5e';
    }

    volumeTier.textContent = tierText;
    volumeTier.style.color = color;
    gaugeProgress.style.stroke = color;
    gaugeProgress.style.filter = `drop-shadow(0 0 8px ${color})`;

    // Update Slider Background Gradient Track
    const percent = (vol / 600) * 100;
    volumeSlider.style.background = `linear-gradient(to right, ${color} 0%, ${color} ${percent}%, rgba(255, 255, 255, 0.08) ${percent}%, rgba(255, 255, 255, 0.08) 100%)`;

    // Preset Pill Highlights
    presetBtns.forEach(btn => {
      const pVal = parseInt(btn.getAttribute('data-val'), 10);
      if (pVal === vol && !muted) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Mute Button Appearance
    if (muted) {
      muteBtn.classList.add('muted');
      muteBtn.querySelector('.icon-unmuted').style.display = 'none';
      muteBtn.querySelector('.icon-muted').style.display = 'inline-block';
      muteBtn.querySelector('#muteLabel').textContent = 'Unmute';
    } else {
      muteBtn.classList.remove('muted');
      muteBtn.querySelector('.icon-unmuted').style.display = 'inline-block';
      muteBtn.querySelector('.icon-muted').style.display = 'none';
      muteBtn.querySelector('#muteLabel').textContent = 'Mute';
    }
  }

  // 4. Apply Gain & Sync with Background Audio Pipeline
  async function applyVolumeChange(newVol, newMuted = false) {
    currentVolume = newVol;
    isMuted = newMuted;

    updateUI(currentVolume, isMuted);

    // Save to storage
    chrome.storage.local.set({
      [`tab_${currentTabId}`]: {
        volume: currentVolume,
        isMuted: isMuted,
        isCaptured: true
      }
    });

    const gainValue = currentVolume / 100;

    try {
      if (!isCaptured) {
        // First-time capture initiation
        const res = await chrome.runtime.sendMessage({
          target: 'background',
          type: 'INIT_TAB_STREAM',
          data: {
            tabId: currentTabId,
            gain: gainValue,
            isMuted: isMuted
          }
        });

        if (res && res.success) {
          isCaptured = true;
          statusIndicator.classList.add('active');
          statusIndicator.querySelector('.status-label').textContent = 'BOOSTING';
          startVUMeter();
        }
      } else {
        // Stream already active, just adjust gain smoothly
        await chrome.runtime.sendMessage({
          target: 'background',
          type: 'SET_GAIN',
          data: {
            tabId: currentTabId,
            gain: gainValue,
            isMuted: isMuted
          }
        });
      }
    } catch (err) {
      console.error('Volume adjustment error:', err);
    }
  }

  // 5. Event Listeners
  volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    applyVolumeChange(val, false);
  });

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.getAttribute('data-val'), 10);
      applyVolumeChange(val, false);
    });
  });

  muteBtn.addEventListener('click', () => {
    applyVolumeChange(currentVolume, !isMuted);
  });

  resetBtn.addEventListener('click', () => {
    applyVolumeChange(100, false);
  });

  powerBtn.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({
        target: 'background',
        type: 'STOP_CAPTURE',
        data: { tabId: currentTabId }
      });
      isCaptured = false;
      stopVUMeter();
      statusIndicator.classList.remove('active');
      statusIndicator.querySelector('.status-label').textContent = 'DETACHED';
      chrome.storage.local.remove([`tab_${currentTabId}`]);
      updateUI(100, false);
    } catch (e) {
      console.error('Stop capture error:', e);
    }
  });

  // 6. Real-time VU Visualizer Meter Loop
  function startVUMeter() {
    if (vuInterval) clearInterval(vuInterval);

    vuInterval = setInterval(async () => {
      try {
        const res = await chrome.runtime.sendMessage({
          target: 'background',
          type: 'GET_STATUS',
          data: { tabId: currentTabId }
        });

        if (res && res.status && res.status.levels && res.status.levels.length > 0) {
          const levels = res.status.levels;
          vuBarFills.forEach((bar, idx) => {
            const level = levels[idx] !== undefined ? Math.max(10, levels[idx]) : 10;
            bar.style.height = `${level}%`;
          });
        } else {
          // Subtle idle bounce animation
          vuBarFills.forEach((bar, idx) => {
            const rnd = Math.floor(Math.random() * 20) + 10;
            bar.style.height = `${rnd}%`;
          });
        }
      } catch (e) {
        // Ignore polling errors when popup is closed
      }
    }, 80);
  }

  function stopVUMeter() {
    if (vuInterval) clearInterval(vuInterval);
    vuBarFills.forEach(bar => {
      bar.style.height = '10%';
    });
  }
});
