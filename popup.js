function extractVideoId(urlString) {
  try {
    const url = new URL(urlString, "https://www.youtube.com");
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]+$/.test(v)) return v;

    const pathMatch = url.pathname.match(/\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]+)/);
    if (pathMatch && pathMatch[1]) return pathMatch[1];
  } catch (_) {}
  return "";
}

class PopupController {
  constructor() {
    this.selectedFile = null;
    this.srtContent = null;
    this.activeTab = null;
    this.loadedSubtitles = [];
    this.subtitlesEnabled = true;

    this.settings = {
      fontSize: 18,
      fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      position: "bottom",
      verticalOffset: 60,
      opacity: 80,
      bgColor: "#000000",
      textColor: "#ffffff",
      textShadow: "outline",
      timeOffset: 0.0,
      autoRestore: true,
    };

    this._updateTimeout = null;
    this._resizeSaveTimeout = null;

    this.initDOMElements();
    this.init();
  }

  initDOMElements() {
    this.powerBtn = document.getElementById("powerBtn");
    this.powerText = document.getElementById("powerText");
    this.versionDisplay = document.getElementById("versionDisplay");

    this.tabBtns = document.querySelectorAll(".tab-btn");
    this.tabContents = document.querySelectorAll(".tab-content");

    this.loadedCard = document.getElementById("loadedCard");
    this.loadedName = document.getElementById("loadedName");
    this.loadedCuesCount = document.getElementById("loadedCuesCount");
    this.loadedOffset = document.getElementById("loadedOffset");
    this.unloadBtn = document.getElementById("unloadBtn");
    this.clearCacheBtn = document.getElementById("clearCacheBtn");
    this.dropArea = document.getElementById("dropArea");
    this.fileInput = document.getElementById("fileInput");
    this.dropPrimary = document.getElementById("dropPrimary");
    this.urlInput = document.getElementById("urlInput");
    this.fetchBtn = document.getElementById("fetchBtn");
    this.loadBtn = document.getElementById("loadBtn");
    this.status = document.getElementById("status");
    this.presetNotice = document.getElementById("presetNotice");
    this.presetText = document.getElementById("presetText");
    this.loadPresetBtn = document.getElementById("loadPresetBtn");

    this.syncValue = document.getElementById("syncValue");
    this.syncBtns = document.querySelectorAll(".sync-btn[data-delta]");
    this.syncResetBtn = document.getElementById("syncResetBtn");

    this.previewSubtitle = document.getElementById("previewSubtitle");
    this.fontSizeRange = document.getElementById("fontSizeRange");
    this.fontSizeVal = document.getElementById("fontSizeVal");
    this.fontFamily = document.getElementById("fontFamily");
    this.position = document.getElementById("position");
    this.vertOffsetRange = document.getElementById("vertOffsetRange");
    this.vertOffsetVal = document.getElementById("vertOffsetVal");
    this.textShadow = document.getElementById("textShadow");
    this.opacityRange = document.getElementById("opacityRange");
    this.opacityVal = document.getElementById("opacityVal");
    this.textColor = document.getElementById("textColor");
    this.bgColor = document.getElementById("bgColor");
    this.textSwatches = document.querySelectorAll(".swatch[data-color]");
    this.bgSwatches = document.querySelectorAll(".swatch[data-bg]");
    this.autoRestoreCheck = document.getElementById("autoRestoreCheck");
    this.autoRestoreVal = document.getElementById("autoRestoreVal");

    this.cueSearchInput = document.getElementById("cueSearchInput");
    this.cuesList = document.getElementById("cuesList");

    this.resizer = document.getElementById("resizer");
    this.sizeHint = document.getElementById("sizeHint");
  }

  async init() {
    this.setupEventListeners();
    this.setupResizer();
    this.applySavedSize();
    await this.loadSettings();
    await this.checkCurrentTabStatus();
  }

