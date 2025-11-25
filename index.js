const path = require("path");
const express = require("express");

// Importer les classes
const GameRoom = require("./Classes/GameRoom");
const Player = require("./Classes/Player");
// Scrabble engine
const { GameService } = require("./Scrabble/GameService");
const { WordValidatorFile } = require("./Scrabble/WordValidator");

// make the server and the socketsio
const app = express();
const server = require("http").createServer(app);
const { Server } = require("socket.io");
const PORT = process.env.PORT || 3001;
// Configure CORS for Socket.IO (dev + GH Pages by default)
const defaultOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://adrienescbr.github.io/scrabbleio-client",
];
const allowedOrigins = (process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",") : defaultOrigins);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

// Server static file in the public directory
app.use(express.static(path.join(__dirname, "../dekou-client/build")));
app.get("/health", (_req, res) => res.status(200).send("ok"));

// Gestion des rooms
const rooms = {};

// --- Scrabble helpers ---
function buildScrRoomFromGameRoom(room) {
  return {
    id: room.roomId,
    hostId: room.players[0]?.socketId,
    status: 'waiting',
    maxPlayers: room.maxPlayers,
    players: room.players.map((p) => ({
      id: p.socketId,
      nickname: p.pseudo,
      connected: true,
      ready: false,
      score: 0,
      rack: [],
      stats: { wordsPlayed: 0, bestWordScore: 0, bestWord: null, totalTurns: 0, passes: 0 },
    })),
    game: null,
    lastActivityAt: Date.now(),
  };
}

function toGameStateSummaryForPlayer(game, players, playerId) {
  const board = game.board.map((row) =>
    row.map((c) => ({
      letter: c.tile ? (c.tile.isJoker ? '?' : (c.tile.letter || undefined)) : undefined,
      points: c.tile ? c.tile.value : undefined,
      bonus: c.bonus,
    }))
  );
  const me = players.find((p) => p.id === playerId);
  const scoresByPlayer = {};
  for (const p of players) scoresByPlayer[p.id] = p.score;
  const log = (game.log || []).map((m) => {
    if (m.action === 'play') {
      const words = (m.words || []).filter(Boolean).join(', ');
      return { playerId: m.playerId, action: 'play', summary: `${m.playerId}: ${words} (+${m.score})` };
    }
    if (m.action === 'exchange') {
      return { playerId: m.playerId, action: 'exchange', summary: `${m.playerId}: échange de lettres` };
    }
    return { playerId: m.playerId, action: 'pass', summary: `${m.playerId}: passe son tour` };
  });
  return {
    board,
    myRack: (me?.rack || []).map((t) => ({ tileId: t.id, letter: t.letter, points: t.value })),
    scoresByPlayer,
    activePlayerId: game.activePlayerId,
    turnEndsAt: game.turnEndsAt,
    turnDurationMs: game.turnDurationMs,
    bagCount: game.bag.length,
    log,
    version: game.version,
  };
}

// New version including player nicknames in summaries and players mapping
function toGameStateSummaryForPlayer2(game, players, playerId) {
  const board = game.board.map((row) =>
    row.map((c) => ({
      letter: c.tile ? (c.tile.isJoker ? '?' : (c.tile.letter || undefined)) : undefined,
      points: c.tile ? c.tile.value : undefined,
      bonus: c.bonus,
    }))
  );
  const me = players.find((p) => p.id === playerId);
  const scoresByPlayer = {};
  for (const p of players) scoresByPlayer[p.id] = p.score;
  const nameOf = (pid) => (players.find((pp) => pp.id === pid)?.nickname || pid);
  const log = (game.log || []).map((m) => {
    if (m.action === 'play') {
      const words = (m.words || []).filter(Boolean).join(', ');
      return { playerId: m.playerId, action: 'play', summary: `${nameOf(m.playerId)}: ${words} (+${m.score})` };
    }
    if (m.action === 'exchange') {
      return { playerId: m.playerId, action: 'exchange', summary: `${nameOf(m.playerId)}: échange de lettres` };
    }
    return { playerId: m.playerId, action: 'pass', summary: `${nameOf(m.playerId)}: passe son tour` };
  });
  return {
    board,
    myRack: (me?.rack || []).map((t) => ({ tileId: t.id, letter: t.letter, points: t.value })),
    scoresByPlayer,
    activePlayerId: game.activePlayerId,
    turnEndsAt: game.turnEndsAt,
    turnDurationMs: game.turnDurationMs,
    bagCount: game.bag.length,
    log,
    version: game.version,
    players: players.map((p) => ({ id: p.id, nickname: p.nickname })),
  };
}

