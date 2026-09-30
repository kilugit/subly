class PopupController {
  constructor() {
    this.fileInput = document.getElementById("fileInput");
    this.loadBtn = document.getElementById("loadBtn");
    this.status = document.getElementById("status");
    this.dropArea = document.getElementById("dropArea");
    this.urlInput = document.getElementById("urlInput");
    this.fetchBtn = document.getElementById("fetchBtn");
    this.selectedFile = null;
    this.srtContent = null;
    this.settingsPanel = document.getElementById("settingsPanel");
    this.toggleSettings = document.getElementById("toggleSettings");
    this.fontSize = document.getElementById("fontSize");
    this.position = document.getElementById("position");
    this.opacity = document.getElementById("opacity");
    this.textColor = document.getElementById("textColor");
    this.subtitleStatus = document.getElementById("subtitleStatus");
    this.statusText = document.getElementById("statusText");
    this.toggleSubtitlesBtn = document.getElementById("toggleSubtitlesBtn");
    this.updateTimeout = null;
    this._debouncedUpdateSetting = null;
    this._activeTab = null;

    this.init();
    this.loadSettings();
    this.loadVersion();
    this.autoPopulateSubtitles();
  }

  init() {
    this.setupEventListeners();
  }

  debounce(func, wait) {
    return (...args) => {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  async getActiveTab() {
    if (this._activeTab) return this._activeTab;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this._activeTab = tab;
    return tab;
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        "subtitleSettings",
        "subtitlesEnabled",
      ]);
      const settings = result.subtitleSettings || {
        fontSize: 18,
        position: "bottom",
        opacity: 80,
        textColor: "#ffffff",
      };

      this.fontSize.textContent = settings.fontSize;
      this.position.value = settings.position;
      this.opacity.textContent = settings.opacity;
      this.textColor.value = settings.textColor;

      this.updateSubtitleStatus(result.subtitlesEnabled !== false);
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  async loadVersion() {
    try {
      const manifest = chrome.runtime.getManifest();
      const versionElement = document.getElementById("versionDisplay");
      if (versionElement && manifest.version) {
        versionElement.textContent = `v${manifest.version}`;
      }
    } catch (error) {
      console.error("Failed to load version:", error);
      const versionElement = document.getElementById("versionDisplay");
      if (versionElement) {
        versionElement.textContent = "v1.0";
      }
    }
  }

  setupEventListeners() {
    this.fileInput.addEventListener("change", (e) => {
      this.handleFileSelect(e.target.files[0]);
    });

    this.dropArea.addEventListener("click", () => {
      this.fileInput.click();
    });

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
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileSelect(files[0]);
      }
    });

    this.urlInput.addEventListener("input", () => {
      const url = this.urlInput.value.trim();
      this.fetchBtn.disabled = !url;
    });

    this.fetchBtn.addEventListener("click", () => {
      this.handleUrlFetch(this.urlInput.value.trim());
    });

    this.loadBtn.addEventListener("click", () => {
      this.loadSubtitles();
    });

    this.toggleSettings.addEventListener("click", () => {
      this.settingsPanel.classList.toggle("visible");
    });

    document
      .querySelectorAll(
        '[data-action="increaseSize"], [data-action="decreaseSize"]'
      )
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const currentSize = parseInt(this.fontSize.textContent, 10);
          const newSize =
            btn.dataset.action === "increaseSize"
              ? Math.min(64, currentSize + 2)
              : Math.max(12, currentSize - 2);
          this.fontSize.textContent = newSize;
          this.debouncedUpdateSetting("fontSize", newSize);
        });
      });

    document
      .querySelectorAll(
        '[data-action="increaseOpacity"], [data-action="decreaseOpacity"]'
      )
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const currentOpacity = parseInt(this.opacity.textContent, 10);
          const newOpacity =
            btn.dataset.action === "increaseOpacity"
              ? Math.min(100, currentOpacity + 10)
              : Math.max(0, currentOpacity - 10);
          this.opacity.textContent = newOpacity;
          this.debouncedUpdateSetting("opacity", newOpacity);
        });
      });

    this.position.addEventListener("change", (e) => {
      this.updateSetting("position", e.target.value);
    });

    this.textColor.addEventListener("input", (e) => {
      this.debouncedUpdateSetting("textColor", e.target.value);
    });

    this.toggleSubtitlesBtn.addEventListener("click", () => {
      this.toggleSubtitles();
    });

    this._debouncedUpdateSetting = this.debounce(
      this.updateSetting.bind(this),
      100
    );
  }

  handleFileSelect(file) {
    if (!file) return;

    if (file.type !== "application/x-subrip" && !file.name.endsWith(".srt")) {
      this.showStatus("Please select a valid SRT file", "error");
      return;
    }

    this.selectedFile = file;
    this.srtContent = null;
    this.loadBtn.disabled = false;
    this.dropArea.querySelector(
      ".file-label"
    ).textContent = `Selected: ${file.name}`;
    this.urlInput.value = "";
    this.clearStatus();
  }

  async handleUrlFetch(url) {
    if (!url) return;

    try {
      this.fetchBtn.disabled = true;
      this.showStatus("Fetching SRT file...", "info");

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const content = await response.text();
      if (!content.includes("-->")) {
        throw new Error("Invalid SRT format");
      }

      this.srtContent = content;
      this.selectedFile = null;
      this.loadBtn.disabled = false;
      this.dropArea.querySelector(".file-label").textContent =
        "SRT file fetched from URL";
      this.showStatus("SRT file fetched successfully!", "success");
    } catch (error) {
      console.error("Error fetching SRT:", error);
      this.showStatus(
        "Error fetching SRT file. Please check the URL.",
        "error"
      );
    } finally {
      this.fetchBtn.disabled = false;
    }
  }

  async loadSubtitles() {
    if (!this.selectedFile && !this.srtContent) return;

    try {
      this.loadBtn.disabled = true;
      this.showStatus("Loading subtitles...", "info");

      let srtContent = this.srtContent;
      if (this.selectedFile) {
        srtContent = await this.readFile(this.selectedFile);
      }

      const tab = await this.getActiveTab();
      if (!tab || !tab.url || !tab.url.includes("youtube.com/watch")) {
        this.showStatus("Please navigate to a YouTube video first", "error");
        this.loadBtn.disabled = false;
        return;
      }

      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: "loadSubtitles",
          srtContent: srtContent,
        });
      } catch (sendError) {
        if (sendError.message?.includes("Receiving end does not exist")) {
          this.showStatus("Please refresh the YouTube page and try again", "error");
          this.loadBtn.disabled = false;
          return;
        }
        throw sendError;
      }

      this.showStatus("Subtitles loaded successfully!", "success");
      this.updateSubtitleStatus(true);

      setTimeout(() => {
        window.close();
      }, 2000);
    } catch (error) {
      console.error("Error loading subtitles:", error);
      this.showStatus("Error loading subtitles. Please try again.", "error");
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

  showStatus(message, type) {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
    this.status.style.display = "block";
  }

  clearStatus() {
    this.status.style.display = "none";
  }

  async updateSetting(key, value) {
    try {
      const result = await chrome.storage.sync.get(["subtitleSettings"]);
      const settings = result.subtitleSettings || {
        fontSize: 18,
        position: "bottom",
        opacity: 80,
        textColor: "#ffffff",
      };

      settings[key] = value;
      await chrome.storage.sync.set({ subtitleSettings: settings });

      switch (key) {
        case "fontSize":
          this.fontSize.textContent = value;
          break;
        case "opacity":
          this.opacity.textContent = value;
          break;
        case "position":
          this.position.value = value;
          break;
        case "textColor":
          this.textColor.value = value;
          break;
      }

      const tab = await this.getActiveTab();
      if (tab && tab.url && tab.url.includes("youtube.com")) {
        await chrome.tabs.sendMessage(tab.id, {
          action: "updateSettings",
          settings: settings,
        });
      }
    } catch (error) {
      console.error("Error updating setting:", error);
    }
  }

  async toggleSubtitles() {
    try {
      const tab = await this.getActiveTab();
      if (!tab || !tab.url || !tab.url.includes("youtube.com")) {
        this.showStatus("Please navigate to a YouTube video first", "error");
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "toggleSubtitles",
      });

      if (response && response.success) {
        this.updateSubtitleStatus(response.enabled);
      }
    } catch (error) {
      console.error("Error toggling subtitles:", error);
      this.showStatus("Error: Please ensure you're on a YouTube page", "error");
    }
  }

  updateSubtitleStatus(enabled) {
    if (!this.subtitleStatus) return;

    this.subtitleStatus.style.display = "block";
    this.subtitleStatus.className = `subtitle-status ${
      enabled ? "enabled" : "disabled"
    }`;

    this.statusText.textContent = enabled
      ? "Subtitles enabled"
      : "Subtitles disabled";

    this.toggleSubtitlesBtn.textContent = enabled
      ? "Disable (Alt+T)"
      : "Enable (Alt+T)";
    this.toggleSubtitlesBtn.className = `toggle-subtitles-btn ${
      enabled ? "" : "disabled"
    }`;
    this.toggleSubtitlesBtn.style.background = enabled ? "#4CAF50" : "#ff5722";
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

  async autoPopulateSubtitles() {
    try {
      const config = await this.fetchConfig();
      if (!config || !config.videoMappings) return;

      const tab = await this.getActiveTab();
      if (!tab || !tab.url || !tab.url.includes("youtube.com")) return;

      const urlParams = new URLSearchParams(new URL(tab.url).search);
      const videoId = urlParams.get("v");

      if (videoId && config.videoMappings[videoId]) {
        const srtUrl = config.videoMappings[videoId];
        this.showStatus("Auto-populating subtitles...", "info");

        const response = await fetch(srtUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch SRT from ${srtUrl}`);
        }

        const content = await response.text();
        if (!content.includes("-->")) {
          throw new Error("Invalid SRT format");
        }

        this.srtContent = content;
        this.selectedFile = null;
        this.loadBtn.disabled = false;
        this.dropArea.querySelector(".file-label").textContent =
          "Auto-populated SRT file";

        this.urlInput.value = srtUrl;
        this.fetchBtn.disabled = false;

        this.showStatus("Subtitles auto-populated successfully!", "success");
      }
    } catch (error) {
      console.error("Error auto-populating subtitles:", error);
      this.showStatus("Error auto-populating subtitles.", "error");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
