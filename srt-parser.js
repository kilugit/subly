(function () {
  if (typeof window !== "undefined" && window.SRTParser) {
    return;
  }

  class SRTParser {
    /**
     * Parse subtitle content into an array of subtitle objects.
     * @param {string} content - Raw SRT or VTT content.
     * @returns {Array<{index: number, startTime: number, endTime: number, text: string}>}
     */
    static parse(content) {
      if (!content || typeof content !== "string") {
        return [];
      }

      const clean = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
      const lines = clean.split(/\r?\n/);
      const totalLines = lines.length;
      const subtitles = [];
      const timeRegex = /^(?:(\d{1,4}):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,4}):)?(\d{2}):(\d{2})[,.](\d{1,3})/;
      const tagRegex = /<\/?[vc](?:[\s.][^>]*)?>|\{\\[^}]*\}/gi;

      let autoIndex = 1;
      let isSorted = true;
      let lastStartTime = 0;
      let i = 0;

      while (i < totalLines) {
        let line = lines[i].trim();
        if (!line || /^(?:WEBVTT|NOTE|STYLE|REGION)\b/i.test(line)) {
          i++;
          continue;
        }

        let timeMatch = null;
        let cueIndex = autoIndex;

        if (line.includes("-->")) {
          timeMatch = line.match(timeRegex);
        } else if (i + 1 < totalLines && lines[i + 1].includes("-->")) {
          const parsed = parseInt(line, 10);
          if (!isNaN(parsed)) cueIndex = parsed;
          i++;
          line = lines[i].trim();
          timeMatch = line.match(timeRegex);
        }

        if (!timeMatch) {
          i++;
          continue;
        }

        autoIndex++;
        const startTime = this._parseTimeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
        const endTime = this._parseTimeToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);

        i++;
        let text = "";
        while (i < totalLines) {
          const textLine = lines[i];
          if (!textLine.trim()) break;
          text = text ? text + "\n" + textLine : textLine;
          i++;
        }

        if (isNaN(startTime) || isNaN(endTime) || startTime > endTime || !text) {
          continue;
        }

        if (text.indexOf("<") !== -1 || text.indexOf("{\\") !== -1) {
          text = text.replace(tagRegex, "");
        }

        if (startTime < lastStartTime) isSorted = false;
        lastStartTime = startTime;

        subtitles.push({
          index: cueIndex,
          startTime,
          endTime,
          text: text.trim(),
        });
      }

      if (!isSorted) {
        subtitles.sort((a, b) => a.startTime - b.startTime);
      }
      return subtitles;
    }

    /**
     * Convert time components to seconds float.
     * @private
     */
    static _parseTimeToSeconds(hours, minutes, seconds, milliseconds) {
      const h = hours ? +hours : 0;
      const m = +minutes;
      const s = +seconds;
      let ms = +milliseconds || 0;
      if (milliseconds) {
        const len = milliseconds.length;
        if (len === 1) ms *= 100;
        else if (len === 2) ms *= 10;
        else if (len > 3) ms = +(milliseconds.slice(0, 3));
      }

      if (isNaN(h) || isNaN(m) || isNaN(s) || isNaN(ms)) {
        return NaN;
      }
      return h * 3600 + m * 60 + s + ms / 1000;
    }

    /**
     * Helper to format seconds into HH:MM:SS or MM:SS format.
     * @param {number} seconds
     * @param {boolean} [includeMs=false]
     * @returns {string}
     */
    static formatTime(seconds, includeMs = false) {
      if (isNaN(seconds) || seconds < 0) seconds = 0;
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);

      const mStr = String(m).padStart(2, "0");
      const sStr = String(s).padStart(2, "0");
      const msStr = String(ms).padStart(3, "0");

      if (h > 0) {
        const hStr = String(h).padStart(2, "0");
        return includeMs
          ? `${hStr}:${mStr}:${sStr}.${msStr}`
          : `${hStr}:${mStr}:${sStr}`;
      }
      return includeMs ? `${mStr}:${sStr}.${msStr}` : `${mStr}:${sStr}`;
    }
  }

  if (typeof window !== "undefined") {
    window.SRTParser = SRTParser;
    window.SubtitleParser = SRTParser;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.SRTParser = SRTParser;
    globalThis.SubtitleParser = SRTParser;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = SRTParser;
  }
})();
