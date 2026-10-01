/**
 * Subly Subtitle Parser
 * Supports SubRip (.srt), WebVTT (.vtt), and timestamped text files.
 * Handles Windows/Unix line endings, UTF-8 BOM, decimal commas/periods,
 * optional hours, cue tags, and overlapping timestamps.
 * 
 * Safe against duplicate execution via var + singleton guard.
 */

(function () {
  // If already declared on global window, reuse it
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

      // Strip UTF-8 BOM and normalize CRLF/CR to LF in one pass
      const clean = content.charCodeAt(0) === 0xFEFF
        ? content.slice(1).replace(/\r\n?/g, "\n")
        : content.replace(/\r\n?/g, "\n");

      const subtitles = [];
      const rawBlocks = clean.trim().split(/\n\s*\n+/);
      let autoIndex = 1;

      const timeRegex = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})(?:[^\n]*)$/;
      const tagRegex = /<\/?[vc](?:[\s.][^>]*)?>|\{\\[^}]*\}/gi;

      for (let i = 0; i < rawBlocks.length; i++) {
        const block = rawBlocks[i].trim();
        if (!block) continue;

        // Skip WebVTT header and non-cue blocks
        if (/^(?:WEBVTT|NOTE|STYLE|REGION)\b/i.test(block)) continue;

        const lines = block.split("\n");
        const numLines = lines.length;
        if (numLines === 0) continue;

        let timeLineIdx = -1;
        let timeMatch = null;

        const checkLimit = numLines < 4 ? numLines : 4;
        for (let j = 0; j < checkLimit; j++) {
          const m = lines[j].trim().match(timeRegex);
          if (m) {
            timeLineIdx = j;
            timeMatch = m;
            break;
          }
        }

        if (timeLineIdx === -1 || !timeMatch) continue;

        let index = autoIndex++;
        if (timeLineIdx > 0) {
          const parsedIdx = parseInt(lines[0].trim(), 10);
          if (!isNaN(parsedIdx)) {
            index = parsedIdx;
          }
        }

        const startTime = this._parseTimeToSeconds(
          timeMatch[1],
          timeMatch[2],
          timeMatch[3],
          timeMatch[4]
        );
        const endTime = this._parseTimeToSeconds(
          timeMatch[5],
          timeMatch[6],
          timeMatch[7],
          timeMatch[8]
        );

        if (isNaN(startTime) || isNaN(endTime) || startTime > endTime) continue;

        let text = lines.slice(timeLineIdx + 1).join("\n").trim();
        if (!text) continue;

        if (text.indexOf("<") !== -1 || text.indexOf("{\\") !== -1) {
          text = text.replace(tagRegex, "");
        }

        subtitles.push({
          index,
          startTime,
          endTime,
          text,
        });
      }

      subtitles.sort((a, b) => a.startTime - b.startTime);
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

  // Global aliases for both popup and content script contexts
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
