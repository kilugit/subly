<div align="center">
  <img src="./icons/icon.png" alt="Subly Logo" width="120" height="120"/>
  
  # Subly 2.0
    
  [![Chrome Extension](https://img.shields.io/badge/Chrome-Extension%20MV3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/IbraTech04/subly)
  [![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
  [![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
  
  *A modern, powerful Chrome Extension to inject, customize, and synchronize SRT & WebVTT subtitles directly into YouTube videos.*

  [🚀 Installation](#-installation) • [✨ Key Features](#-key-features) • [⌨️ Shortcuts](#-keyboard-shortcuts) • [📖 Usage Guide](#-usage-guide)
  
</div>

---

## 🌟 Overview

**Subly** is a lightweight, high-performance browser extension for Google Chrome and Chromium browsers (Edge, Brave, Opera, Vivaldi), allowing you to effortlessly inject custom subtitle files (`.srt`, `.vtt`, `.txt`) directly into any YouTube video with zero delay, clean native styling, and real-time synchronization.

Whether you are studying foreign languages, watching films or anime without official captions, or following lecture videos, **Subly 2.0** provides the cleanest and most customizable viewing experience.

---

## ✨ Key Features

- 🎯 **Direct Drag & Drop onto Player**:
  - Simply drag any `.srt` or `.vtt` file from your desktop and drop it directly onto the YouTube video player. Subtitles load and start playing immediately!
- ⏱️ **Real-time Subtitle Sync**:
  - Adjust timing offset (+/- 0.1s, 0.2s, 0.5s, 1.0s) directly in the Popup or via quick keyboard shortcuts (`Alt + [`, `Alt + ]`, `Alt + \`).
- 📁 **Dual SRT & WebVTT Support**:
  - Automatically handles decimal commas `,` and periods `.`, optional hours, removes non-cue tags, handles UTF-8 BOM, and supports all international character sets.
- 🎨 **Live Subtitle Preview**:
  - A real-time preview box in the Styling tab reflects font size, font family, text color, background opacity, and text shadow changes instantly without having to reopen the popup.
- 🔍 **Dialogue Search & Timestamp Jump**:
  - Search any word or dialogue line across the entire subtitle file. Click any line to immediately jump YouTube's player to that exact timestamp.
- 🔔 **On-Screen HUD Toasts**:
  - Sleek, native YouTube-styled toast pill displays instant visual feedback when changing font size, offset, or toggling captions.
- 🛡️ **Intelligent Ad Suppression**:
  - Automatically suppresses custom subtitles during YouTube ads and seamlessly resumes them when the main video continues.
- 💾 **Smart Per-Video Persistence**:
  - Remembers loaded subtitle files and sync offsets for recently watched videos and restores them automatically.
- ✋ **Draggable Subtitles**:
  - Drag subtitles anywhere on screen with your mouse to avoid covering burned-in video text. Double-click to reset back to default position.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Function |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>T</kbd> | Toggle Subly Subtitles On / Off |
| <kbd>Alt</kbd> + <kbd>[</kbd> | Advance subtitles earlier by 0.2s |
| <kbd>Alt</kbd> + <kbd>]</kbd> | Delay subtitles later by 0.2s |
| <kbd>Alt</kbd> + <kbd>\</kbd> | Reset timing offset to 0.0s |
| <kbd>Alt</kbd> + <kbd>↑</kbd> | Increase font size |
| <kbd>Alt</kbd> + <kbd>↓</kbd> | Decrease font size |
| <kbd>Alt</kbd> + <kbd>→</kbd> | Increase background opacity |
| <kbd>Alt</kbd> + <kbd>←</kbd> | Decrease background opacity |
| <kbd>Alt</kbd> + <kbd>W</kbd> | Position subtitles at Top |
| <kbd>Alt</kbd> + <kbd>M</kbd> | Position subtitles at Middle |
| <kbd>Alt</kbd> + <kbd>S</kbd> | Position subtitles at Bottom |

---

## 🚀 Installation

### Development Mode:

1. **Clone or Download the Repository**:
   ```bash
   git clone https://github.com/IbraTech04/subly
   cd subly
   ```
2. **Open your browser's extension manager**:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`
3. **Enable Developer Mode**:
   - Toggle the "Developer mode" switch in the top-right corner.
4. **Load the extension**:
   - Click **Load unpacked**.
   - Select the `subly` directory.
   - ✅ Subly is now active in your browser toolbar!

---

## 📖 Usage Guide

### Method 1: Instant Drag & Drop (Fastest)
1. Open any video on [YouTube](https://www.youtube.com).
2. Drag your subtitle file (`.srt` or `.vtt`) from your file manager and drop it onto the video player.
3. Subtitles appear and sync with playback immediately!

### Method 2: Via Subly Popup
1. Open your desired YouTube video.
2. Click the **Subly** icon in your browser toolbar.
3. Select a file from your computer or paste an online subtitle URL and click **Fetch**.
4. Click **🚀 Inject Subtitles**.
5. Switch to the **⏱️ Sync** or **🎨 Styling** tabs to fine-tune timing delay and appearance.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

We welcome contributions from the community! Whether it's bug fixes, feature additions, or documentation improvements, your help makes Subly better for everyone.