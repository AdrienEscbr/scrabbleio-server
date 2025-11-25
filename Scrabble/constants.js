// Global configuration and constants (Scrabble)

const TURN_DURATION_MS = 180000; // 3 minutes
const MAX_CONSECUTIVE_PASSES = 6;

// Force FR as requested, but allow override
const LANGUAGE = process.env.SCRABBLE_LANG || 'FR';

// Standard Scrabble 15x15 board bonus layout.
// Bonus types: DL, TL, DW, TW
function generateBonusLayout() {
  const TW = [
    [0, 0], [0, 7], [0, 14],
    [7, 0], [7, 14],
    [14, 0], [14, 7], [14, 14],
  ];
  const DW = [
    [1, 1], [2, 2], [3, 3], [4, 4], [10, 10], [11, 11], [12, 12], [13, 13],
    [1, 13], [2, 12], [3, 11], [4, 10], [10, 4], [11, 3], [12, 2], [13, 1],
    [7, 7], // center
  ];
  const TL = [
    [1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13],
    [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9],
  ];
  const DL = [
    [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14],
    [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11],
    [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14],
    [12, 6], [12, 8], [14, 3], [14, 11],
  ];
  const out = [];
  for (const [x, y] of TW) out.push({ x, y, bonus: 'TW' });
  for (const [x, y] of DW) out.push({ x, y, bonus: 'DW' });
  for (const [x, y] of TL) out.push({ x, y, bonus: 'TL' });
  for (const [x, y] of DL) out.push({ x, y, bonus: 'DL' });
  return out;
}

// Letter distributions (counts and values)
function getLetterDistribution(lang) {
  if ((lang || LANGUAGE) === 'FR') {
    return [
      { letter: 'A', count: 9, value: 1 },
      { letter: 'B', count: 2, value: 3 },
      { letter: 'C', count: 2, value: 3 },
      { letter: 'D', count: 3, value: 2 },
      { letter: 'E', count: 15, value: 1 },
      { letter: 'F', count: 2, value: 4 },
      { letter: 'G', count: 2, value: 2 },
      { letter: 'H', count: 2, value: 4 },
      { letter: 'I', count: 8, value: 1 },
      { letter: 'J', count: 1, value: 8 },
      { letter: 'K', count: 1, value: 10 },
      { letter: 'L', count: 5, value: 1 },
      { letter: 'M', count: 3, value: 2 },
      { letter: 'N', count: 6, value: 1 },
      { letter: 'O', count: 6, value: 1 },
      { letter: 'P', count: 2, value: 3 },
      { letter: 'Q', count: 1, value: 8 },
      { letter: 'R', count: 6, value: 1 },
      { letter: 'S', count: 6, value: 1 },
      { letter: 'T', count: 6, value: 1 },
      { letter: 'U', count: 6, value: 1 },
      { letter: 'V', count: 2, value: 4 },
      { letter: 'W', count: 1, value: 10 },
      { letter: 'X', count: 1, value: 10 },
      { letter: 'Y', count: 1, value: 10 },
      { letter: 'Z', count: 1, value: 10 },
      { letter: '', count: 2, value: 0, isJoker: true },
    ];
  }
  // EN default
  return [
    { letter: 'A', count: 9, value: 1 },
    { letter: 'B', count: 2, value: 3 },
    { letter: 'C', count: 2, value: 3 },
    { letter: 'D', count: 4, value: 2 },
    { letter: 'E', count: 12, value: 1 },
    { letter: 'F', count: 2, value: 4 },
    { letter: 'G', count: 3, value: 2 },
    { letter: 'H', count: 2, value: 4 },
    { letter: 'I', count: 9, value: 1 },
    { letter: 'J', count: 1, value: 8 },
    { letter: 'K', count: 1, value: 5 },
    { letter: 'L', count: 4, value: 1 },
    { letter: 'M', count: 2, value: 3 },
    { letter: 'N', count: 6, value: 1 },
    { letter: 'O', count: 8, value: 1 },
    { letter: 'P', count: 2, value: 3 },
    { letter: 'Q', count: 1, value: 10 },
    { letter: 'R', count: 6, value: 1 },
    { letter: 'S', count: 4, value: 1 },
    { letter: 'T', count: 6, value: 1 },
    { letter: 'U', count: 4, value: 1 },
    { letter: 'V', count: 2, value: 4 },
    { letter: 'W', count: 2, value: 4 },
    { letter: 'X', count: 1, value: 8 },
    { letter: 'Y', count: 2, value: 4 },
    { letter: 'Z', count: 1, value: 10 },
    { letter: '', count: 2, value: 0, isJoker: true },
  ];
}

module.exports = {
  TURN_DURATION_MS,
  MAX_CONSECUTIVE_PASSES,
  LANGUAGE,
  generateBonusLayout,
  getLetterDistribution,
};

