class WordValidatorFile {
  constructor(filePath) {
    this.byLength = new Map();
    this.ready = false;
    try {
      const fs = require('node:fs');
      const raw = fs.readFileSync(filePath, 'utf8');
      const words = raw
        .split(/\r?\n/)
        .map((w) => w.trim())
        .filter((w) => w.length > 0)
        .map((w) => w.toUpperCase());
      for (const w of words) {
        const len = w.length;
        const arr = this.byLength.get(len) || [];
        arr.push(w);
        this.byLength.set(len, arr);
      }
      this.ready = true;
      console.log(`[dict] Loaded ${words.length} words from ${filePath}`);
    } catch (e) {
      console.warn(`[dict] Failed to load dictionary at ${filePath}:`, e?.message || e);
      this.ready = false;
    }
  }

  async isWordValid(word) {
    if (!this.ready) return false;
    const W = (word || '').toUpperCase();
    const pool = this.byLength.get(W.length);
    if (!pool) return false;
    if (!W.includes('?')) {
      for (const v of pool) if (v === W) return true;
      return false;
    }
    const wcIdx = [];
    for (let i = 0; i < W.length; i++) if (W[i] === '?') wcIdx.push(i);
    outer: for (const v of pool) {
      for (let i = 0; i < W.length; i++) {
        const c = W[i];
        if (c === '?') continue;
        if (v[i] !== c) continue outer;
      }
      return true;
    }
    return false;
  }
}

module.exports = { WordValidatorFile };

