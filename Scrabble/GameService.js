const { TURN_DURATION_MS, MAX_CONSECUTIVE_PASSES, generateBonusLayout, getLetterDistribution, LANGUAGE } = require('./constants');
const { tileId } = require('./id');

class GameService {
  constructor(wordValidator) {
    this.wordValidator = wordValidator;
  }

  startNewGame(room) {
    if (!room.players || room.players.length === 0) throw new Error('NO_PLAYERS');
    for (const p of room.players) {
      p.score = 0;
      p.rack = [];
      p.ready = false;
      p.stats = { wordsPlayed: 0, bestWordScore: 0, bestWord: null, totalTurns: 0, passes: 0 };
    }
    const board = [];
    for (let y = 0; y < 15; y++) {
      const row = [];
      for (let x = 0; x < 15; x++) row.push({ x, y, bonusUsed: false });
      board.push(row);
    }
    for (const b of generateBonusLayout()) {
      board[b.y][b.x].bonus = b.bonus;
    }
    const bag = [];
    for (const def of getLetterDistribution(LANGUAGE)) {
      for (let i = 0; i < def.count; i++) {
        bag.push({ id: tileId(), letter: def.letter, value: def.value, isJoker: !!def.isJoker });
      }
    }
    shuffle(bag);
    for (const p of room.players) {
      p.rack = drawTiles(bag, 7);
    }
    const now = Date.now();
    room.game = {
      board,
      bag,
      turnIndex: 0,
      activePlayerId: room.players[0].id,
      turnEndsAt: now + TURN_DURATION_MS,
      turnDurationMs: TURN_DURATION_MS,
      log: [],
      consecutivePasses: 0,
      startedAt: now,
      version: 1,
    };
  }

