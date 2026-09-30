class PopupController {
  constructor() {
    this.fileInput = document.getElementById("fileInput");
    this.loadBtn = document.getElementById("loadBtn");
    this.status = document.getElementById("status");
    this.dropArea = document.getElementById("dropArea");
    this.urlInput = document.getElementById("urlInput");
    this.fetchBtn = document.getElementById("fetchBtn");
    this.settingsPanel = document.getElementById("settingsPanel");
    this.toggleSettings = document.getElementById("toggleSettings");
    this.fontSize = document.getElementById("fontSize");
    this.fontSizeRange = document.getElementById("fontSizeRange");
    this.position = document.getElementById("position");
    this.opacity = document.getElementById("opacity");
    this.opacityRange = document.getElementById("opacityRange");
    this.textColor = document.getElementById("textColor");
    this.subtitleToggle = document.getElementById("subtitleToggle");
    this.toggleSubtitlesBtn = document.getElementById("toggleSubtitlesBtn");
    this.versionDisplay = document.getElementById("versionDisplay");
    this.resizer = document.getElementById("resizer");
    this.sizeHint = document.getElementById("sizeHint");

    this.selectedFile = null;
    this.srtContent = null;
    this.settings = {
      fontSize: 18,
      position: "bottom",
      opacity: 80,
      textColor: "#ffffff",
    };
    this._updateTimeout = null;
    this._activeTab = null;
    this._resizeSaveTimeout = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupResizer();
    this.loadSettings();
    this.loadVersion();
    this.applySavedSize();
    this.checkAutoLoad();
  }

  setupEventListeners() {
    this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e.target.files[0]));
    this.dropArea.addEventListener("click", () => this.fileInput.click());

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
    this.toggleSettings.addEventListener("click", () => {
      const visible = this.settingsPanel.classList.toggle("visible");
      this.toggleSettings.classList.toggle("open", visible);
    });

    this.fontSizeRange.addEventListener("input", (e) =>
      this.updateSetting("fontSize", Number(e.target.value))
    );
    this.opacityRange.addEventListener("input", (e) =>
      this.updateSetting("opacity", Number(e.target.value))
    );

    this.position.addEventListener("change", (e) => this.updateSetting("position", e.target.value));
    this.textColor.addEventListener("input", (e) => this.updateSetting("textColor", e.target.value));
    this.toggleSubtitlesBtn.addEventListener("click", () => this.toggleSubtitles());
  }

  setupResizer() {
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;
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
      const maxW = Math.min(
        parseInt(getComputedStyle(document.body).maxWidth, 10),
        window.screen.availWidth
      );
      const maxH = parseInt(getComputedStyle(document.body).maxHeight, 10);

      const w = Math.min(maxW, Math.max(minW, startW + e.clientX - startX));
      const h = Math.min(maxH, Math.max(minH, startH + e.clientY - startY));
      document.body.style.width = `${w}px`;
      document.body.style.height = `${h}px`;
      this.sizeHint.textContent = ` \u2022 ${w}\u00d7${h}`;
      this.saveSize(w, h);
    });

    const stop = () => {
      dragging = false;
    };
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
        this.sizeHint.textContent = ` \u2022 ${Math.round(width)}\u00d7${Math.round(height)}`;
      }
    } catch (_) {
      // storage unavailable; keep default size
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(["subtitleSettings", "subtitlesEnabled"]);
      if (result.subtitleSettings) {
        this.settings = { ...this.settings, ...result.subtitleSettings };
      }
      this.updateUI();
      this.updateSubtitleToggle(result.subtitlesEnabled !== false);
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  updateUI() {
    this.fontSize.textContent = `${this.settings.fontSize}px`;
    this.fontSizeRange.value = this.settings.fontSize;
    this.position.value = this.settings.position;
    this.opacity.textContent = `${this.settings.opacity}%`;
    this.opacityRange.value = this.settings.opacity;
    this.textColor.value = this.settings.textColor;
  }

  async loadVersion() {
    try {
      const manifest = chrome.runtime.getManifest();
      this.versionDisplay.textContent = `v${manifest.version}`;
    } catch (error) {
      this.versionDisplay.textContent = "v1.0";
    }
  }

  async getActiveTab() {
    if (this._activeTab) return this._activeTab;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this._activeTab = tab;
    return tab;
  }

  handleFileSelect(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".srt")) {
      this.showStatus("Please select a valid SRT file", "error");
      return;
    }
    this.selectedFile = file;
    this.srtContent = null;
    this.loadBtn.disabled = false;
    this.dropArea.querySelector(".drop-zone-text").textContent = `Selected: ${file.name}`;
    this.urlInput.value = "";
    this.fetchBtn.disabled = true;
    this.clearStatus();
    this.loadSubtitles();
  }

  async handleUrlFetch() {
    const url = this.urlInput.value.trim();
    if (!url) return;

    try {
      this.fetchBtn.disabled = true;
      this.showStatus("Fetching...", "info");

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const content = await response.text();
      if (!content.includes("-->")) throw new Error("Invalid SRT format");

      this.srtContent = content;
      this.selectedFile = null;
      this.loadBtn.disabled = false;
      this.dropArea.querySelector(".drop-zone-text").textContent = "SRT fetched from URL";
      this.showStatus("SRT fetched!", "success");
    } catch (error) {
      console.error("Fetch error:", error);
      this.showStatus("Failed to fetch SRT", "error");
    } finally {
      this.fetchBtn.disabled = !this.urlInput.value.trim();
    }
  }

  async loadSubtitles() {
    if (!this.selectedFile && !this.srtContent) return;

    try {
      this.loadBtn.disabled = true;
      this.showStatus("Loading...", "info");

      let content = this.srtContent;
      if (this.selectedFile) {
        content = await this.readFile(this.selectedFile);
      }

      const tab = await this.getActiveTab();
      if (!tab?.url?.includes("youtube.com/watch")) {
        this.showStatus("Navigate to a YouTube video first", "error");
        this.loadBtn.disabled = false;
        return;
      }

      await this.sendMessage(tab.id, { action: "loadSubtitles", srtContent: content });
      this.showStatus("Subtitles loaded!", "success");
      this.updateSubtitleToggle(true);

      setTimeout(() => window.close(), 1500);
    } catch (error) {
      console.error("Load error:", error);
      if (error.message?.includes("Receiving end does not exist")) {
        this.showStatus("Refresh the YouTube page and try again", "error");
      } else {
        this.showStatus("Failed to load subtitles", "error");
      }
      this.loadBtn.disabled = false;
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

  async updateSetting(key, value) {
    this.settings[key] = value;
    this.updateUI();

    clearTimeout(this._updateTimeout);
    this._updateTimeout = setTimeout(async () => {
      try {
        await chrome.storage.sync.set({ subtitleSettings: this.settings });

        const tab = await this.getActiveTab();
        if (tab?.url?.includes("youtube.com")) {
          await this.sendMessage(tab.id, { action: "updateSettings", settings: this.settings });
        }
      } catch (error) {
        console.error("Update error:", error);
      }
    }, 100);
  }

  async toggleSubtitles() {
    try {
      const tab = await this.getActiveTab();
      if (!tab?.url?.includes("youtube.com")) {
        this.showStatus("Navigate to a YouTube video first", "error");
        return;
      }

      const response = await this.sendMessage(tab.id, { action: "toggleSubtitles" });
      if (response?.success) {
        this.updateSubtitleToggle(response.enabled);
      }
    } catch (error) {
      console.error("Toggle error:", error);
      this.showStatus("Failed to toggle subtitles", "error");
    }
  }

  updateSubtitleToggle(enabled) {
    this.subtitleToggle.style.display = "block";
    this.toggleSubtitlesBtn.textContent = enabled ? "Disable Subtitles" : "Enable Subtitles";
    this.toggleSubtitlesBtn.className = `btn-toggle ${enabled ? "enabled" : "disabled"}`;
  }

  async sendMessage(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      if (error.message?.includes("Receiving end does not exist")) {
        throw error;
      }
      console.error("Message error:", error);
      return null;
    }
  }

  showStatus(message, type) {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
    this.status.style.display = "block";
  }

  clearStatus() {
    this.status.style.display = "none";
  }

  async checkAutoLoad() {
    try {
      const config = await this.fetchConfig();
      if (!config?.videoMappings) return;

      const tab = await this.getActiveTab();
      if (!tab?.url?.includes("youtube.com/watch")) return;

      const videoId = new URLSearchParams(new URL(tab.url).search).get("v");
      if (videoId && config.videoMappings[videoId]) {
        this.showStatus("Auto-loading subtitles...", "info");
        const response = await fetch(config.videoMappings[videoId]);
        if (response.ok) {
          const content = await response.text();
          if (content.includes("-->")) {
            this.srtContent = content;
            this.selectedFile = null;
            this.loadBtn.disabled = false;
            this.dropArea.querySelector(".drop-zone-text").textContent = "Auto-loaded SRT";
            this.urlInput.value = config.videoMappings[videoId];
            this.fetchBtn.disabled = false;
            this.showStatus("Subtitles auto-loaded!", "success");
          }
        }
      }
    } catch (error) {
      console.error("Auto-load error:", error);
    }
  }

  async fetchConfig() {
    try {
      const response = await fetch(chrome.runtime.getURL("config.json"));
      return response.ok ? await response.json() : null;
    } catch (error) {
      return null;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => new PopupController());