async function broadcastGameState(roomId) {
  const room = rooms[roomId];
  if (!room || !room.scrabble || !room.scrabble.room.game) return;
  const scr = room.scrabble.room;
  for (const p of scr.players) {
    const gs = toGameStateSummaryForPlayer2(scr.game, scr.players, p.id);
    // Emit personalized state to each player's socket id
    io.to(p.id).emit('game:state', { roomId, gameState: gs });
  }
}

// Auto-advance turn when timer expires (every second)
setInterval(async () => {
  try {
    const now = Date.now();
    for (const roomId in rooms) {
      const wrapper = rooms[roomId];
      if (!wrapper.scrabble) continue;
      const { room: scr, service } = wrapper.scrabble;
      const game = scr.game;
      if (!game) continue;
      if (now > (game.turnEndsAt || 0)) {
        const active = game.activePlayerId;
        try {
          const { ended } = await service.playMove(scr, active, 'pass');
          await broadcastGameState(roomId);
          if (ended) {
            const scores = {}; const statsByPlayer = {};
            for (const p of scr.players) { scores[p.id] = p.score; statsByPlayer[p.id] = p.stats; }
            const max = Math.max(...Object.values(scores));
            const winnerIds = Object.entries(scores).filter(([, s]) => s === max).map(([id]) => id);
            io.to(roomId).emit('game:ended', { roomId, scores, statsByPlayer, winnerIds, players: scr.players.map(p => ({ id: p.id, nickname: p.nickname })) });
          }
        } catch (e) {
          console.error('[turnTick] error advancing turn:', e?.message || e);
        }
      }
    }
  } catch (e) {
    console.error('[turnTick] loop error:', e?.message || e);
  }
}, 1000);

