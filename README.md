# 🔊 Volume Booster Ultra (Up to 600%) — Chrome & Edge Extension

> A sleek, high-performance browser extension for **Google Chrome** and **Microsoft Edge** that amplifies tab audio up to **600%** using the **Web Audio API** with intelligent anti-clipping dynamic compression, a glassmorphic dark-theme popup UI, and real-time audio visualizers.

---

## ✨ Key Features

- 🚀 **Extreme 600% Amplification**: Boost quiet videos, movies, podcasts, and streams well beyond 100% standard limits.
- 🛡️ **Anti-Clipping Dynamics Compression**: Integrates a tuned `DynamicsCompressorNode` to eliminate harsh digital clipping, audio distortion, and speaker blowout at high gain levels.
- 🎛️ **Quick Preset Pills**: One-click jump to `100%` (Normal), `200%` (2x), `400%` (4x), or `600%` (Max Boost 🔥).
- 📊 **Real-time VU Equalizer Visualizer**: Animated multi-band frequency bars reacting to active sound on the tab.
- 🏷️ **Dynamic Extension Badge**: Shows active volume percentage directly on the browser toolbar icon with intuitive color cues.
- 💾 **Per-Tab Memory**: Remembers independent volume levels for each browser tab.
- ⚡ **Zero-Build Architecture**: 100% pure vanilla HTML5, CSS3 Glassmorphism, and ES Modules JavaScript — instant "Load unpacked" with zero build tools or dependencies.
- 🔒 **Privacy-First**: No data collection, no telemetry, zero external tracking scripts.

---

## 📚 Open-Source GitHub Reference Repositories

This extension incorporates and builds upon design patterns from top open-source browser audio extensions:

1. **[MasterAlexS/VolumeBooster](https://github.com/MasterAlexS/VolumeBooster)**
   - *Architecture Reference*: Multi-stage gain scaling, domain-level memory persistence, and iframe audio capture.
2. **[noeljbass/Bastion-Volume-Booster](https://github.com/noeljbass/Bastion-Volume-Booster)**
   - *Architecture Reference*: Manifest V3 compliant audio routing via offscreen stream processing and seamless tab gain syncing.
3. **[ramavats/volume-booster](https://github.com/ramavats/volume-booster)**
   - *Architecture Reference*: Lightweight, privacy-focused HTML5 audio capture with zero tracking and low memory footprint.
4. **[yungsamd17/Volume-Control](https://github.com/yungsamd17/Volume-Control)**
   - *Architecture Reference*: Dynamic toolbar icon badge feedback and per-tab state storage.

---

## 🛠️ Architecture & Web Audio Pipeline (Manifest V3)

Manifest V3 replaces background pages with Service Workers, which do not have direct DOM access or `AudioContext`. This extension implements the official Chrome Offscreen Document pattern:

```
[ Active Tab Audio ] 
        │ (chrome.tabCapture.getMediaStreamId)
        ▼
[ Background Service Worker (background.js) ]
        │ (Message Passing)
        ▼
[ Offscreen Audio Processor (offscreen.html / offscreen.js) ]
        │
        ├─► MediaStreamAudioSourceNode
        ├─► GainNode (0.0x to 6.0x)
        ├─► DynamicsCompressorNode (Anti-Clipping & Distortion Limiting)
        ├─► AnalyserNode (6-band VU Frequency Data)
        └─► AudioDestinationNode (Speakers / Headphones)
```

---

## 🚀 Installation Guide

### For Google Chrome:
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **"Developer mode"** in the top-right corner.
3. Click the **"Load unpacked"** button in the top-left corner.
4. Select the `Volume-Booster-Extension` folder.
5. Click the puzzle icon 🧩 in Chrome's top bar and pin **Volume Booster Ultra** to your toolbar!

### For Microsoft Edge:
1. Open Microsoft Edge and navigate to `edge://extensions/`.
2. Toggle on **"Developer mode"** in the left sidebar.
3. Click **"Load unpacked"** at the top.
4. Select the `Volume-Booster-Extension` folder.
5. Pin the extension to your toolbar.

---

## 🧪 Testing with the Built-in Audio Lab

To test the extension offline without opening third-party websites:
1. Double-click or open `test-audio.html` in Chrome or Edge.
2. Click **"Play Ambient Synth"** or **"Play Quiet Voice Track"**.
3. Click the **Volume Booster** toolbar icon.
4. Drag the slider to **200%**, **400%**, or **600%** to hear the instant boost and observe the live visualizer!

---

## 📂 Project Structure

```
Volume-Booster-Extension/
├── manifest.json          # Manifest V3 configuration & permissions
├── background.js          # Background service worker (badge, stream routing, tab lifecycle)
├── offscreen.html         # Offscreen document host for Web Audio API
├── offscreen.js           # Audio engine (GainNode, DynamicsCompressor, Analyser)
├── popup/
│   ├── popup.html         # Glassmorphic control popup
│   ├── popup.css          # Dark glassmorphism styles & animations
│   └── popup.js           # Interactive controller, slider, presets, VU visualizer
├── icons/
│   ├── icon.svg           # High-resolution vector source logo
│   ├── icon16.png         # 16x16 toolbar icon
│   ├── icon32.png         # 32x32 high-DPI icon
│   ├── icon48.png         # 48x48 management page icon
│   └── icon128.png        # 128x128 store/display icon
├── test-audio.html        # Built-in offline audio testing laboratory
└── README.md              # Project documentation & GitHub references
```

---

## 📜 License & Acknowledgments
Open-source under the MIT License. Built with reference to community projects on GitHub for Chrome & Edge audio enhancement.