  setupEventListeners() {
    this.powerBtn.addEventListener("click", () => this.toggleSubtitles());

    this.tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        this.switchTab(tabId);
      });
    });

    this.dropArea.addEventListener("click", () => this.fileInput.click());
    this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e.target.files[0]));

    this.dropArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.dropArea.classList.add("dragover");
    });

    this.dropArea.addEventListener("dragleave", () => {
      this.dropArea.classList.remove("dragover");
    });

    this.dropArea.addEventListener("drop", (e) => {
      e.preventDefault();
      this.dropArea.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        this.handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    this.urlInput.addEventListener("input", () => {
      this.fetchBtn.disabled = !this.urlInput.value.trim();
    });
    this.fetchBtn.addEventListener("click", () => this.handleUrlFetch());

    this.loadBtn.addEventListener("click", () => this.loadSubtitles());
    this.unloadBtn.addEventListener("click", () => this.unloadSubtitles());
    this.clearCacheBtn.addEventListener("click", () => this.clearCachedSubtitles());

    this.syncBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const delta = parseFloat(btn.getAttribute("data-delta"));
        this.adjustSync(delta);
      });
    });
    this.syncResetBtn.addEventListener("click", () => this.resetSync());

    this.fontSizeRange.addEventListener("input", (e) =>
      this.updateSetting("fontSize", parseInt(e.target.value, 10))
    );
    this.fontFamily.addEventListener("change", (e) =>
      this.updateSetting("fontFamily", e.target.value)
    );
    this.position.addEventListener("change", (e) =>
      this.updateSetting("position", e.target.value)
    );
    this.vertOffsetRange.addEventListener("input", (e) =>
      this.updateSetting("verticalOffset", parseInt(e.target.value, 10))
    );
    this.textShadow.addEventListener("change", (e) =>
      this.updateSetting("textShadow", e.target.value)
    );
    this.opacityRange.addEventListener("input", (e) =>
      this.updateSetting("opacity", parseInt(e.target.value, 10))
    );
    this.textColor.addEventListener("input", (e) =>
      this.updateSetting("textColor", e.target.value)
    );
    this.bgColor.addEventListener("input", (e) =>
      this.updateSetting("bgColor", e.target.value)
    );

    if (this.autoRestoreCheck) {
      this.autoRestoreCheck.addEventListener("change", (e) => {
        const isChecked = e.target.checked;
        if (this.autoRestoreVal) this.autoRestoreVal.textContent = isChecked ? "ON" : "OFF";
        this.updateSetting("autoRestore", isChecked);
      });
    }

    this.textSwatches.forEach((swatch) => {
      swatch.addEventListener("click", () => {
        const col = swatch.getAttribute("data-color");
        this.textColor.value = col;
        this.updateSetting("textColor", col);
      });
    });

    this.bgSwatches.forEach((swatch) => {
      swatch.addEventListener("click", () => {
        const col = swatch.getAttribute("data-bg");
        this.bgColor.value = col;
        this.updateSetting("bgColor", col);
      });
    });

    this.cueSearchInput.addEventListener("input", () => {
      clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(() => this.filterCues(), 150);
    });

    this.cuesList.addEventListener("click", (e) => {
      const item = e.target.closest(".cue-item");
      if (item && item.dataset.time) {
        this.jumpToTimestamp(parseFloat(item.dataset.time));
      }
    });

    if (typeof chrome !== "undefined" && chrome.tabs?.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (this.activeTab && this.activeTab.id === tabId && changeInfo.url) {
          this.checkCurrentTabStatus();
        }
      });
    }

    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "sublyStatusChanged") {
          if (message.timeOffset !== undefined) {
            this.settings.timeOffset = message.timeOffset;
            this.updateSyncDisplay(message.timeOffset);
          }
          if (message.subtitlesEnabled !== undefined) {
            this.updatePowerButtonUI(message.subtitlesEnabled);
          }
          if (message.subtitlesLoaded) {
            this.updateLoadedCard(message.fileName, message.subtitlesCount, message.timeOffset);
          }
          if (message.videoId !== this._currentVideoId || message.subtitlesLoaded !== this.loadedCard.classList.contains("visible")) {
            this._currentVideoId = message.videoId;
            this.checkCurrentTabStatus();
          }
        }
      });
    }
  }

  switchTab(tabId) {
    this.tabBtns.forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === tabId));
    this.tabContents.forEach((c) => c.classList.toggle("active", c.id === tabId));
    if (tabId === "tab-search" && this.loadedSubtitles.length === 0) {
      this.fetchCuesFromTab();
    }
  }

  async fetchCuesFromTab() {
    try {
      const tab = await this.getActiveTab();
      if (tab?.id) {
        const res = await this.sendMessage(tab.id, { action: "getCues" });
        if (res?.success && res.subtitles) {
          this.loadedSubtitles = res.subtitles;
          if (this.cueSearchInput?.value?.trim()) {
            this.filterCues();
          } else {
            this.populateCuesList();
          }
        }
      }
    } catch (_) {}
  }

  handleFileSelect(file) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".srt") && !name.endsWith(".vtt") && !name.endsWith(".txt")) {
      this.showStatus("Please select a valid .srt or .vtt file!", "error");
      return;
    }

    this.selectedFile = file;
    this.srtContent = null;
    this.loadBtn.disabled = false;
    this.dropPrimary.textContent = `✓ ${file.name}`;
    this.clearStatus();

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const parser = window.SRTParser || (typeof SRTParser !== "undefined" ? SRTParser : null);
      if (parser) {
        this.loadedSubtitles = parser.parse(content);
        this.srtContent = content;
        this.populateCuesList();
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  async handleUrlFetch() {
    const url = this.urlInput.value.trim();
    if (!url) return;

    try {
      this.fetchBtn.disabled = true;
      this.showStatus("Fetching subtitles...", "info");

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const content = await response.text();
      if (!content.includes("-->")) throw new Error("Invalid subtitle format");

      const parser = window.SRTParser || (typeof SRTParser !== "undefined" ? SRTParser : null);
      if (parser) {
        this.loadedSubtitles = parser.parse(content);
        this.srtContent = content;
      }
      this.selectedFile = { name: url.split("/").pop().replace(/%20/g, " ") || "subtitles.srt" };

      this.loadBtn.disabled = false;
      this.dropPrimary.textContent = `✓ ${this.selectedFile.name}`;
      this.showStatus(`✓ Loaded ${this.loadedSubtitles.length} subtitle cues!`, "success");
      this.populateCuesList();
    } catch (error) {
      console.error("Fetch error:", error);
      this.showStatus("Failed to fetch subtitles from URL!", "error");
    } finally {
      this.fetchBtn.disabled = !this.urlInput.value.trim();
    }
  }

  async loadSubtitles() {
    if (!this.selectedFile && !this.srtContent) return;

    try {
      this.loadBtn.disabled = true;
      this.showStatus("Injecting subtitles...", "info");

      let content = this.srtContent;
      let fileName = this.selectedFile ? this.selectedFile.name : "subtitles.srt";

      if (!content && this.selectedFile) {
        content = await this.readFile(this.selectedFile);
      }

      const tab = await this.getActiveTab();
      if (!tab?.url?.includes("youtube.com")) {
        this.showStatus("Please navigate to a YouTube video first!", "error");
        this.loadBtn.disabled = false;
        return;
      }

      const res = await this.sendMessage(tab.id, {
        action: "loadSubtitles",
        srtContent: content,
        fileName: fileName,
        saveCache: true,
      });

      if (res?.success) {
        const count = res.count || (this.loadedSubtitles ? this.loadedSubtitles.length : 0);
        this.showStatus(`✓ Successfully loaded ${count} subtitle cues!`, "success");
        this.updateLoadedCard(fileName, count, this.settings.timeOffset);
        this.updatePowerButtonUI(true);
        this.presetNotice.classList.remove("visible");
      } else {
        throw new Error(res?.error || "Load failed");
      }
    } catch (error) {
      console.warn("Load notice:", error.message);
      if (
        error.message?.includes("Receiving end does not exist") ||
        error.message?.includes("Could not establish connection") ||
        error.message?.includes("Extension context invalidated")
      ) {
        this.showStatus("Please refresh the YouTube tab (F5) and try again!", "error");
      } else {
        this.showStatus("Failed to load subtitles!", "error");
      }
      this.loadBtn.disabled = false;
    }
  }

  async unloadSubtitles() {
    try {
      const tab = await this.getActiveTab();
      if (tab?.id) {
        await this.sendMessage(tab.id, { action: "unloadSubtitles" });
      }
      this.loadedCard.classList.remove("visible");
      this.selectedFile = null;
      this.srtContent = null;
      this.loadedSubtitles = [];
      this._lastRenderedFile = "";
      this.settings.timeOffset = 0.0;
      this.updateSyncDisplay(0.0);
      this.dropPrimary.textContent = "Click or drag subtitle file here";
      this.loadBtn.disabled = true;
      this.populateCuesList();
      this.showStatus("Subtitles unloaded successfully", "info");

      if (tab?.url) {
        this.checkPresetMapping(tab.url);
      }
    } catch (_) {}
  }

  async clearCachedSubtitles() {
    if (!confirm("Are you sure you want to clear cached subtitles?")) {
      return;
    }
    try {
      const items = await chrome.storage.local.get(null);
      const keys = Object.keys(items || {}).filter((k) => k.startsWith("subly_cache_"));
      if (keys.length > 0) {
        await chrome.storage.local.remove(keys);
      }
      this.showStatus("Cached subtitles cleared!", "success");
    } catch (_) {
      this.showStatus("Failed to clear cached subtitles", "error");
    }
  }

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file, "UTF-8");
    });
  }

  async adjustSync(delta) {
    try {
      const tab = await this.getActiveTab();
      if (tab?.id) {
        const res = await this.sendMessage(tab.id, { action: "adjustTimeOffset", delta: delta });
        if (res?.success && typeof res.offset === "number") {
          this.settings.timeOffset = res.offset;
          this.updateSyncDisplay(res.offset);
        }
      }
    } catch (_) {}
  }

  async resetSync() {
    try {
      const tab = await this.getActiveTab();
      if (tab?.id) {
        const res = await this.sendMessage(tab.id, { action: "resetTimeOffset" });
        if (res?.success && typeof res.offset === "number") {
          this.settings.timeOffset = res.offset;
          this.updateSyncDisplay(res.offset);
        }
      }
    } catch (_) {}
  }

  updateSyncDisplay(offset) {
    const safeOffset = typeof offset === "number" ? offset : 0;
    const sign = safeOffset > 0 ? "+" : "";
    this.syncValue.textContent = `${sign}${safeOffset.toFixed(2)}s`;
    this.syncValue.classList.toggle("negative", safeOffset < 0);
    this.loadedOffset.textContent = `Sync: ${sign}${safeOffset.toFixed(1)}s`;
  }

  async updateSetting(key, value) {
    this.settings[key] = value;
    this.updateStyleUI();

    clearTimeout(this._updateTimeout);
    this._updateTimeout = setTimeout(async () => {
      try {
        // Exclude timeOffset from sync storage (timeOffset is per-video)
        const { timeOffset, ...syncSettings } = this.settings;
        await chrome.storage.sync.set({ subtitleSettings: syncSettings });
        const tab = await this.getActiveTab();
        if (tab?.url?.includes("youtube.com")) {
          await this.sendMessage(tab.id, { action: "updateSettings", settings: this.settings });
        }
      } catch (error) {
        console.error("Update error:", error);
      }
    }, 120);
  }

  updateStyleUI() {
    this.fontSizeRange.value = this.settings.fontSize;
    this.fontSizeVal.textContent = `${this.settings.fontSize}px`;

    this.fontFamily.value = this.settings.fontFamily;
    this.position.value = this.settings.position;

    this.vertOffsetRange.value = this.settings.verticalOffset || 60;
    this.vertOffsetVal.textContent = `${this.settings.verticalOffset || 60}px`;

    this.textShadow.value = this.settings.textShadow || "outline";

    this.opacityRange.value = this.settings.opacity;
    this.opacityVal.textContent = `${this.settings.opacity}%`;

    this.textColor.value = this.settings.textColor;
    this.bgColor.value = this.settings.bgColor || "#000000";

    if (this.autoRestoreCheck) {
      const isEnabled = this.settings.autoRestore !== false;
      this.autoRestoreCheck.checked = isEnabled;
      if (this.autoRestoreVal) {
        this.autoRestoreVal.textContent = isEnabled ? "ON" : "OFF";
      }
    }

    if (this.previewSubtitle) {
      this.previewSubtitle.style.fontSize = `${this.settings.fontSize}px`;
      this.previewSubtitle.style.fontFamily = this.settings.fontFamily;
      this.previewSubtitle.style.color = this.settings.textColor;

      const hex = (this.settings.bgColor || "#000000").replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      this.previewSubtitle.style.background = `rgba(${r}, ${g}, ${b}, ${this.settings.opacity / 100})`;

      if (this.settings.textShadow === "outline") {
        this.previewSubtitle.style.textShadow =
          "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 2px rgba(0, 0, 0, 0.8)";
      } else if (this.settings.textShadow === "glow") {
        this.previewSubtitle.style.textShadow = "0 0 8px rgba(255, 71, 87, 0.8), 0 0 2px rgba(0,0,0,0.8)";
      } else if (this.settings.textShadow === "none") {
        this.previewSubtitle.style.textShadow = "none";
      } else {
        this.previewSubtitle.style.textShadow = "0 1px 3px rgba(0, 0, 0, 0.8), 0 0 2px rgba(0, 0, 0, 0.9)";
      }
    }
  }

  populateCuesList(cuesToRender = null) {
    const list = cuesToRender || this.loadedSubtitles;

    if (!list || list.length === 0) {
      this.cuesList.innerHTML = `<div class="no-cues">${this.loadedSubtitles.length > 0 ? "No matching dialogue found!" : "No subtitles loaded yet. Please load a subtitle file in Files tab!"}</div>`;
      return;
    }

    const parser = window.SRTParser || (typeof SRTParser !== "undefined" ? SRTParser : null);
    const limit = Math.min(list.length, 100);
    let html = "";
    for (let i = 0; i < limit; i++) {
      const sub = list[i];
      if (sub._clean === undefined) sub._clean = this.cleanText(sub.text);
      const timeStr = parser ? parser.formatTime(sub.startTime) : `${sub.startTime}s`;
      html += `<div class="cue-item" data-time="${sub.startTime}"><div class="cue-header"><span class="cue-time">▶ ${timeStr}</span><span class="cue-idx">#${sub.index}</span></div><div class="cue-text">${sub._clean}</div></div>`;
    }

    this.cuesList.innerHTML = html;
  }

  cleanText(text) {
    return text.replace(/<[^>]*>/g, "").replace(/\n/g, " ");
  }

  filterCues() {
    const query = this.cueSearchInput.value.trim().toLowerCase();
    if (!query) {
      this.populateCuesList();
      return;
    }

    const filtered = this.loadedSubtitles.filter((sub) => {
      if (sub._lower === undefined) sub._lower = sub.text.toLowerCase();
      return sub._lower.includes(query);
    });
    this.populateCuesList(filtered);
  }

  async jumpToTimestamp(seconds) {
    try {
      const tab = await this.getActiveTab();
      if (tab?.id) {
        await this.sendMessage(tab.id, { action: "seekToTime", seconds: seconds });
      }
    } catch (_) {}
  }

  async toggleSubtitles() {
    try {
      const tab = await this.getActiveTab();
      if (!tab?.url?.includes("youtube.com")) {
        this.showStatus("Please navigate to a YouTube video first!", "error");
        return;
      }

      const res = await this.sendMessage(tab.id, { action: "toggleSubtitles" });
      if (res?.success) {
        this.subtitlesEnabled = res.enabled;
        this.updatePowerButtonUI(this.subtitlesEnabled);
      }
    } catch (error) {
      console.error("Toggle error:", error);
    }
  }

  updatePowerButtonUI(enabled) {
    this.subtitlesEnabled = enabled;
    this.powerBtn.className = `power-btn ${enabled ? "active" : "inactive"}`;
    this.powerText.textContent = enabled ? "ON" : "OFF";
  }

  updateLoadedCard(fileName, count, offset) {
    this.loadedCard.classList.add("visible");
    this.loadedName.textContent = fileName || "subtitles.srt";
    this.loadedCuesCount.textContent = `${count} cues`;
    const safeOffset = typeof offset === "number" ? offset : 0;
    const sign = safeOffset > 0 ? "+" : "";
    this.loadedOffset.textContent = `Sync: ${sign}${safeOffset.toFixed(1)}s`;
  }

  async checkCurrentTabStatus() {
    try {
      this.activeTab = null;
      const tab = await this.getActiveTab();
      if (!tab?.url?.includes("youtube.com")) {
        this.loadedCard.classList.remove("visible");
        this.presetNotice.classList.remove("visible");
        return;
      }

      const res = await this.sendMessage(tab.id, { action: "getStatus" });
      if (res?.success) {
        if (res.settings) {
          const { timeOffset, ...syncSettings } = res.settings;
          this.settings = { ...this.settings, ...syncSettings };
          this.updateStyleUI();
        }

        this.settings.timeOffset = res.timeOffset || 0.0;
        this.updatePowerButtonUI(res.subtitlesEnabled !== false);
        this.updateSyncDisplay(this.settings.timeOffset);

        if (res.subtitlesLoaded) {
          const count = res.subtitlesCount || 0;
          if (this._lastRenderedFile !== res.fileName) {
            this.loadedSubtitles = [];
            this._lastRenderedFile = res.fileName;
            const activeTabBtn = document.querySelector(".tab-btn.active");
            if (activeTabBtn?.getAttribute("data-tab") === "tab-search") {
              this.fetchCuesFromTab();
            } else {
              this.populateCuesList();
            }
          }
          this.updateLoadedCard(res.fileName, count, this.settings.timeOffset);
          this.presetNotice.classList.remove("visible");
        } else {
          this.loadedCard.classList.remove("visible");
          if (this.loadedSubtitles.length > 0) {
            this.loadedSubtitles = [];
            this._lastRenderedFile = "";
            this.populateCuesList();
          }
          this.checkPresetMapping(tab.url);
        }
      } else {
        this.loadedCard.classList.remove("visible");
        this.presetNotice.classList.remove("visible");
      }
    } catch (_) {
      this.loadedCard.classList.remove("visible");
      this.presetNotice.classList.remove("visible");
    }
  }

  async checkPresetMapping(url) {
    try {
      const config = await this.fetchConfig();
      if (!config?.videoMappings) {
        this.presetNotice.classList.remove("visible");
        return;
      }

      const videoId = extractVideoId(url);
      if (videoId && config.videoMappings[videoId]) {
        this.presetNotice.classList.add("visible");
        this.loadPresetBtn.onclick = async () => {
          this.presetNotice.classList.remove("visible");
          this.urlInput.value = config.videoMappings[videoId];
          this.fetchBtn.disabled = false;
          await this.handleUrlFetch();
          await this.loadSubtitles();
        };
      } else {
        this.presetNotice.classList.remove("visible");
      }
    } catch (_) {
      this.presetNotice.classList.remove("visible");
    }
  }

  async fetchConfig() {
    try {
      const response = await fetch(chrome.runtime.getURL("config.json"));
      return response.ok ? await response.json() : null;
    } catch (_) {
      return null;
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(["subtitleSettings", "subtitlesEnabled"]);
      if (result.subtitleSettings) {
        const { timeOffset, ...syncSettings } = result.subtitleSettings;
        this.settings = { ...this.settings, ...syncSettings };
      }
      if (result.subtitlesEnabled !== undefined) {
        this.subtitlesEnabled = result.subtitlesEnabled;
      }
      this.updateStyleUI();
      this.updatePowerButtonUI(this.subtitlesEnabled);
      this.updateSyncDisplay(this.settings.timeOffset || 0);
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  async getActiveTab() {
    if (this.activeTab) return this.activeTab;
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      const [lastTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (lastTab) tab = lastTab;
    }
    this.activeTab = tab;
    return tab;
  }

  async sendMessage(tabId, message, maxAttempts = 4) {
    if (!tabId || typeof tabId !== "number") {
      throw new Error("Invalid tab ID");
    }

    let injected = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (error) {
        const errMsg = error?.message || "";
        const isDisconnected =
          errMsg.includes("Receiving end does not exist") ||
          errMsg.includes("Could not establish connection") ||
          errMsg.includes("Extension context invalidated");

        if (!isDisconnected) {
          throw error;
        }

        if (!injected && chrome.scripting?.executeScript) {
          injected = true;
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ["srt-parser.js", "content.js"],
            });
          } catch (injectError) {
            console.warn("Subly: Auto-inject failed:", injectError.message);
            throw error;
          }
        }

        if (attempt === maxAttempts) {
          throw error;
        }
        await new Promise((r) => setTimeout(r, 150 * attempt));
      }
    }
  }

  showStatus(message, type = "info") {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
    this.status.style.display = "block";
  }

  clearStatus() {
    this.status.style.display = "none";
  }

  setupResizer() {
    let startX = 0, startY = 0, startW = 0, startH = 0;
    let dragging = false;

    this.resizer.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = document.body.offsetWidth;
      startH = document.body.offsetHeight;
      this.resizer.setPointerCapture(e.pointerId);
    });

    this.resizer.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const minW = parseInt(getComputedStyle(document.body).minWidth, 10);
      const minH = parseInt(getComputedStyle(document.body).minHeight, 10);
      const maxW = Math.min(parseInt(getComputedStyle(document.body).maxWidth, 10), window.screen.availWidth);
      const maxH = parseInt(getComputedStyle(document.body).maxHeight, 10);

      const w = Math.min(maxW, Math.max(minW, startW + e.clientX - startX));
      const h = Math.min(maxH, Math.max(minH, startH + e.clientY - startY));

      document.body.style.width = `${w}px`;
      document.body.style.height = `${h}px`;
      this.sizeHint.textContent = `• ${w}×${h}`;
      this.saveSize(w, h);
    });

    const stop = () => { dragging = false; };
    this.resizer.addEventListener("pointerup", stop);
    this.resizer.addEventListener("pointercancel", stop);
  }

  saveSize(w, h) {
    clearTimeout(this._resizeSaveTimeout);
    this._resizeSaveTimeout = setTimeout(() => {
      chrome.storage.local.set({ popupSize: { width: w, height: h } }).catch(() => {});
    }, 250);
  }

  async applySavedSize() {
    try {
      const result = await chrome.storage.local.get("popupSize");
      if (result?.popupSize?.width && result?.popupSize?.height) {
        const { width, height } = result.popupSize;
        const cs = getComputedStyle(document.body);
        document.body.style.width = `${Math.min(width, parseInt(cs.maxWidth, 10))}px`;
        document.body.style.height = `${Math.min(height, parseInt(cs.maxHeight, 10))}px`;
        this.sizeHint.textContent = `• ${Math.round(width)}×${Math.round(height)}`;
      }
    } catch (_) {}
  }
}

document.addEventListener("DOMContentLoaded", () => new PopupController());
