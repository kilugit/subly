class YouTubeSubtitleInjector {
  constructor() {
    this.video = null;
    this.subtitles = [];
    this.currentSubtitle = null;
    this.subtitleElement = null;
    this.toggleButton = null;
    this.subtitlesEnabled = true;
    this.subtitlesLoaded = false;
    this.autoLoadInProgress = false;
    this.lastVideoId = null;
    this._timeUpdateHandler = null;
    this._videoObserver = null;
    this._controlsObserver = null;
    this._isInitialized = false;
    this._buttonPath = null;
    this._buttonLine = null;
    this._settings = {
      fontSize: 18,
      position: "bottom",
      opacity: 80,
      textColor: "#ffffff",
    };
    this.init();
  }

  init() {
    if (this._isInitialized) return;
    this._isInitialized = true;
    this.waitForVideo();
    this.listenForMessages();
    this.setupKeyboardShortcuts();
    this.setupPlayerButton();
  }

  waitForVideo() {
    const checkVideo = () => {
      const newVideo = document.querySelector("video");
      if (newVideo && newVideo !== this.video) {
        this.video = newVideo;
        this.setupSubtitleDisplay();
        this._attachTimeUpdateListener();
        this._observeVideoRemoval();
        setTimeout(() => this.autoLoadSubtitles(), 500);
      } else if (!newVideo) {
        this._videoRetryTimeout = setTimeout(checkVideo, 1000);
      } else if (newVideo === this.video) {
        const urlParams = new URLSearchParams(window.location.search);
        const currentVideoId = urlParams.get("v");
        if (currentVideoId && currentVideoId !== this.lastVideoId) {
          this.lastVideoId = currentVideoId;
          setTimeout(() => this.autoLoadSubtitles(), 500);
        }
      }
    };
    checkVideo();
  }

  _attachTimeUpdateListener() {
    if (this._timeUpdateHandler) {
      this.video.removeEventListener("timeupdate", this._timeUpdateHandler);
    }
    this._timeUpdateHandler = () => {
      if (this.video && !this.video.paused) {
        this.updateSubtitles();
      }
    };
    this.video.addEventListener("timeupdate", this._timeUpdateHandler);
  }

  _observeVideoRemoval() {
    if (this._videoObserver) {
      this._videoObserver.disconnect();
    }
    this._videoObserver = new MutationObserver(() => {
      if (!document.contains(this.video)) {
        this._cleanupVideo();
      }
    });
    this._videoObserver.observe(document.body, { childList: true, subtree: true });
  }

  _cleanupVideo() {
    if (this._timeUpdateHandler && this.video) {
      this.video.removeEventListener("timeupdate", this._timeUpdateHandler);
    }
    this._timeUpdateHandler = null;
    this.video = null;
    this.hideSubtitle();
    this.currentSubtitle = null;
  }

  setupSubtitleDisplay() {
    if (this.subtitleElement && this.subtitleElement.parentNode) {
      this.subtitleElement.parentNode.removeChild(this.subtitleElement);
    }

    this.subtitleElement = document.createElement("div");
    this.subtitleElement.id = "custom-subtitles";

    chrome.storage.sync.get(
      ["subtitleSettings", "subtitlesEnabled"],
      (result) => {
        if (chrome.runtime.lastError) {
          console.warn("Storage error:", chrome.runtime.lastError.message);
          this.applySettings();
          this.updateButtonState();
          return;
        }
        if (result.subtitleSettings) {
          this._settings = { ...this._settings, ...result.subtitleSettings };
        }
        if (result.subtitlesEnabled !== undefined) {
          this.subtitlesEnabled = result.subtitlesEnabled;
        }
        this.applySettings();
        this.updateButtonState();
      }
    );

    const playerContainer = document.querySelector(
      "#movie_player, .html5-video-player"
    );
    if (playerContainer) {
      playerContainer.style.position = "relative";
      playerContainer.appendChild(this.subtitleElement);
    }
  }

  setupPlayerButton() {
    if (this._controlsObserver) {
      this._controlsObserver.disconnect();
    }

    const checkControls = () => {
      const rightControls = document.querySelector(".ytp-right-controls");
      if (rightControls) {
        this.injectToggleButton(rightControls);
        return true;
      }
      return false;
    };

    if (!checkControls()) {
      let attempts = 0;
      const maxAttempts = 20;
      const retry = () => {
        if (attempts >= maxAttempts) {
          console.warn("Failed to find YouTube controls after maximum attempts");
          return;
        }
        attempts++;
        if (!checkControls()) {
          this._controlsRetryTimeout = setTimeout(retry, 500);
        }
      };
      this._controlsObserver = new MutationObserver(() => {
        if (checkControls()) {
          this._controlsObserver.disconnect();
          this._controlsObserver = null;
        }
      });
      this._controlsObserver.observe(document.body, { childList: true, subtree: true });
      retry();
    }
  }

  injectToggleButton(rightControls) {
    if (this.toggleButton && this.toggleButton.parentNode) {
      this.toggleButton.parentNode.removeChild(this.toggleButton);
    }

    this.toggleButton = document.createElement("button");
    this.toggleButton.id = "subly-toggle-button";
    this.toggleButton.className = "ytp-button";
    this.toggleButton.setAttribute("data-priority", "4");
    this.toggleButton.setAttribute("aria-label", "Toggle Subly subtitles");
    this.toggleButton.setAttribute("title", "Toggle Subly subtitles");
    this.toggleButton.style.cssText = `
      position: relative;
      width: 48px;
      height: 48px;
      border: none;
      background: transparent;
      cursor: default;
      opacity: 0.3;
      transition: opacity 0.2s ease;
    `;

    this.toggleButton.innerHTML = `
      <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
        <path d="M8,8 C6.89,8 6,8.9 6,10 L6,26 C6,27.1 6.89,28 8,28 L28,28 C29.1,28 30,27.1 30,26 L30,10 C30,8.9 29.1,8 28,8 L8,8 Z M10,12 L26,12 L26,14 L10,14 L10,12 z M10,16 L20,16 L20,18 L10,18 L10,16 z M10,20 L24,20 L24,22 L10,22 L10,20 z M26,18 L28,18 L28,20 L26,20 L26,18 z" fill="#666" stroke="none"/>
      </svg>
    `;

    this._buttonPath = this.toggleButton.querySelector("path");
    this._buttonLine = null;

    this.toggleButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleSubtitles();
    });

    try {
      const subtitlesButton = rightControls.querySelector(".ytp-subtitles-button");
      if (subtitlesButton && rightControls.contains(subtitlesButton)) {
        rightControls.insertBefore(this.toggleButton, subtitlesButton);
      } else {
        rightControls.appendChild(this.toggleButton);
      }
    } catch (e) {
      rightControls.appendChild(this.toggleButton);
    }
  }

  toggleSubtitles() {
    if (!this.subtitlesLoaded) return;

    this.subtitlesEnabled = !this.subtitlesEnabled;
    this.updateButtonState();

    if (!this.subtitlesEnabled) {
      this.hideSubtitle();
      this.currentSubtitle = null;
    }

    chrome.storage.sync.set({ subtitlesEnabled: this.subtitlesEnabled });
  }

  updateButtonState() {
    if (!this.toggleButton) return;

    const isActive = this.subtitlesLoaded && this.subtitlesEnabled;
    const isLoaded = this.subtitlesLoaded;

    this.toggleButton.style.opacity = isLoaded
      ? isActive
        ? "1"
        : "0.7"
      : "0.3";
    this.toggleButton.style.cursor = isLoaded ? "pointer" : "default";

    let label, title;
    if (!isLoaded) {
      label = title = "No Subly subtitles loaded";
    } else if (isActive) {
      label = title = "Disable Subly subtitles (Alt+T)";
    } else {
      label = title = "Enable Subly subtitles (Alt+T)";
    }

    this.toggleButton.setAttribute("aria-label", label);
    this.toggleButton.setAttribute("title", title);

    if (this._buttonPath) {
      this._buttonPath.setAttribute("fill", isLoaded ? "#fff" : "#666");
    }

    if (isLoaded && !this.subtitlesEnabled) {
      if (!this._buttonLine) {
        const svg = this.toggleButton.querySelector("svg");
        const newLine = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line"
        );
        newLine.setAttribute("x1", "6");
        newLine.setAttribute("y1", "6");
        newLine.setAttribute("x2", "30");
        newLine.setAttribute("y2", "30");
        newLine.setAttribute("stroke", "#ff4444");
        newLine.setAttribute("stroke-width", "2.5");
        newLine.setAttribute("opacity", "0.9");
        svg.appendChild(newLine);
        this._buttonLine = newLine;
      }
    } else {
      if (this._buttonLine) {
        this._buttonLine.remove();
        this._buttonLine = null;
      }
    }
  }

  listenForMessages() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message.action === "loadSubtitles") {
          this.loadSubtitles(message.srtContent);
          sendResponse({ success: true });
        } else if (message.action === "updateSettings") {
          this.updateSettings(message.settings);
          sendResponse({ success: true });
        } else if (message.action === "toggleSubtitles") {
          this.toggleSubtitles();
          sendResponse({ success: true, enabled: this.subtitlesEnabled });
        }
      } catch (error) {
        console.error("Message handling error:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    });
  }

  loadSubtitles(srtContent) {
    try {
      this.subtitles = [];
      this.currentSubtitle = null;
      this.subtitlesLoaded = false;

      this.hideSubtitle();

      this.subtitles = SRTParser.parse(srtContent);
      this.subtitlesLoaded = this.subtitles.length > 0;

      if (this.subtitlesLoaded) {
        this._sortSubtitles();
        console.log(`Loaded ${this.subtitles.length} subtitles`);
      } else {
        console.warn("No subtitles were parsed from the content");
      }

      this.updateButtonState();
    } catch (error) {
      console.error("Error parsing SRT:", error);
      this.subtitlesLoaded = false;
      this.updateButtonState();
    }
  }

  _sortSubtitles() {
    this.subtitles.sort((a, b) => a.startTime - b.startTime);
  }

  _findSubtitleIndex(currentTime) {
    let low = 0;
    let high = this.subtitles.length - 1;
    let result = -1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const sub = this.subtitles[mid];

      if (currentTime >= sub.startTime && currentTime <= sub.endTime) {
        return mid;
      }

      if (currentTime < sub.startTime) {
        high = mid - 1;
      } else {
        result = mid;
        low = mid + 1;
      }
    }

    if (result >= 0 && currentTime >= this.subtitles[result].startTime && currentTime <= this.subtitles[result].endTime) {
      return result;
    }

    return -1;
  }

  updateSubtitles() {
    if (!this.subtitlesEnabled || !this.video) return;

    const currentTime = this.video.currentTime;
    const index = this._findSubtitleIndex(currentTime);

    if (index >= 0) {
      const subtitle = this.subtitles[index];
      if (subtitle !== this.currentSubtitle) {
        this.showSubtitle(subtitle.text);
        this.currentSubtitle = subtitle;
      }
    } else if (this.currentSubtitle) {
      this.hideSubtitle();
      this.currentSubtitle = null;
    }
  }

  showSubtitle(text) {
    if (this.subtitleElement) {
      if (text.includes("<")) {
        this.subtitleElement.innerHTML = this.sanitizeHTML(text);
      } else {
        this.subtitleElement.textContent = text;
      }
      this.subtitleElement.style.display = "block";
    }
  }

  sanitizeHTML(text) {
    const allowedTags = new Set(["i", "b", "u", "strong", "em", "br", "font"]);
    const allowedAttributes = new Set(["color", "size", "face"]);

    const temp = document.createElement("div");
    temp.innerHTML = text;

    const scripts = temp.querySelectorAll(
      "script, object, embed, iframe, link, meta, style"
    );
    scripts.forEach((script) => script.remove());

    const allElements = temp.querySelectorAll("*");
    allElements.forEach((element) => {
      const tagName = element.tagName.toLowerCase();
      if (!allowedTags.has(tagName)) {
        element.replaceWith(document.createTextNode(element.textContent));
      } else if (tagName === "font") {
        const attrs = Array.from(element.attributes);
        attrs.forEach((attr) => {
          if (!allowedAttributes.has(attr.name.toLowerCase())) {
            element.removeAttribute(attr.name);
          }
        });
      } else {
        const attrs = Array.from(element.attributes);
        attrs.forEach((attr) => element.removeAttribute(attr.name));
      }
    });

    return temp.innerHTML;
  }

  hideSubtitle() {
    if (this.subtitleElement) {
      this.subtitleElement.style.display = "none";
    }
  }

  applySettings() {
    if (!this.subtitleElement) return;

    const position =
      this._settings.position === "top"
        ? "60px"
        : this._settings.position === "middle"
        ? "50%"
        : "auto";
    const bottom = this._settings.position === "bottom" ? "60px" : "auto";
    const transform =
      this._settings.position === "middle"
        ? "translate(-50%, -50%)"
        : "translateX(-50%)";

    this.subtitleElement.style.cssText = `
      position: absolute;
      top: ${position};
      bottom: ${bottom};
      left: 50%;
      transform: ${transform};
      background: rgba(0, 0, 0, ${this._settings.opacity / 100});
      color: ${this._settings.textColor};
      padding: 8px 16px;
      border-radius: 4px;
      font-size: ${this._settings.fontSize}px;
      font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      text-align: center;
      z-index: 9999;
      max-width: 80%;
      display: none;
      pointer-events: none;
      line-height: 1.4;
      word-wrap: break-word;
      overflow-wrap: break-word;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8), 0 0 2px rgba(0, 0, 0, 0.9);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      will-change: transform;
      contain: layout style paint;
    `;

    if (!document.getElementById("subtitle-html-styles")) {
      const styleSheet = document.createElement("style");
      styleSheet.id = "subtitle-html-styles";
      styleSheet.textContent = `
        #custom-subtitles i, #custom-subtitles em {
          font-style: italic;
        }
        #custom-subtitles b, #custom-subtitles strong {
          font-weight: bold;
        }
        #custom-subtitles u {
          text-decoration: underline;
        }
        #custom-subtitles br {
          line-height: 1.2;
        }
      `;
      document.head.appendChild(styleSheet);
    }
  }

  updateSettings(newSettings) {
    if (!this.subtitleElement) return;

    const wasVisible = this.subtitleElement.style.display === "block";
    const previousPosition = this._settings.position;

    this._settings = { ...this._settings, ...newSettings };

    if (previousPosition !== this._settings.position) {
      this.subtitleElement.style.display = "none";
      this.applySettings();
      this.subtitleElement.offsetHeight;
      if (wasVisible) {
        this.subtitleElement.style.display = "block";
      }
    } else {
      this.applySettings();
    }

    chrome.storage.sync.set({ subtitleSettings: this._settings });
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (!e.altKey) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          this.updateSettings({ fontSize: Math.min(64, this._settings.fontSize + 1) });
          break;
        case "ArrowDown":
          e.preventDefault();
          this.updateSettings({ fontSize: Math.max(8, this._settings.fontSize - 1) });
          break;
        case "ArrowLeft":
          e.preventDefault();
          this.updateSettings({
            opacity: Math.max(0, this._settings.opacity - 5),
          });
          break;
        case "ArrowRight":
          e.preventDefault();
          this.updateSettings({
            opacity: Math.min(100, this._settings.opacity + 5),
          });
          break;
        case "w":
        case "W":
          this.updateSettings({ position: "top" });
          break;
        case "m":
        case "M":
          this.updateSettings({ position: "middle" });
          break;
        case "s":
        case "S":
          this.updateSettings({ position: "bottom" });
          break;
        case "t":
        case "T":
          e.preventDefault();
          this.toggleSubtitles();
          break;
      }
    });
  }

  async fetchConfig() {
    try {
      const response = await fetch(chrome.runtime.getURL("config.json"));
      if (!response.ok) {
        throw new Error("Failed to load config.json");
      }
      return await response.json();
    } catch (error) {
      console.error("Error fetching config:", error);
      return null;
    }
  }

  async autoLoadSubtitles() {
    if (this.autoLoadInProgress) return;

    this.autoLoadInProgress = true;

    try {
      const config = await this.fetchConfig();
      if (!config || !config.videoMappings) return;

      const urlParams = new URLSearchParams(window.location.search);
      const videoId = urlParams.get("v");

      if (videoId && config.videoMappings[videoId]) {
        const srtUrl = config.videoMappings[videoId];
        const response = await fetch(srtUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch SRT: ${response.status}`);
        }

        const content = await response.text();
        if (!content.includes("-->")) {
          throw new Error("Invalid SRT format - no timestamps found");
        }

        this.loadSubtitles(content);
      }
    } catch (error) {
      console.error("Error auto-loading subtitles:", error);
    } finally {
      this.autoLoadInProgress = false;
    }
  }

  cleanup() {
    if (this._timeUpdateHandler && this.video) {
      this.video.removeEventListener("timeupdate", this._timeUpdateHandler);
    }
    this._timeUpdateHandler = null;

    if (this._videoObserver) {
      this._videoObserver.disconnect();
      this._videoObserver = null;
    }

    if (this._controlsObserver) {
      this._controlsObserver.disconnect();
      this._controlsObserver = null;
    }

    if (this._videoRetryTimeout) {
      clearTimeout(this._videoRetryTimeout);
      this._videoRetryTimeout = null;
    }

    if (this._controlsRetryTimeout) {
      clearTimeout(this._controlsRetryTimeout);
      this._controlsRetryTimeout = null;
    }

    if (this.subtitleElement && this.subtitleElement.parentNode) {
      this.subtitleElement.parentNode.removeChild(this.subtitleElement);
    }
    this.subtitleElement = null;

    if (this.toggleButton && this.toggleButton.parentNode) {
      this.toggleButton.parentNode.removeChild(this.toggleButton);
    }
    this.toggleButton = null;
    this._buttonPath = null;
    this._buttonLine = null;

    this.video = null;
    this.subtitles = [];
    this.currentSubtitle = null;
    this.subtitlesLoaded = false;
    this.autoLoadInProgress = false;
    this._isInitialized = false;
  }
}

let injector = null;
let navigationObserver = null;
let currentURL = location.href;

function cleanup() {
  if (injector) {
    injector.cleanup();
    injector = null;
  }

  const subtitleStyles = document.getElementById("subtitle-html-styles");
  if (subtitleStyles) {
    subtitleStyles.remove();
  }

  if (navigationObserver) {
    navigationObserver.disconnect();
    navigationObserver = null;
  }
}

function initialize() {
  cleanup();
  try {
    setTimeout(() => {
      injector = new YouTubeSubtitleInjector();
    }, 100);
  } catch (e) {
    console.error("Failed to initialize subtitle injector:", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

navigationObserver = new MutationObserver(() => {
  if (location.href !== currentURL) {
    const newURL = location.href;
    const oldVideoId = new URLSearchParams(new URL(currentURL).search).get("v");
    const newVideoId = new URLSearchParams(new URL(newURL).search).get("v");

    currentURL = newURL;

    if (oldVideoId !== newVideoId) {
      setTimeout(() => {
        initialize();
        if (injector) {
          setTimeout(() => injector.setupPlayerButton(), 1500);
        }
      }, 1000);
    }
  }
});
navigationObserver.observe(document.body, { childList: true, subtree: true });