  async playMove(room, playerId, action, placements, tileIdsToExchange) {
    const game = room.game;
    if (!game) throw new Error('NO_GAME');
    const playerIdx = room.players.findIndex((p) => p.id === playerId);
    if (playerIdx < 0) throw new Error('PLAYER_NOT_IN_ROOM');
    if (game.activePlayerId !== playerId) throw new Error('NOT_YOUR_TURN');
    const player = room.players[playerIdx];

    if (action === 'pass') {
      player.stats.passes++;
      game.consecutivePasses++;
      const move = this.buildMoveSummary('pass', playerId, [], 0, game);
      game.lastMove = move;
      game.log.push(move);
      await this.advanceTurn(room);
      return { move, ended: this.checkAndFinalizeIfEnded(room) };
    }

    if (action === 'exchange') {
      const ids = tileIdsToExchange || [];
      if (ids.length === 0) throw new Error('NO_TILES_TO_EXCHANGE');
      if (game.bag.length < ids.length) throw new Error('BAG_TOO_SMALL');
      const own = new Set(player.rack.map((t) => t.id));
      for (const id of ids) if (!own.has(id)) throw new Error('TILE_NOT_IN_RACK');
      const toReturn = [];
      player.rack = player.rack.filter((t) => {
        if (ids.includes(t.id)) { toReturn.push(t); return false; }
        return true;
      });
      game.bag.push(...toReturn);
      shuffle(game.bag);
      player.rack.push(...drawTiles(game.bag, ids.length));
      player.stats.passes++;
      game.consecutivePasses++;
      const move = this.buildMoveSummary('exchange', playerId, [], 0, game);
      game.lastMove = move;
      game.log.push(move);
      await this.advanceTurn(room);
      return { move, ended: this.checkAndFinalizeIfEnded(room) };
    }

    const placementsList = placements || [];
    if (placementsList.length === 0) throw new Error('NO_PLACEMENTS');
    for (const pl of placementsList) {
      if (pl.x < 0 || pl.x >= 15 || pl.y < 0 || pl.y >= 15) throw new Error('OUT_OF_BOUNDS');
      if (game.board[pl.y][pl.x].tile) throw new Error('CELL_OCCUPIED');
    }
    const rackIds = new Set(player.rack.map((t) => t.id));
    const used = new Set();
    for (const pl of placementsList) {
      if (!rackIds.has(pl.tileId)) throw new Error('TILE_NOT_IN_RACK');
      if (used.has(pl.tileId)) throw new Error('DUPLICATE_TILE');
      used.add(pl.tileId);
    }
    const sameRow = placementsList.every((p) => p.y === placementsList[0].y);
    const sameCol = placementsList.every((p) => p.x === placementsList[0].x);
    if (!sameRow && !sameCol) throw new Error('NOT_ALIGNED');

    const firstMove = boardIsEmpty(game.board);
    if (firstMove) {
      if (!placementsList.some((p) => p.x === 7 && p.y === 7)) throw new Error('MUST_COVER_CENTER');
    }

    const placementInfo = new Map();
    for (const pl of placementsList) {
      const tile = player.rack.find((t) => t.id === pl.tileId);
      placementInfo.set(`${pl.x},${pl.y}`, { value: tile.value, letter: tile.letter || '' });
    }

    const direction = sameRow ? 'row' : 'col';
    const main = buildMainWord(game.board, placementsList, placementInfo, direction);
    if (!main.contiguous) throw new Error('NOT_CONTIGUOUS');
    if (!firstMove && !main.connected) throw new Error('NOT_CONNECTED');

    const cross = buildCrossWords(game.board, placementsList, placementInfo, direction);
    const allWords = [main.word, ...cross.map((c) => c.word)].filter((w) => w.length > 1);
    if (allWords.length === 0) throw new Error('NO_WORD_FORMED');

    for (const w of allWords) {
      const normalized = w.replace(/#/g, '?').toUpperCase();
      const ok = await this.wordValidator.isWordValid(normalized);
      if (!ok) throw Object.assign(new Error('INVALID_WORD'), { reason: w });
    }

    const { score: mainScore } = scoreWord(game.board, placementsList, placementInfo, direction, main);
    let total = mainScore;
    for (const cw of cross) {
      const { score } = scoreCrossWord(game.board, placementsList, placementInfo, cw);
      total += score;
    }
    if (placementsList.length === 7) total += 50; // bingo

    const turnNumber = (room.game?.version || 0) + 1;
    for (const pl of placementsList) {
      const tile = player.rack.find((t) => t.id === pl.tileId);
      const cell = game.board[pl.y][pl.x];
      cell.tile = { ...tile, fromPlayerId: playerId, turnPlayed: turnNumber };
      if (cell.bonus) cell.bonusUsed = true;
    }
    player.rack = player.rack.filter((t) => !used.has(t.id));
    player.rack.push(...drawTiles(game.bag, Math.min(7 - player.rack.length, game.bag.length)));

    player.score += total;
    player.stats.wordsPlayed += 1;
    player.stats.totalTurns += 1;
    if (total > player.stats.bestWordScore) {
      player.stats.bestWordScore = total;
      player.stats.bestWord = main.word;
    }
    game.consecutivePasses = 0;

    const move = this.buildMoveSummary('play', playerId, placementsList, total, game, allWords);
    game.lastMove = move;
    game.log.push(move);

    await this.advanceTurn(room);
    const ended = this.checkAndFinalizeIfEnded(room);
    return { move, ended };
  }

  buildMoveSummary(action, playerId, placements, score, game, words = []) {
    return {
      playerId,
      action,
      words,
      score,
      placements,
      turnNumber: game.version + 1,
      createdAt: Date.now(),
    };
  }

  async advanceTurn(room) {
    const game = room.game;
    game.turnIndex = (game.turnIndex + 1) % room.players.length;
    game.activePlayerId = room.players[game.turnIndex].id;
    game.turnEndsAt = Date.now() + game.turnDurationMs;
    game.version += 1;
  }

  checkAndFinalizeIfEnded(room) {
    const game = room.game;
    const anyEmptyRack = room.players.some((p) => p.rack.length === 0);
    if ((game.bag.length === 0 && anyEmptyRack) || game.consecutivePasses >= MAX_CONSECUTIVE_PASSES) {
      let finisher = room.players.find((p) => p.rack.length === 0);
      let sumOthers = 0;
      for (const p of room.players) {
        const malus = p.rack.reduce((acc, t) => acc + t.value, 0);
        p.score -= malus;
        if (p !== finisher) sumOthers += malus;
      }
      if (finisher) finisher.score += sumOthers;
      room.status = 'finished';
      return true;
    }
    return false;
  }
}

// Helpers (ported)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function drawTiles(bag, n) {
  const out = [];
  for (let i = 0; i < n && bag.length > 0; i++) out.push(bag.pop());
  return out;
}

function boardIsEmpty(board) {
  for (const row of board) for (const c of row) if (c.tile) return false;
  return true;
}

