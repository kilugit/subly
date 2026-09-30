class SRTParser {
  static parse(srtContent) {
    if (!srtContent || typeof srtContent !== "string") {
      return [];
    }

    const subtitles = [];
    const blocks = srtContent.trim().split(/\n\s*\n/);

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block) continue;

      const lines = block.trim().split("\n");
      if (lines.length < 3) continue;

      const index = parseInt(lines[0], 10);
      if (isNaN(index)) continue;

      const timeString = lines[1];
      const text = lines.slice(2).join("\n");

      const timeMatch = timeString.match(
        /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
      );
      if (!timeMatch) continue;

      const startTime = this.timeToSeconds(
        timeMatch[1],
        timeMatch[2],
        timeMatch[3],
        timeMatch[4]
      );
      const endTime = this.timeToSeconds(
        timeMatch[5],
        timeMatch[6],
        timeMatch[7],
        timeMatch[8]
      );

      if (isNaN(startTime) || isNaN(endTime) || startTime > endTime) continue;

      subtitles.push({
        index,
        startTime,
        endTime,
        text,
      });
    }

    return subtitles;
  }

  static timeToSeconds(hours, minutes, seconds, milliseconds) {
    const h = parseInt(hours, 10);
    const m = parseInt(minutes, 10);
    const s = parseInt(seconds, 10);
    const ms = parseInt(milliseconds, 10);

    if (isNaN(h) || isNaN(m) || isNaN(s) || isNaN(ms)) {
      return NaN;
    }

    return h * 3600 + m * 60 + s + ms / 1000;
  }
}
