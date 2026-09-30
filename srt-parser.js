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

      // Strip UTF-8 BOM and normalize all line breaks to \n
      let clean = content
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

      const isVTT = clean.trim().startsWith("WEBVTT");

      // Clean WebVTT header and non-cue blocks
      if (isVTT) {
        clean = clean.replace(/^WEBVTT[^\n]*\n+/i, "");
        // Remove NOTE blocks (NOTE comment... until empty line)
        clean = clean.replace(/NOTE(\s+[^\n]*)?(\n[^\n]+)*\n*/gi, "");
        // Remove STYLE blocks
        clean = clean.replace(/STYLE(\s+[^\n]*)?(\n[^\n]+)*\n*/gi, "");
        // Remove REGION blocks
        clean = clean.replace(/REGION(\s+[^\n]*)?(\n[^\n]+)*\n*/gi, "");
      }

      const subtitles = [];
      // Split into cue blocks separated by two or more newlines
      const rawBlocks = clean.trim().split(/\n\s*\n+/);
      let autoIndex = 1;

      // Regex matches SRT / VTT timestamps:
      // Format: [HH:]MM:SS[,.]mmm --> [HH:]MM:SS[,.]mmm [optional cue settings]
      const timeRegex = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})(?:[^\n]*)$/;

      for (let i = 0; i < rawBlocks.length; i++) {
        let block = rawBlocks[i].trim();
        if (!block) continue;

        const lines = block.split("\n").map((l) => l.trimEnd());
        if (lines.length === 0) continue;

        let timeLineIdx = -1;
        let timeMatch = null;

        // The timestamp line is usually line 0 (VTT) or line 1 (SRT), check up to first 4 lines
        for (let j = 0; j < Math.min(lines.length, 4); j++) {
          const m = lines[j].trim().match(timeRegex);
          if (m) {
            timeLineIdx = j;
            timeMatch = m;
            break;
          }
        }

        if (timeLineIdx === -1 || !timeMatch) continue;

        // Determine index number
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

        // Extract raw subtitle text
        let textLines = lines.slice(timeLineIdx + 1);
        let text = textLines.join("\n").trim();
        if (!text) continue;

        // Clean VTT voice tags like <v Speaker> or </v>, class tags <c.yellow>, ASS {\...}
        text = text
          .replace(/<v(?:\s+[^>]*)?>/gi, "")
          .replace(/<\/v>/gi, "")
          .replace(/<c(?:\.[^>]*)?>/gi, "")
          .replace(/<\/c>/gi, "")
          .replace(/\{\\[^}]*\}/g, "");

        subtitles.push({
          index,
          startTime,
          endTime,
          text,
        });
      }

      // Sort cues chronologically
      subtitles.sort((a, b) => a.startTime - b.startTime);

      return subtitles;
    }

    /**
     * Convert time components to seconds float.
     * @private
     */
    static _parseTimeToSeconds(hours, minutes, seconds, milliseconds) {
      const h = hours ? parseInt(hours, 10) : 0;
      const m = parseInt(minutes, 10);
      const s = parseInt(seconds, 10);
      const msStr = (milliseconds || "0").padEnd(3, "0").slice(0, 3);
      const ms = parseInt(msStr, 10);

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