io.on("connection", (socket) => {
  console.log("Un client s'est connecté :", socket.id);

  // Créer une room
  socket.on("createRoom", (callback) => {
    let roomId;
    // Boucle pour générer un ID unique
    do {
      roomId = `room-${Math.random().toString(36).substring(2, 8)}`;
    } while (rooms[roomId]);

    const room = new GameRoom(roomId);
    const player = new Player(socket.id);
    room.addPlayer(player);
    rooms[roomId] = room;
    socket.join(roomId);

    callback({ success: true, roomId, state: room.getState() });
    console.log(`Room créée : ${roomId}`);
  });

  // Rejoindre une room
  socket.on("joinRoom", (roomId, callback) => {
    if (rooms[roomId]) {
      const room = rooms[roomId];
      // Si déjà présent, renvoyer l'état actuel
      if (room.players.find(p => p.socketId === socket.id)) {
        callback({ success: true, state: room.getState() });
        return;
      }
      if (room.players.length < room.maxPlayers) {
        const player = new Player(socket.id);
        room.addPlayer(player);
        socket.join(roomId);
        io.to(roomId).emit("updateState", room.getState());
        callback({ success: true, state: room.getState() });
      } else {
        callback({ success: false, message: "Room pleine" });
      }
    } else {
      callback({ success: false, message: "Room introuvable" });
    }
  });

  // Initialize scrabble game state when launching the game (non-intrusive: no callback here)
  socket.on("launchGame", async (roomId) => {
    const room = rooms[roomId];
    if (!room || room.scrabble) return; // already initialized or missing
    if (room.players.length < room.maxPlayers) return;
    try {
      const dictionaryPath = path.join(__dirname, "Assets", "French ODS dictionary.txt");
      const validator = new WordValidatorFile(dictionaryPath);
      const service = new GameService(validator);
      const scrRoom = buildScrRoomFromGameRoom(room);
      room.scrabble = { room: scrRoom, service };
      service.startNewGame(scrRoom);
      await broadcastGameState(roomId);
    } catch (e) {
      console.error('[launchGame:init] error:', e?.message || e);
    }
  });


  socket.on("leaveRoom", (roomId, callback) => {
    if (rooms[roomId]) {
      const room = rooms[roomId];
      room.removePlayer(socket.id);
      socket.leave(roomId);
      io.to(roomId).emit("updateState", room.getState());
      if (room.players.length === 0) {
        delete rooms[roomId];
      }
    }
    if (callback) callback();
  });
  

  socket.on("changePseudo", (newPseudo, callback) => {
    let playerFound = false;
    // Parcourir toutes les rooms pour trouver le joueur
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        if (newPseudo.length <= 12 && /^[a-zA-Z0-9]+$/.test(newPseudo)) {
          player.pseudo = newPseudo;
          callback({ success: true, newPseudo });
          // Diffuser l'état mis à jour à tous les clients de la room
          io.to(roomId).emit("updateState", room.getState());
          if (room.scrabble) {
            const sp = room.scrabble.room.players.find(pp => pp.id === socket.id);
            if (sp) sp.nickname = newPseudo;
            if (room.scrabble.room.game) {
              broadcastGameState(roomId);
            }
          }
        } else {
          callback({ success: false, message: "Pseudo invalide." });
        }
        playerFound = true;
        break;
      }
    }
    if (!playerFound) {
      callback({ success: false, message: "Joueur non trouvé." });
    }
  });
  
  // Déconnexion d'un joueur
  socket.on("disconnect", () => {
   
    console.log("Client déconnecté :", socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.removePlayer(socket.id);
      io.to(roomId).emit("updateState", room.getState());
      if (room.players.length === 0) {
        delete rooms[roomId];
      }
    }
  });


  socket.on("launchGame", (roomId, callback) => {
    if (rooms[roomId]) {
      const room = rooms[roomId];
      if (room.players.length < room.maxPlayers) {
        callback({ success: false, message: `${room.maxPlayers} joueurs sont requis pour commencer la partie.` });
        return;
      }
      // Émettre l'événement "gameStarted" à tous les joueurs de la room sauf l'émetteur
      socket.to(roomId).emit("gameStarted");
      callback({ success: true });
    } else {
      callback({ success: false, message: "Room introuvable" });
    }
  });
  

  socket.on("getState", (data, callback) => {
    const { roomId } = data;
    const room = rooms[roomId];
    if (!room) {
      callback({ success: false, message: "Room introuvable" });
      return;
    }
    callback({ success: true, state: room.getState() });
  });

  // --- Scrabble gameplay events ---
  socket.on('game:getState', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.scrabble || !room.scrabble.room.game) return;
    const scr = room.scrabble.room;
    const gs = toGameStateSummaryForPlayer2(scr.game, scr.players, socket.id);
    socket.emit('game:state', { roomId, gameState: gs });
  });

  socket.on('game:playMove', async (payload) => {
    const { roomId, placements } = payload || {};
    const room = rooms[roomId];
    if (!room || !room.scrabble) return;
    const { service, room: scr } = room.scrabble;
    try {
      const { ended } = await service.playMove(scr, socket.id, 'play', placements);
      await broadcastGameState(roomId);
      if (ended) {
        const scores = {}; const statsByPlayer = {};
        for (const p of scr.players) { scores[p.id] = p.score; statsByPlayer[p.id] = p.stats; }
        const max = Math.max(...Object.values(scores));
        const winnerIds = Object.entries(scores).filter(([, s]) => s === max).map(([id]) => id);
        io.to(roomId).emit('game:ended', { roomId, scores, statsByPlayer, winnerIds, players: scr.players.map(p => ({ id: p.id, nickname: p.nickname })) });
      }
    } catch (e) {
      socket.emit('game:error', { roomId, reason: e?.reason || e?.message || 'INVALID_MOVE' });
    }
  });

  socket.on('game:pass', async (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.scrabble) return;
    const { service, room: scr } = room.scrabble;
    try {
      const { ended } = await service.playMove(scr, socket.id, 'pass');
      await broadcastGameState(roomId);
      if (ended) {
        const scores = {}; const statsByPlayer = {};
        for (const p of scr.players) { scores[p.id] = p.score; statsByPlayer[p.id] = p.stats; }
        const max = Math.max(...Object.values(scores));
        const winnerIds = Object.entries(scores).filter(([, s]) => s === max).map(([id]) => id);
        io.to(roomId).emit('game:ended', { roomId, scores, statsByPlayer, winnerIds, players: scr.players.map(p => ({ id: p.id, nickname: p.nickname })) });
      }
    } catch (e) {
      socket.emit('game:error', { roomId, reason: e?.reason || e?.message || 'INVALID_MOVE' });
    }
  });

  socket.on('game:exchange', async (payload) => {
    const { roomId, tileIds } = payload || {};
    const room = rooms[roomId];
    if (!room || !room.scrabble) return;
    const { service, room: scr } = room.scrabble;
    try {
      const { ended } = await service.playMove(scr, socket.id, 'exchange', undefined, tileIds || []);
      await broadcastGameState(roomId);
      if (ended) {
        const scores = {}; const statsByPlayer = {};
        for (const p of scr.players) { scores[p.id] = p.score; statsByPlayer[p.id] = p.stats; }
        const max = Math.max(...Object.values(scores));
        const winnerIds = Object.entries(scores).filter(([, s]) => s === max).map(([id]) => id);
        io.to(roomId).emit('game:ended', { roomId, scores, statsByPlayer, winnerIds, players: scr.players.map(p => ({ id: p.id, nickname: p.nickname })) });
      }
    } catch (e) {
      socket.emit('game:error', { roomId, reason: e?.reason || e?.message || 'INVALID_MOVE' });
    }
  });



    
});
