(function () {
  if (typeof window === "undefined" || window.top !== window) {
    return;
  }

  function isContextValid() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function extractVideoId(urlString) {
    try {
      let search = "";
      let pathname = "";
      if (typeof urlString === "string") {
        const qIdx = urlString.indexOf("?");
        search = qIdx !== -1 ? urlString.slice(qIdx) : "";
        const hashIdx = search.indexOf("#");
        if (hashIdx !== -1) search = search.slice(0, hashIdx);

        const pathStart = urlString.indexOf("://");
        const slashIdx = urlString.indexOf("/", pathStart !== -1 ? pathStart + 3 : 0);
        pathname = slashIdx !== -1 ? urlString.slice(slashIdx, qIdx !== -1 ? qIdx : undefined) : urlString;
      } else {
        search = window.location.search;
        pathname = window.location.pathname;
      }

      const vMatch = search.match(/[?&]v=([a-zA-Z0-9_-]+)/);
      if (vMatch && vMatch[1]) {
        return vMatch[1];
      }

      const pathMatch = pathname.match(/\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]+)/);
      if (pathMatch && pathMatch[1]) {
        return pathMatch[1];
      }
    } catch (_) {}
    return "";
  }

  // Clean up any prior instance when script is re-injected
  if (window.__subly_instance) {
    try {
      window.__subly_instance.cleanup();
    } catch (_) {}
    window.__subly_instance = null;
  }

  class YouTubeSubtitleInjector {
    constructor() {
      this.video = null;
      this.playerContainer = null;
      this.subtitles = [];
      this.rawSrtContent = "";
      this.currentSubtitleKey = "";
      this.subtitleElement = null;
      this.dropOverlay = null;
      this.hudToast = null;
      this.toggleButton = null;
      this.subtitlesEnabled = true;
      this.subtitlesLoaded = false;
      this.currentFileName = "";
      this.autoLoadInProgress = false;
      this.lastVideoId = "";
      this._navigationSeq = 0;

      this._windowStart = 1;
      this._windowEnd = 0;
      this._lastCueIdx = -1;
      this._maxCueDuration = 30;
      this._updateSubtitlesBound = null;
      this._videoFrameId = null;
      this._onVideoFrame = null;
      this._onPlay = null;
      this._onPause = null;
      this._isSubtitleVisible = false;
      this._wasAdPlaying = false;
      this._saveCacheTimeout = null;
      this._keydownHandler = null;
      this._messageListener = null;
      this._storageListener = null;
      this._dragDropHandlers = null;

      this._watcherInterval = null;
      this._controlsInterval = null;
      this._toastTimeout = null;
      this._navDebounceTimeout = null;

      this._isInitialized = false;
      this._buttonPath = null;
      this._buttonLine = null;

      this._isDraggingSubtitle = false;
      this._dragStartX = 0;
      this._dragStartY = 0;
      this._customPos = null;

      this._settings = {
        fontSize: 18,
        fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        position: "bottom", // 'bottom' | 'lowerThird' | 'middle' | 'top'
        verticalOffset: 60,
        opacity: 80,
        bgColor: "#000000",
        textColor: "#ffffff",
        textShadow: "outline", // 'outline' | 'subtle' | 'glow' | 'none'
        timeOffset: 0.0,
        autoRestore: true,
      };

      this.init();
    }

    init() {
      if (this._isInitialized) return;
      this._isInitialized = true;

      this.injectStyles();
      this.loadSyncSettings();
      this.listenForMessages();
      this.listenForStorageChanges();
      this.setupKeyboardShortcuts();
      this.startWatcher();
    }

    injectStyles() {
      if (document.getElementById("subly-injected-styles")) return;

      const style = document.createElement("style");
      style.id = "subly-injected-styles";
      style.textContent = `
        #subly-drop-overlay {
          position: absolute;
          inset: 0;
          z-index: 99998;
          background: rgba(18, 20, 26, 0.88);
          backdrop-filter: blur(8px);
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 3px dashed #ff4757;
          margin: 12px;
          border-radius: 16px;
          color: #ffffff;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        #subly-drop-overlay.active {
          display: flex;
        }
        #subly-drop-overlay .subly-drop-box {
          text-align: center;
          padding: 24px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        #subly-drop-overlay .subly-drop-title {
          font-size: 20px;
          font-weight: 700;
          margin: 12px 0 6px;
          color: #ffffff;
        }
        #subly-drop-overlay .subly-drop-sub {
          font-size: 13px;
          color: #9aa1b2;
        }
        #subly-hud-toast {
          position: absolute;
          top: 24px;
          left: 50%;
          transform: translateX(-50%) translateY(-10px) scale(0.95);
          background: rgba(18, 20, 26, 0.92);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 30px;
          padding: 8px 20px;
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          z-index: 99999;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease, transform 0.2s ease;
          font-family: 'Segoe UI', Roboto, sans-serif;
        }
        #subly-hud-toast.visible {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }
        #subly-hud-toast .toast-accent {
          color: #ff4757;
          font-weight: 700;
        }
        #custom-subtitles {
          user-select: none;
          -webkit-user-select: none;
          cursor: grab;
          will-change: transform;
          white-space: pre-line;
          padding: 0.25em 0.65em;
          border-radius: 6px;
          box-sizing: border-box;
          line-height: 1.4;
        }
        #custom-subtitles.subly-pos-bottom {
          bottom: var(--subly-bottom, 72px) !important;
          transition: bottom 0.2s ease;
        }
        #movie_player.ytp-autohide #custom-subtitles.subly-pos-bottom,
        .html5-video-player.ytp-autohide #custom-subtitles.subly-pos-bottom {
          bottom: var(--subly-bottom-autohide, 36px) !important;
        }
        #custom-subtitles:active {
          cursor: grabbing;
        }
        #custom-subtitles i, #custom-subtitles em { font-style: italic; }
        #custom-subtitles b, #custom-subtitles strong { font-weight: bold; }
        #custom-subtitles u { text-decoration: underline; }
        #custom-subtitles br { line-height: 1.25; }

        #movie_player:has(#custom-subtitles:not([style*="display: none"])) .ytp-caption-window-bottom,
        #movie_player:has(#custom-subtitles:not([style*="display: none"])) .caption-window,
        #movie_player:has(#custom-subtitles:not([style*="display: none"])) .ytp-caption-segment {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
    }

    getCurrentVideoId() {
      return extractVideoId();
    }

    invalidateCueWindow() {
      this._windowStart = 1;
      this._windowEnd = 0;
      this._lastCueIdx = -1;
    }

    loadSyncSettings() {
      if (!isContextValid()) return;
      try {
        chrome.storage.sync.get(["subtitleSettings", "subtitlesEnabled"], (result) => {
          if (!isContextValid()) return;
          try {
            if (chrome.runtime.lastError) {
              this.applySettings();
              this.updateButtonState();
              return;
            }
            if (result && result.subtitleSettings) {
              // Exclude timeOffset from global sync settings (timeOffset is per-video)
              const { timeOffset, ...syncSettings } = result.subtitleSettings;
              this._settings = { ...this._settings, ...syncSettings };
            }
            if (result && result.subtitlesEnabled !== undefined) {
              this.subtitlesEnabled = result.subtitlesEnabled;
            }
            this.applySettings();
            this.updateButtonState();
          } catch (_) {}
        });
      } catch (_) {}
    }

    startWatcher() {
      if (this._watcherInterval) {
        clearInterval(this._watcherInterval);
        this._watcherInterval = null;
      }

      this.checkState();

      this._watcherInterval = setInterval(() => {
        if (!isContextValid()) {
          this.cleanup();
          return;
        }
        this.checkState();
      }, 1000);
    }

    checkState() {
      if (!isContextValid()) return;

      const currentVideoId = this.getCurrentVideoId();
      if (currentVideoId !== this.lastVideoId) {
        this.handleVideoChange(currentVideoId);
      }

      if (!this.video || !this.video.isConnected) {
        const videoEl = document.querySelector("video");
        if (videoEl) {
          this.video = videoEl;
          this.playerContainer = document.querySelector("#movie_player, .html5-video-player");
          this._attachVideoListeners();
          this.ensureDomElements();
        }
      }

      this.ensureDomElements();
    }

    ensureDomElements() {
      if (!this.playerContainer || !this.playerContainer.isConnected) {
        this.playerContainer = document.querySelector("#movie_player, .html5-video-player");
      }

      if (this.playerContainer) {
        if (this.playerContainer.style.position !== "relative") {
          this.playerContainer.style.position = "relative";
        }

        if (!this.subtitleElement || !this.subtitleElement.isConnected) {
          this.setupSubtitleDisplay();
        }
        if (!this.dropOverlay || !this.dropOverlay.isConnected) {
          this.setupDragAndDrop();
        }
        if (!this.hudToast || !this.hudToast.isConnected) {
          this.setupHudToast();
        }
      }
    }

    handleVideoChange(newVideoId) {
      if (newVideoId === this.lastVideoId) return;

      if (this.lastVideoId && this.subtitlesLoaded && this.rawSrtContent) {
        this.saveCurrentCache(this.lastVideoId);
      }

      this._navigationSeq++;
      const seq = this._navigationSeq;
      this.lastVideoId = newVideoId;

      this.subtitles = [];
      this.rawSrtContent = "";
      this.subtitlesLoaded = false;
      this.currentSubtitleKey = "";
      this.currentFileName = "";
      this._settings.timeOffset = 0.0;
      this._customPos = null;
      this.invalidateCueWindow();
      this.hideSubtitle();
      this.updateButtonState();
      this.applySettings();

      this.broadcastStatus();

      if (newVideoId) {
        clearTimeout(this._navDebounceTimeout);
        this._navDebounceTimeout = setTimeout(() => {
          if (this._navigationSeq === seq && this.getCurrentVideoId() === newVideoId) {
            this.checkAutoLoadAndCache(newVideoId, seq);
          }
        }, 300);
      }
    }

    _attachVideoListeners() {
      if (!this.video) return;

      this._cleanupVideoListeners();

      if (!this._updateSubtitlesBound) {
        this._updateSubtitlesBound = () => this.updateSubtitles();
      }

      this._onVideoFrame = () => {
        if (!this.video || this.video.paused) {
          this._videoFrameId = null;
          return;
        }
        this.updateSubtitles();
        this._videoFrameId = this.video.requestVideoFrameCallback(this._onVideoFrame);
      };

      this._onPlay = () => {
        this.updateSubtitles();
        if (this.video?.requestVideoFrameCallback && !this._videoFrameId) {
          this._videoFrameId = this.video.requestVideoFrameCallback(this._onVideoFrame);
        }
      };

      this._onPause = () => {
        if (this._videoFrameId && this.video?.cancelVideoFrameCallback) {
          this.video.cancelVideoFrameCallback(this._videoFrameId);
          this._videoFrameId = null;
        }
        this.updateSubtitles();
      };

      this.video.addEventListener("timeupdate", this._updateSubtitlesBound);
      this.video.addEventListener("seeked", this._updateSubtitlesBound);
      this.video.addEventListener("pause", this._onPause);
      this.video.addEventListener("play", this._onPlay);
      this.video.addEventListener("ratechange", this._updateSubtitlesBound);

      if (!this.video.paused && this.video.requestVideoFrameCallback && !this._videoFrameId) {
        this._videoFrameId = this.video.requestVideoFrameCallback(this._onVideoFrame);
      }
    }

    _cleanupVideoListeners() {
      if (this.video) {
        if (this._videoFrameId && this.video.cancelVideoFrameCallback) {
          this.video.cancelVideoFrameCallback(this._videoFrameId);
        }
        if (this._updateSubtitlesBound) {
          this.video.removeEventListener("timeupdate", this._updateSubtitlesBound);
          this.video.removeEventListener("seeked", this._updateSubtitlesBound);
          this.video.removeEventListener("ratechange", this._updateSubtitlesBound);
        }
        if (this._onPause) this.video.removeEventListener("pause", this._onPause);
        if (this._onPlay) this.video.removeEventListener("play", this._onPlay);
      }
      this._videoFrameId = null;
    }

    setupSubtitleDisplay() {
      const oldSubs = document.querySelectorAll("#custom-subtitles, .subly-custom-subtitle");
      oldSubs.forEach((el) => {
        try { el.remove(); } catch (_) {}
      });

      this.subtitleElement = document.createElement("div");
      this.subtitleElement.id = "custom-subtitles";
      this.subtitleElement.className = "subly-custom-subtitle";
      this._isSubtitleVisible = false;
      this.subtitleElement.style.display = "none";
      this.subtitleElement.style.position = "absolute";
      this.subtitleElement.style.textAlign = "center";
      this.subtitleElement.style.zIndex = "99997";
      this.subtitleElement.style.maxWidth = "85%";
      this.subtitleElement.style.lineHeight = "1.4";
      this.subtitleElement.style.wordWrap = "break-word";
      this.subtitleElement.style.overflowWrap = "break-word";
      this.subtitleElement.style.cursor = "grab";

      this.setupDraggableSubtitles();
      this.applySettings();

      if (this.playerContainer) {
        if (this.playerContainer.style.position !== "relative") {
          this.playerContainer.style.position = "relative";
        }
        this.playerContainer.appendChild(this.subtitleElement);
      }
    }

    setupDraggableSubtitles() {
      if (!this.subtitleElement) return;

      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      const onPointerDown = (e) => {
        if (e.button !== 0) return;
        this._isDraggingSubtitle = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = this.subtitleElement.getBoundingClientRect();
        const parentRect = this.playerContainer ? this.playerContainer.getBoundingClientRect() : { left: 0, top: 0 };

        initialLeft = rect.left - parentRect.left;
        initialTop = rect.top - parentRect.top;

        this.subtitleElement.setPointerCapture(e.pointerId);
        e.stopPropagation();
      };

      const onPointerMove = (e) => {
        if (!this._isDraggingSubtitle) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const newLeft = initialLeft + dx;
        const newTop = initialTop + dy;

        this._customPos = { x: newLeft, y: newTop };
        this.subtitleElement.style.left = `${newLeft}px`;
        this.subtitleElement.style.top = `${newTop}px`;
        this.subtitleElement.style.bottom = "auto";
        this.subtitleElement.style.transform = "none";
        this.subtitleElement.classList.remove("subly-pos-bottom");
      };

      const onPointerUp = (e) => {
        if (!this._isDraggingSubtitle) return;
        this._isDraggingSubtitle = false;
        this.showToast("Repositioned");
      };

      const onDblClick = (e) => {
        e.stopPropagation();
        this._customPos = null;
        this.applySettings();
        this.showToast("Position Reset to Default");
      };

      this.subtitleElement.addEventListener("pointerdown", onPointerDown);
      this.subtitleElement.addEventListener("pointermove", onPointerMove);
      this.subtitleElement.addEventListener("pointerup", onPointerUp);
      this.subtitleElement.addEventListener("pointercancel", onPointerUp);
      this.subtitleElement.addEventListener("dblclick", onDblClick);
    }

    setupDragAndDrop() {
      this._cleanupDragAndDrop();

      if (!this.playerContainer) return;

      const oldOverlays = document.querySelectorAll("#subly-drop-overlay");
      oldOverlays.forEach((el) => {
        try { el.remove(); } catch (_) {}
      });

      this.dropOverlay = document.createElement("div");
      this.dropOverlay.id = "subly-drop-overlay";
      this.dropOverlay.innerHTML = `
        <div class="subly-drop-box">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff4757" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <div class="subly-drop-title">Drop Subtitle File Here</div>
          <div class="subly-drop-sub">Supports .srt, .vtt (Auto-loads & syncs immediately)</div>
        </div>
      `;
      this.playerContainer.appendChild(this.dropOverlay);

      let dragCounter = 0;

      const onDragEnter = (e) => {
        if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          dragCounter++;
          this.dropOverlay.classList.add("active");
        }
      };

      const onDragOver = (e) => {
        if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      };

      const onDragLeave = (e) => {
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          this.dropOverlay.classList.remove("active");
        }
      };

      const onDrop = (e) => {
        e.preventDefault();
        dragCounter = 0;
        this.dropOverlay.classList.remove("active");

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const name = file.name.toLowerCase();
        if (!name.endsWith(".srt") && !name.endsWith(".vtt") && !name.endsWith(".txt")) {
          this.showToast("Only .srt or .vtt files are supported!", "⚠️");
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target.result;
          this._settings.timeOffset = 0.0;
          this.loadSubtitles(content, file.name, true);
          this.showToast(`✓ Loaded: ${file.name} (${this.subtitles.length} cues)`);
        };
        reader.onerror = () => {
          this.showToast("Failed to read subtitle file!", "⚠️");
        };
        reader.readAsText(file, "UTF-8");
      };

      this.playerContainer.addEventListener("dragenter", onDragEnter);
      this.playerContainer.addEventListener("dragover", onDragOver);
      this.playerContainer.addEventListener("dragleave", onDragLeave);
      this.playerContainer.addEventListener("drop", onDrop);

      this._dragDropHandlers = {
        container: this.playerContainer,
        onDragEnter,
        onDragOver,
        onDragLeave,
        onDrop,
      };
    }

    _cleanupDragAndDrop() {
      if (this._dragDropHandlers && this._dragDropHandlers.container) {
        const { container, onDragEnter, onDragOver, onDragLeave, onDrop } = this._dragDropHandlers;
        try {
          container.removeEventListener("dragenter", onDragEnter);
          container.removeEventListener("dragover", onDragOver);
          container.removeEventListener("dragleave", onDragLeave);
          container.removeEventListener("drop", onDrop);
        } catch (_) {}
      }
      this._dragDropHandlers = null;
    }

    setupHudToast() {
      const oldToasts = document.querySelectorAll("#subly-hud-toast");
      oldToasts.forEach((el) => {
        try { el.remove(); } catch (_) {}
      });

      if (!this.playerContainer) return;

      this.hudToast = document.createElement("div");
      this.hudToast.id = "subly-hud-toast";
      this.playerContainer.appendChild(this.hudToast);
    }

    showToast(message, icon = "⚡", duration = 1800) {
      if (!this.hudToast || !document.contains(this.hudToast)) {
        this.setupHudToast();
      }
      if (!this.hudToast) return;

      clearTimeout(this._toastTimeout);
      this.hudToast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-text">${message}</span>
      `;
      this.hudToast.classList.add("visible");

      this._toastTimeout = setTimeout(() => {
        if (this.hudToast) this.hudToast.classList.remove("visible");
      }, duration);
    }


    toggleSubtitles() {
      if (!this.subtitlesLoaded) {
        this.showToast("No subtitles loaded! Drop a .srt file onto video to play.", "ℹ️");
        return;
      }

      this.subtitlesEnabled = !this.subtitlesEnabled;
      this.updateButtonState();
      this.applySettings();

      if (!this.subtitlesEnabled) {
        this.hideSubtitle();
        this.currentSubtitleKey = "";
        this.showToast("Subly: Subtitles OFF", "⚪");
      } else {
        this.updateSubtitles();
        this.showToast("Subly: Subtitles ON", "🟢");
      }

      if (isContextValid()) {
        try {
          chrome.storage.sync.set({ subtitlesEnabled: this.subtitlesEnabled }).catch(() => {});
        } catch (_) {}
      }

      this.broadcastStatus();
    }

    updateButtonState() {}

    listenForMessages() {
      if (!isContextValid()) return;
      if (this._messageListener) {
        try {
          chrome.runtime.onMessage.removeListener(this._messageListener);
        } catch (_) {}
      }

      this._messageListener = (message, sender, sendResponse) => {
        if (!isContextValid()) return;
        try {
          if (message.action === "loadSubtitles") {
            this.loadSubtitles(message.srtContent, message.fileName, message.saveCache !== false);
            sendResponse({ success: true, count: this.subtitles.length });
          } else if (message.action === "unloadSubtitles") {
            this.unloadSubtitles();
            sendResponse({ success: true });
          } else if (message.action === "updateSettings") {
            this.updateSettings(message.settings, true);
            sendResponse({ success: true });
          } else if (message.action === "adjustTimeOffset") {
            this.adjustTimeOffset(message.delta);
            sendResponse({ success: true, offset: this._settings.timeOffset });
          } else if (message.action === "resetTimeOffset") {
            this.resetTimeOffset();
            sendResponse({ success: true, offset: 0 });
          } else if (message.action === "toggleSubtitles") {
            this.toggleSubtitles();
            sendResponse({ success: true, enabled: this.subtitlesEnabled });
          } else if (message.action === "seekToTime") {
            this.seekToTime(message.seconds);
            sendResponse({ success: true });
          } else if (message.action === "getStatus") {
            const res = {
              success: true,
              videoId: this.getCurrentVideoId(),
              subtitlesLoaded: this.subtitlesLoaded,
              subtitlesEnabled: this.subtitlesEnabled,
              subtitlesCount: this.subtitles.length,
              fileName: this.currentFileName,
              timeOffset: this._settings.timeOffset || 0,
              currentTime: this.video ? this.video.currentTime : 0,
              settings: this._settings,
            };
            if (message.includeCues) {
              res.subtitles = this.subtitles;
            }
            sendResponse(res);
          } else if (message.action === "getCues") {
            sendResponse({ success: true, subtitles: this.subtitles });
          }
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return true;
      };

      try {
        chrome.runtime.onMessage.addListener(this._messageListener);
      } catch (_) {}
    }

    listenForStorageChanges() {
      if (!isContextValid()) return;
      if (this._storageListener) {
        try {
          chrome.storage.onChanged.removeListener(this._storageListener);
        } catch (_) {}
      }

      this._storageListener = (changes, area) => {
        if (!isContextValid() || area !== "sync") return;
        try {
          if (changes.subtitleSettings) {
            const { timeOffset, ...syncSettings } = changes.subtitleSettings.newValue || {};
            this._settings = { ...this._settings, ...syncSettings };
            this.applySettings();
          }
          if (changes.subtitlesEnabled) {
            this.subtitlesEnabled = changes.subtitlesEnabled.newValue !== false;
            this.updateButtonState();
            this.applySettings();
            if (!this.subtitlesEnabled) this.hideSubtitle();
            else this.updateSubtitles();
          }
        } catch (_) {}
      };

      try {
        chrome.storage.onChanged.addListener(this._storageListener);
      } catch (_) {}
    }

    loadSubtitles(srtContent, fileName = "", saveToCache = true, targetVideoId = null) {
      try {
        const currentVideoId = this.getCurrentVideoId();
        // If targetVideoId is specified, ensure it matches current video before loading
        if (targetVideoId && currentVideoId && targetVideoId !== currentVideoId) {
          console.warn("Subly: Aborting load for mismatched video:", targetVideoId, "current:", currentVideoId);
          return;
        }

        const videoIdToUse = targetVideoId || currentVideoId || this.lastVideoId;

        this.subtitles = [];
        this.currentSubtitleKey = "";
        this.subtitlesLoaded = false;
        this.hideSubtitle();

        const parser = window.SRTParser || (typeof SRTParser !== "undefined" ? SRTParser : null);
        if (!parser) {
          console.error("Subly: Parser not available");
          return;
        }

        this.subtitles = parser.parse(srtContent);
        this.subtitlesLoaded = this.subtitles.length > 0;
        this.currentFileName = fileName || "subtitles.srt";
        this.rawSrtContent = srtContent;

        if (this.subtitlesLoaded) {
          let maxDur = 0;
          for (let i = 0; i < this.subtitles.length; i++) {
            const dur = this.subtitles[i].endTime - this.subtitles[i].startTime;
            if (dur > maxDur) maxDur = dur;
          }
          this._maxCueDuration = Math.min(Math.max(maxDur, 10), 120);

          this.applySettings();
          this.invalidateCueWindow();
          this.updateSubtitles();

          if (saveToCache && videoIdToUse && isContextValid()) {
            this.saveCurrentCache(videoIdToUse, true);
          }
        }

        this.updateButtonState();
        this.broadcastStatus();
      } catch (error) {
        console.error("Subly: Load error:", error);
        this.subtitlesLoaded = false;
        this.updateButtonState();
        this.broadcastStatus();
      }
    }

    saveCurrentCache(targetVideoId = null, immediate = false) {
      if (!immediate) {
        clearTimeout(this._saveCacheTimeout);
        this._saveCacheTimeout = setTimeout(() => {
          this.saveCurrentCache(targetVideoId, true);
        }, 400);
        return;
      }
      clearTimeout(this._saveCacheTimeout);

      const videoId = targetVideoId || this.getCurrentVideoId() || this.lastVideoId;
      if (!videoId || !this.subtitlesLoaded || !this.rawSrtContent || !isContextValid()) {
        return;
      }

      const cacheData = {
        videoId: videoId,
        fileName: this.currentFileName || "subtitles.srt",
        content: this.rawSrtContent,
        offset: this._settings.timeOffset || 0,
        savedAt: Date.now(),
      };

      try {
        chrome.storage.local.set({ [`subly_cache_${videoId}`]: cacheData }).catch(() => {});
      } catch (_) {}
    }

    unloadSubtitles() {
      const videoId = this.getCurrentVideoId() || this.lastVideoId;
      this.subtitles = [];
      this.rawSrtContent = "";
      this.subtitlesLoaded = false;
      this.currentSubtitleKey = "";
      this.currentFileName = "";
      this._settings.timeOffset = 0.0;
      this._customPos = null;
      this.invalidateCueWindow();
      this.hideSubtitle();
      this.updateButtonState();
      this.applySettings();

      if (videoId && isContextValid()) {
        try {
          // Explicitly mark as unloaded so preset subtitles will not be auto-restored
          chrome.storage.local.set({
            [`subly_cache_${videoId}`]: {
              videoId: videoId,
              unloaded: true,
              savedAt: Date.now(),
            },
          }).catch(() => {});
        } catch (_) {}
      }
      this.showToast("Subtitles Unloaded");
      this.broadcastStatus();
    }

    broadcastStatus() {
      if (!isContextValid()) return;
      try {
        chrome.runtime.sendMessage({
          action: "sublyStatusChanged",
          videoId: this.getCurrentVideoId(),
          subtitlesLoaded: this.subtitlesLoaded,
          subtitlesEnabled: this.subtitlesEnabled,
          fileName: this.currentFileName,
          timeOffset: this._settings.timeOffset || 0,
          subtitlesCount: this.subtitles.length,
        }).catch(() => {});
      } catch (_) {}
    }



    isAdPlaying() {
      if (!this.playerContainer) return false;
      return (
        this.playerContainer.classList.contains("ad-showing") ||
        this.playerContainer.classList.contains("ad-interrupting")
      );
    }

    _findCuesAndWindow(adjustedTime) {
      const subs = this.subtitles;
      const len = subs.length;
      if (len === 0) {
        this._windowStart = 1;
        this._windowEnd = 0;
        return [];
      }

      let low = -1;
      const last = this._lastCueIdx;
      if (last !== undefined && last >= 0 && last < len) {
        if (subs[last].startTime > adjustedTime) {
          if (last === 0 || subs[last - 1].startTime <= adjustedTime) low = last;
        } else if (last + 1 < len) {
          if (subs[last + 1].startTime > adjustedTime) low = last + 1;
          else if (last + 2 < len && subs[last + 2].startTime > adjustedTime) low = last + 2;
        } else {
          low = len;
        }
      }

      if (low === -1) {
        let l = 0, h = len;
        while (l < h) {
          const mid = (l + h) >> 1;
          if (subs[mid].startTime > adjustedTime) h = mid;
          else l = mid + 1;
        }
        low = l;
      }
      this._lastCueIdx = low;

      const nextFutureCue = low < len ? subs[low] : null;
      let wEnd = nextFutureCue ? nextFutureCue.startTime : Infinity;
      let wStart = -Infinity;

      const active = [];
      const minStartTime = adjustedTime - (this._maxCueDuration || 30);
      for (let i = low - 1; i >= 0; i--) {
        const cue = subs[i];
        if (cue.startTime < minStartTime) break;

        if (cue.endTime >= adjustedTime) {
          active.push(cue);
          if (cue.endTime < wEnd) wEnd = cue.endTime;
          if (cue.startTime > wStart) wStart = cue.startTime;
        } else {
          if (cue.endTime > wStart) wStart = cue.endTime;
        }
      }

      if (active.length > 1) active.reverse();

      this._windowStart = wStart;
      this._windowEnd = wEnd;
      return active;
    }

    updateSubtitles() {
      if (!this.subtitlesEnabled || !this.video || !this.subtitlesLoaded) {
        this.hideSubtitle();
        return;
      }

      const adPlaying = this.isAdPlaying();
      if (adPlaying) {
        if (!this._wasAdPlaying) {
          this._wasAdPlaying = true;
          this.hideSubtitle();
          this.invalidateCueWindow();
        }
        return;
      }
      if (this._wasAdPlaying) {
        this._wasAdPlaying = false;
        this.invalidateCueWindow();
      }

      const currentTime = this.video.currentTime;
      const adjustedTime = currentTime + (this._settings.timeOffset || 0.0);

      if (adjustedTime >= this._windowStart && adjustedTime < this._windowEnd) {
        return;
      }

      const activeCues = this._findCuesAndWindow(adjustedTime);

      if (activeCues.length > 0) {
        let newKey = "";
        if (activeCues.length === 1) {
          newKey = activeCues[0].text;
        } else {
          newKey = activeCues.map((c) => c.text).join("///");
        }

        if (newKey !== this.currentSubtitleKey) {
          this.currentSubtitleKey = newKey;
          this.renderActiveCues(activeCues);
        }
      } else if (this.currentSubtitleKey) {
        this.hideSubtitle();
        this.currentSubtitleKey = "";
      }
    }

    renderActiveCues(cues) {
      if (!this.subtitleElement) return;

      if (!this._isSubtitleVisible) {
        this.subtitleElement.style.display = "block";
        this._isSubtitleVisible = true;
      }

      if (cues.length === 1) {
        const cue = cues[0];
        if (cue.hasHtml === undefined) {
          cue.hasHtml = cue.text.indexOf("<") !== -1;
          cue.cleanHtml = cue.hasHtml ? this.sanitizeHTML(cue.text) : null;
        }

        if (cue.hasHtml) {
          this.subtitleElement.innerHTML = cue.cleanHtml;
        } else {
          this.subtitleElement.textContent = cue.text;
        }
        return;
      }

      let hasAnyHtml = false;
      const texts = [];
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        if (c.hasHtml === undefined) {
          c.hasHtml = c.text.indexOf("<") !== -1;
          c.cleanHtml = c.hasHtml ? this.sanitizeHTML(c.text) : null;
        }
        if (c.hasHtml) hasAnyHtml = true;
        const t = c.hasHtml ? c.cleanHtml : c.text;
        if (t && !texts.includes(t)) {
          texts.push(t);
        }
      }

      if (texts.length === 0) {
        this.hideSubtitle();
        return;
      }

      if (hasAnyHtml) {
        this.subtitleElement.innerHTML = texts.join("<br>");
      } else {
        this.subtitleElement.textContent = texts.join("\n");
      }
    }

    showSubtitle(text) {
      this.renderActiveCues([{ text }]);
    }

    sanitizeHTML(text) {
      if (!this._sanitizeDiv) {
        this._sanitizeDiv = document.createElement("div");
        this._allowedTags = new Set(["i", "b", "u", "strong", "em", "br", "font", "span"]);
        this._allowedAttrs = new Set(["color", "size", "face"]);
      }
      const temp = this._sanitizeDiv;
      temp.innerHTML = text;

      const scripts = temp.querySelectorAll("script, object, embed, iframe, link, meta, style");
      for (let i = 0; i < scripts.length; i++) scripts[i].remove();

      const allElements = temp.querySelectorAll("*");
      for (let i = 0; i < allElements.length; i++) {
        const element = allElements[i];
        const tagName = element.tagName.toLowerCase();
        if (!this._allowedTags.has(tagName)) {
          element.replaceWith(document.createTextNode(element.textContent));
        } else if (tagName === "font" || tagName === "span") {
          const attrs = element.attributes;
          for (let j = attrs.length - 1; j >= 0; j--) {
            if (!this._allowedAttrs.has(attrs[j].name.toLowerCase())) {
              element.removeAttribute(attrs[j].name);
            }
          }
        } else {
          const attrs = element.attributes;
          for (let j = attrs.length - 1; j >= 0; j--) {
            element.removeAttribute(attrs[j].name);
          }
        }
      }

      const clean = temp.innerHTML;
      temp.textContent = "";
      return clean;
    }

    hideSubtitle() {
      if (this.subtitleElement && this._isSubtitleVisible) {
        this.subtitleElement.style.display = "none";
        this._isSubtitleVisible = false;
      }
    }

    applySettings() {
      if (!this.subtitleElement) return;

      const wasVisible = this.subtitleElement.style.display === "block";

      let textShadowCSS = "0 1px 3px rgba(0, 0, 0, 0.8), 0 0 2px rgba(0, 0, 0, 0.9)";
      if (this._settings.textShadow === "outline") {
        textShadowCSS =
          "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 2px rgba(0, 0, 0, 0.8)";
      } else if (this._settings.textShadow === "glow") {
        textShadowCSS = "0 0 8px rgba(255, 71, 87, 0.8), 0 0 2px rgba(0,0,0,0.8)";
      } else if (this._settings.textShadow === "none") {
        textShadowCSS = "none";
      }

      const hex = (this._settings.bgColor || "#000000").replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      const bgRGBA = `rgba(${r}, ${g}, ${b}, ${this._settings.opacity / 100})`;

      const customOffset = this._settings.verticalOffset || 60;
      this.subtitleElement.style.setProperty("--subly-bottom", `${Math.max(64, customOffset)}px`);
      this.subtitleElement.style.setProperty("--subly-bottom-autohide", `${Math.max(28, customOffset - 32)}px`);

      let positionTop = "auto";
      let positionBottom = "auto";
      let transform = "translateX(-50%)";
      let left = "50%";

      this.subtitleElement.className = "subly-custom-subtitle";

      if (this._customPos) {
        left = `${this._customPos.x}px`;
        positionTop = `${this._customPos.y}px`;
        transform = "none";
      } else {
        switch (this._settings.position) {
          case "top":
            positionTop = `${customOffset}px`;
            break;
          case "middle":
            positionTop = "50%";
            transform = "translate(-50%, -50%)";
            break;
          case "lowerThird":
            positionBottom = "18%";
            break;
          case "bottom":
          default:
            this.subtitleElement.classList.add("subly-pos-bottom");
            positionBottom = "var(--subly-bottom, 72px)";
            break;
        }
      }

      const fontFamily =
        this._settings.fontFamily || "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

      const isFullscreen = !!(document.fullscreenElement || (this.playerContainer && this.playerContainer.classList.contains("ytp-fullscreen")));
      const fontSize = isFullscreen ? Math.round(this._settings.fontSize * 1.25) : this._settings.fontSize;

      this.subtitleElement.style.top = positionTop;
      this.subtitleElement.style.bottom = positionBottom;
      this.subtitleElement.style.left = left;
      this.subtitleElement.style.transform = transform;
      this.subtitleElement.style.background = bgRGBA;
      this.subtitleElement.style.color = this._settings.textColor || "#ffffff";
      this.subtitleElement.style.fontSize = `${fontSize}px`;
      this.subtitleElement.style.fontFamily = fontFamily;
      this.subtitleElement.style.display = this._isSubtitleVisible ? "block" : "none";
      this.subtitleElement.style.textShadow = textShadowCSS;
    }

    updateSettings(newSettings, notify = false) {
      this._settings = { ...this._settings, ...newSettings };
      this.invalidateCueWindow();
      this.applySettings();
      this.updateButtonState();

      if (isContextValid()) {
        try {
          const { timeOffset, ...syncSettings } = this._settings;
          chrome.storage.sync.set({ subtitleSettings: syncSettings }).catch(() => {});
        } catch (_) {}
      }

      if (this.subtitlesLoaded && this.rawSrtContent) {
        this.saveCurrentCache(null, false);
      }

      if (notify) {
        this.updateSubtitles();
      }

      this.broadcastStatus();
    }

    adjustTimeOffset(delta) {
      const newOffset = Math.round(((this._settings.timeOffset || 0) + delta) * 10) / 10;
      this._settings.timeOffset = newOffset;
      this.invalidateCueWindow();
      this.updateSubtitles();

      if (this.subtitlesLoaded && this.rawSrtContent) {
        this.saveCurrentCache(null, false);
      }

      const sign = newOffset > 0 ? "+" : "";
      this.showToast(`Sync: ${sign}${newOffset.toFixed(1)}s (${delta > 0 ? "+" : ""}${delta}s)`);
      this.broadcastStatus();
    }

    resetTimeOffset() {
      this._settings.timeOffset = 0.0;
      this.invalidateCueWindow();
      this.updateSubtitles();

      if (this.subtitlesLoaded && this.rawSrtContent) {
        this.saveCurrentCache(null, false);
      }

      this.showToast("Sync reset to 0.0s");
      this.broadcastStatus();
    }

    seekToTime(seconds) {
      if (this.video && !isNaN(seconds)) {
        this.video.currentTime = Math.max(0, seconds);
        this.updateSubtitles();
        const p = window.SRTParser || (typeof SRTParser !== "undefined" ? SRTParser : null);
        if (p) this.showToast(`Jump to: ${p.formatTime(seconds)}`);
      }
    }

    setupKeyboardShortcuts() {
      if (this._keydownHandler) {
        document.removeEventListener("keydown", this._keydownHandler);
      }

      this._keydownHandler = (e) => {
        if (!e.altKey) return;
        const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
        if (targetTag === "input" || targetTag === "textarea" || targetTag === "select") return;

        switch (e.key) {
          case "[":
          case "{":
            e.preventDefault();
            this.adjustTimeOffset(-0.2);
            break;
          case "]":
          case "}":
            e.preventDefault();
            this.adjustTimeOffset(+0.2);
            break;
          case "\\":
          case "|":
            e.preventDefault();
            this.resetTimeOffset();
            break;
          case "ArrowUp":
            e.preventDefault();
            const newSizeUp = Math.min(64, this._settings.fontSize + 2);
            this.updateSettings({ fontSize: newSizeUp });
            this.showToast(`Font Size: ${newSizeUp}px`);
            break;
          case "ArrowDown":
            e.preventDefault();
            const newSizeDown = Math.max(12, this._settings.fontSize - 2);
            this.updateSettings({ fontSize: newSizeDown });
            this.showToast(`Font Size: ${newSizeDown}px`);
            break;
          case "ArrowLeft":
            e.preventDefault();
            const newOpacDown = Math.max(0, this._settings.opacity - 10);
            this.updateSettings({ opacity: newOpacDown });
            this.showToast(`Opacity: ${newOpacDown}%`);
            break;
          case "ArrowRight":
            e.preventDefault();
            const newOpacUp = Math.min(100, this._settings.opacity + 10);
            this.updateSettings({ opacity: newOpacUp });
            this.showToast(`Opacity: ${newOpacUp}%`);
            break;
          case "w":
          case "W":
            this.updateSettings({ position: "top" });
            this._customPos = null;
            this.showToast("Position: Top");
            break;
          case "m":
          case "M":
            this.updateSettings({ position: "middle" });
            this._customPos = null;
            this.showToast("Position: Middle");
            break;
          case "s":
          case "S":
            this.updateSettings({ position: "bottom" });
            this._customPos = null;
            this.showToast("Position: Bottom");
            break;
          case "t":
          case "T":
            e.preventDefault();
            this.toggleSubtitles();
            break;
        }
      };

      document.addEventListener("keydown", this._keydownHandler);
    }

    async checkAutoLoadAndCache(targetVideoId, seq) {
      if (!targetVideoId) {
        targetVideoId = this.getCurrentVideoId();
      }
      if (!targetVideoId || !isContextValid()) return;
      if (seq === undefined) seq = this._navigationSeq;

      // Honor the autoRestore setting
      if (this._settings.autoRestore === false) {
        return;
      }

      this.autoLoadInProgress = true;

      try {
        const cacheKey = `subly_cache_${targetVideoId}`;
        let cacheResult = null;
        try {
          cacheResult = await chrome.storage.local.get([cacheKey]);
        } catch (_) {}

        // Strict verification: Abort if user navigated to a different video while waiting
        if (seq !== this._navigationSeq || this.getCurrentVideoId() !== targetVideoId || !isContextValid()) {
          return;
        }

        const item = cacheResult ? cacheResult[cacheKey] : null;

        // If user explicitly unloaded subtitles for this video, do NOT auto-restore or load presets
        if (item && item.unloaded) {
          return;
        }

        if (item && item.content) {
          const savedOffset = typeof item.offset === "number" ? item.offset : 0.0;
          this._settings.timeOffset = savedOffset;
          this.loadSubtitles(item.content, item.fileName || "cached.srt", false, targetVideoId);
          this.showToast(`Auto-restored: ${item.fileName || "subtitles"}`);
          this.broadcastStatus();
          return;
        }

        const config = await this.fetchConfig();

        if (seq !== this._navigationSeq || this.getCurrentVideoId() !== targetVideoId || !isContextValid()) {
          return;
        }

        if (config?.videoMappings && config.videoMappings[targetVideoId]) {
          const srtUrl = config.videoMappings[targetVideoId];
          try {
            const response = await fetch(srtUrl);
            if (response.ok) {
              const content = await response.text();

              if (seq !== this._navigationSeq || this.getCurrentVideoId() !== targetVideoId || !isContextValid()) {
                return;
              }

              if (content.includes("-->")) {
                const fileName = srtUrl.split("/").pop().replace(/%20/g, " ") || "preset.srt";
                this._settings.timeOffset = 0.0;
                this.loadSubtitles(content, fileName, true, targetVideoId);
                this.showToast(`Preset loaded: ${fileName}`);
                this.broadcastStatus();
              }
            }
          } catch (_) {}
        }
      } catch (error) {
      } finally {
        this.autoLoadInProgress = false;
      }
    }

    async fetchConfig() {
      if (!isContextValid()) return null;
      try {
        const url = chrome.runtime.getURL("config.json");
        const response = await fetch(url);
        return response.ok ? await response.json() : null;
      } catch (_) {
        return null;
      }
    }

    cleanup() {
      this._cleanupVideoListeners();

      if (this._watcherInterval) {
        clearInterval(this._watcherInterval);
        this._watcherInterval = null;
      }
      if (this._controlsInterval) {
        clearInterval(this._controlsInterval);
        this._controlsInterval = null;
      }
      if (this._toastTimeout) {
        clearTimeout(this._toastTimeout);
        this._toastTimeout = null;
      }
      if (this._saveCacheTimeout) {
        clearTimeout(this._saveCacheTimeout);
        this._saveCacheTimeout = null;
      }
      if (this._navDebounceTimeout) {
        clearTimeout(this._navDebounceTimeout);
        this._navDebounceTimeout = null;
      }
      if (this._keydownHandler) {
        document.removeEventListener("keydown", this._keydownHandler);
        this._keydownHandler = null;
      }

      if (this._messageListener && typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
        try {
          chrome.runtime.onMessage.removeListener(this._messageListener);
        } catch (_) {}
        this._messageListener = null;
      }

      if (this._storageListener && typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        try {
          chrome.storage.onChanged.removeListener(this._storageListener);
        } catch (_) {}
        this._storageListener = null;
      }

      this._cleanupDragAndDrop();

      const elementsToRemove = document.querySelectorAll(
        "#custom-subtitles, .subly-custom-subtitle, #subly-drop-overlay, #subly-hud-toast, #subly-toggle-button"
      );
      elementsToRemove.forEach((el) => {
        try { el.remove(); } catch (_) {}
      });

      this.video = null;
      this.playerContainer = null;
      this.subtitleElement = null;
      this.dropOverlay = null;
      this.hudToast = null;
      this.toggleButton = null;
      this.subtitles = [];
      this.rawSrtContent = "";
      this.subtitlesLoaded = false;
      this.autoLoadInProgress = false;
      this._isInitialized = false;
    }
  }

  function handleNavigation() {
    if (!isContextValid()) return;

    if (window.__subly_instance) {
      window.__subly_instance.checkState();
    } else {
      window.__subly_instance = new YouTubeSubtitleInjector();
    }
  }

  document.addEventListener("yt-navigate-finish", handleNavigation);
  document.addEventListener("yt-page-data-updated", handleNavigation);
  window.addEventListener("popstate", handleNavigation);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handleNavigation);
  } else {
    handleNavigation();
  }
})();