function buildMainWord(board, placements, placementInfo, dir) {
  if (dir === 'row') {
    const y = placements[0].y;
    const xs = placements.map((p) => p.x).sort((a, b) => a - b);
    let x0 = xs[0];
    let x1 = xs[xs.length - 1];
    while (x0 - 1 >= 0 && board[y][x0 - 1].tile) x0--;
    while (x1 + 1 < 15 && board[y][x1 + 1].tile) x1++;
    let word = '';
    let connected = false;
    let contiguous = true;
    for (let x = x0; x <= x1; x++) {
      const cell = board[y][x];
      const placedHere = placements.find((p) => p.x === x && p.y === y);
      if (cell.tile) {
        const t = cell.tile;
        const ch = t.isJoker ? '?' : (t.letter || '');
        word += ch; connected = true;
      } else if (placedHere) {
        const info = placementInfo.get(`${x},${y}`);
        const ch = (info?.letter ?? '') === '' ? '?' : (info?.letter || '#');
        word += ch;
      } else {
        contiguous = false;
        word += '.';
      }
    }
    if (word.includes('.')) contiguous = false;
    if (!connected) {
      for (const p of placements) {
        if ((p.x > 0 && board[y][p.x - 1].tile) || (p.x < 14 && board[y][p.x + 1].tile) || (y > 0 && board[y - 1][p.x].tile) || (y < 14 && board[y + 1][p.x].tile)) { connected = true; break; }
      }
    }
    const letters = [];
    for (let x = x0; x <= x1; x++) {
      const cell = board[y][x];
      const placed = placements.find((p) => p.x === x && p.y === y);
      if (cell.tile) { const t = cell.tile; letters.push(t.isJoker ? '?' : (t.letter || '')); }
      else if (placed) { const info = placementInfo.get(`${x},${y}`); letters.push((info?.letter ?? '') === '' ? '?' : (info?.letter || '#')); }
      else letters.push('');
    }
    return { x0, x1, y, word: letters.join(''), connected, contiguous };
  }
  const x = placements[0].x;
  const ys = placements.map((p) => p.y).sort((a, b) => a - b);
  let y0 = ys[0];
  let y1 = ys[ys.length - 1];
  while (y0 - 1 >= 0 && board[y0 - 1][x].tile) y0--;
  while (y1 + 1 < 15 && board[y1 + 1][x].tile) y1++;
  let word = '';
  let connected = false;
  let contiguous = true;
  for (let y = y0; y <= y1; y++) {
    const cell = board[y][x];
    const placedHere = placements.find((p) => p.x === x && p.y === y);
    if (cell.tile) { const t = cell.tile; const ch = t.isJoker ? '?' : (t.letter || ''); word += ch; connected = true; }
    else if (placedHere) { const info = placementInfo.get(`${x},${y}`); const ch = (info?.letter ?? '') === '' ? '?' : (info?.letter || '#'); word += ch; }
    else { contiguous = false; word += '.'; }
  }
  if (word.includes('.')) contiguous = false;
  if (!connected) {
    for (const p of placements) {
      if ((x > 0 && board[p.y][x - 1].tile) || (x < 14 && board[p.y][x + 1].tile) || (p.y > 0 && board[p.y - 1][x].tile) || (p.y < 14 && board[p.y + 1][x].tile)) { connected = true; break; }
    }
  }
  const letters = [];
  for (let y = y0; y <= y1; y++) {
    const cell = board[y][x];
    const placed = placements.find((p) => p.x === x && p.y === y);
    if (cell.tile) { const t = cell.tile; letters.push(t.isJoker ? '?' : (t.letter || '')); }
    else if (placed) { const info = placementInfo.get(`${x},${y}`); letters.push((info?.letter ?? '') === '' ? '?' : (info?.letter || '#')); }
    else letters.push('');
  }
  return { y0, y1, x, word: letters.join(''), connected, contiguous };
}

