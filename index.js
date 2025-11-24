const path = require("path");
const express = require("express");

// Importer les classes
const GameRoom = require("./Classes/GameRoom");
const Player = require("./Classes/Player");

// make the server and the socketsio
const app = express();
const server = require("http").createServer(app);
const { Server } = require("socket.io");
const PORT = process.env.PORT || 3001;
const io = new Server(server, {
  cors: {
    origin: "https://adrienescbr.github.io/dekou-client",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

// Server static file in the public directory
app.use(express.static(path.join(__dirname, "../client/build")));

// Gestion des rooms
const rooms = {};

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
      if (room.players.length < 2) {
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
      if (room.players.length < 2) {
        callback({ success: false, message: "4 joueurs sont requis pour commencer la partie." });
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



    
});