function buildCrossWords(board, placements, placementInfo, dir) {
  const words = [];
  for (const p of placements) {
    if (dir === 'row') {
      let y0 = p.y; while (y0 - 1 >= 0 && board[y0 - 1][p.x].tile) y0--;
      let y1 = p.y; while (y1 + 1 < 15 && board[y1 + 1][p.x].tile) y1++;
      if (y1 - y0 >= 1) {
        const letters = [];
        for (let y = y0; y <= y1; y++) {
          const t = board[y][p.x].tile;
          if (t) letters.push(t.isJoker ? '?' : (t.letter || ''));
          else if (y === p.y) { const info = placementInfo.get(`${p.x},${y}`); letters.push((info?.letter ?? '') === '' ? '?' : (info?.letter || '#')); }
          else letters.push('');
        }
        words.push({ word: letters.join(''), x0: p.x, x1: p.x, y0, y1, anchor: { x: p.x, y: p.y } });
      }
    } else {
      let x0 = p.x; while (x0 - 1 >= 0 && board[p.y][x0 - 1].tile) x0--;
      let x1 = p.x; while (x1 + 1 < 15 && board[p.y][x1 + 1].tile) x1++;
      if (x1 - x0 >= 1) {
        const letters = [];
        for (let x = x0; x <= x1; x++) {
          const t = board[p.y][x].tile;
          if (t) letters.push(t.isJoker ? '?' : (t.letter || ''));
          else if (x === p.x) { const info = placementInfo.get(`${x},${p.y}`); letters.push((info?.letter ?? '') === '' ? '?' : (info?.letter || '#')); }
          else letters.push('');
        }
        words.push({ word: letters.join(''), x0, x1, y0: p.y, y1: p.y, anchor: { x: p.x, y: p.y } });
      }
    }
  }
  return words;
}

function scoreWord(board, placements, placementInfo, dir, span) {
  let wordMultiplier = 1;
  let score = 0;
  if (dir === 'row') {
    for (let x = span.x0; x <= span.x1; x++) {
      const y = span.y;
      const cell = board[y][x];
      const placed = placements.find((p) => p.x === x && p.y === y);
      const letterVal = placed ? getPlacementLetterValue(placementInfo, x, y) : ((cell.tile && cell.tile.value) || 0);
      if (placed) {
        const { letterMul, wordMul } = letterAndWordMultipliers(cell);
        score += letterVal * letterMul;
        wordMultiplier *= wordMul;
      } else {
        score += letterVal;
      }
    }
  } else {
    for (let y = span.y0; y <= span.y1; y++) {
      const x = span.x;
      const cell = board[y][x];
      const placed = placements.find((p) => p.x === x && p.y === y);
      const letterVal = placed ? getPlacementLetterValue(placementInfo, x, y) : ((cell.tile && cell.tile.value) || 0);
      if (placed) {
        const { letterMul, wordMul } = letterAndWordMultipliers(cell);
        score += letterVal * letterMul;
        wordMultiplier *= wordMul;
      } else {
        score += letterVal;
      }
    }
  }
  return { score: score * wordMultiplier, affectedCells: [] };
}

function scoreCrossWord(board, placements, placementInfo, cw) {
  let score = 0; let wordMul = 1;
  if (cw.x0 === cw.x1) {
    for (let y = cw.y0; y <= cw.y1; y++) {
      const x = cw.x0; const cell = board[y][x];
      const placed = placements.find((p) => p.x === x && p.y === y);
      const letterVal = placed ? getPlacementLetterValue(placementInfo, x, y) : ((cell.tile && cell.tile.value) || 0);
      if (placed) { const m = letterAndWordMultipliers(cell); score += letterVal * m.letterMul; wordMul *= m.wordMul; }
      else score += letterVal;
    }
  } else {
    for (let x = cw.x0; x <= cw.x1; x++) {
      const y = cw.y0; const cell = board[y][x];
      const placed = placements.find((p) => p.x === x && p.y === y);
      const letterVal = placed ? getPlacementLetterValue(placementInfo, x, y) : ((cell.tile && cell.tile.value) || 0);
      if (placed) { const m = letterAndWordMultipliers(cell); score += letterVal * m.letterMul; wordMul *= m.wordMul; }
      else score += letterVal;
    }
  }
  return { score: score * wordMul };
}

function letterAndWordMultipliers(cell) {
  if (!cell.bonus || cell.bonusUsed) return { letterMul: 1, wordMul: 1 };
  switch (cell.bonus) {
    case 'DL': return { letterMul: 2, wordMul: 1 };
    case 'TL': return { letterMul: 3, wordMul: 1 };
    case 'DW': return { letterMul: 1, wordMul: 2 };
    case 'TW': return { letterMul: 1, wordMul: 3 };
    default: return { letterMul: 1, wordMul: 1 };
  }
}

function getPlacementLetterValue(placementInfo, x, y) {
  const v = placementInfo.get(`${x},${y}`);
  return v ? v.value : 0;
}

module.exports = { GameService };

