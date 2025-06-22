const path = require("path");
const express = require("express");

// Importer les classes
const GameRoom = require("./Classes/GameRoom");
const Player = require("./Classes/Player");

// make the server and the socketsio
const app = express();
const server = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(3001, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
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
        callback({ success: false, message: "Deux joueurs sont requis pour commencer la partie." });
        return;
      }
      // Émettre l'événement "gameStarted" à tous les joueurs de la room sauf l'émetteur
      socket.to(roomId).emit("gameStarted");
      callback({ success: true });
    } else {
      callback({ success: false, message: "Room introuvable" });
    }
  });
  
  socket.on("cameraUpdate", (data) => {
    const { roomId, position, target } = data;
  
    // Vérifiez si la room existe
    const room = rooms[roomId];
    if (!room) {
      console.error(`Room introuvable : ${roomId}`);
      return;
    }
  
    // Émettez les données de la caméra aux autres joueurs de la room
    socket.to(roomId).emit("cameraUpdate", { position, target });
  });






  // Lancer un dé (événement envoyé par le client)
  socket.on("throwDice", (data, callback) => {
    // data: { roomId, color } avec color = "white" ou "red"
    const room = rooms[data.roomId];
    if (!room) {
      callback({ success: false, message: "Room introuvable" });
      return;
    }
    const currentPlayer = room.getCurrentPlayer();
    if (currentPlayer.socketId !== socket.id) {
      callback({ success: false, message: "Ce n'est pas ton tour" });
      return;
    }
    if (!currentPlayer.canThrowDice(data.color)) {
      callback({ success: false, message: "Plus de dé de cette couleur" });
      return;
    }
    // Le joueur lance son dé
    currentPlayer.throwDice(data.color);

    
    // Diffuser l'état mis à jour à tous les clients de la room
    io.to(data.roomId).emit("updateState", room.getState());
    callback({ success: true, state: room.getState() });

    // Indiquer à l'autre joueur de créer un dé de la couleur correspondante
    io.to(data.roomId).emit("createSpectatorObject", { item: "dice", color: data.color, newPos: null });

  });


  // Lancer un dé (événement envoyé par le client)
  socket.on("throwCube", (data, callback) => {

    const room = rooms[data.roomId];
    const newPos = data.newPos;

    if (!room) {
      callback({ success: false, message: "Room introuvable" });
      return;
    }
    const currentPlayer = room.getCurrentPlayer();
    if (currentPlayer.socketId !== socket.id) {
      callback({ success: false, message: "Ce n'est pas ton tour" });
      return;
    }
    if (room.hasCubes() === false) {
      callback({ success: false, message: "Plus de cube" });
      return;
    }
    // Le joueur lance son cube, on le retire de la stack de la room
    room.removeCube();
    
    // Diffuser l'état mis à jour à tous les clients de la room
    io.to(data.roomId).emit("updateState", room.getState());
    callback({ success: true, state: room.getState() });

    // Indiquer à l'autre joueur de créer un dé de la couleur correspondante
    io.to(data.roomId).emit("createSpectatorObject", { item: "cube", color: null, newPos: newPos});
  });


  // Lancer un dé (événement envoyé par le client)
  socket.on("throwBall", (data, callback) => {

    const room = rooms[data.roomId];
    if (!room) {
      callback({ success: false, message: "Room introuvable" });
      return;
    }
    const currentPlayer = room.getCurrentPlayer();
    if (currentPlayer.socketId !== socket.id) {
      callback({ success: false, message: "Ce n'est pas ton tour" });
      return;
    }
    // if (!currentPlayer.canThrowBall()) {
    //   callback({ success: false, message: "Plus de balle" });
    //   return;
    // }
    // Le joueur lance sa balle
    // currentPlayer.throwBall();
    //room.nextTurn();
    // Diffuser l'état mis à jour à tous les clients de la room
    io.to(data.roomId).emit("updateState", room.getState());
    callback({ success: true, state: room.getState() });

    io.to(data.roomId).emit("createSpectatorObject", { item: "ball", color: null, newpos: null });
  });

  socket.on("validateThrow", (data, callback) => {
    const { roomId, item, color, row, col, value } = data;
    const room = rooms[roomId];
    if (!room) {
        callback({ success: false, message: "Room introuvable" });
        return;
    }
    
    // Reinitialisé le nombre d'essais du joueur
    const currentPlayer = room.getCurrentPlayer();
    currentPlayer.resetThrowTries();


    // Vérifier dans la stack si des dés ont la même valeur que le dé lancé
    if(item === "dice"){
      if(!room.stack.areBothListsEmpty()){
        if(room.stack.doesValueExist(value)){
          // On retire les dés de la stack
          let removedValues = room.stack.removeAllWithValue(value);

          // console.log("removed values : ", removedValues);
          // console.log("removed values white : ", removedValues.white.length);
          // console.log("removed values red : ", removedValues.red.length);

          if(removedValues.white.length > 0) {
            currentPlayer.addDices("white", removedValues.white.length);
          }
          if(removedValues.red.length > 0) {
            t = currentPlayer.addDices("red", removedValues.red.length);
          }
        }
      }   
    }
    
    // Si on a lancé une balle, on ne met pas la matrice à jour
    if(item !== "ball"){
      // Mettre à jour la matrice des socles
      room.updateSocle(row, col, value, color);
      
    }

    // if(item === "ball"){
    //   // On retire la balle du spectateur
    //   io.to(roomId).emit("cancelItem");
    // }
    
    let removedItem = [];

    if(item !== "ball"){
      // vérifier la matrice
      removedItem = room.checkMatrix()
      console.log("values removed : ", removedItem);
      if(removedItem.length > 0){

        io.to(roomId).emit("removeItemsFromMatrix", {
          itemsToRemove: removedItem
        });

        removedItem.forEach((item) => {
          if(item[2] === "white" || item[2] === "red"){
            currentPlayer.addDice(item[2]);
          }
          else{
            console.log("l'item n'est pas un dé.");
          }
        });
      }
      if (color == 'red'){
        let res = room.placeCubesOnRow(row, value)
        console.log("----> retour : ", res)
        let cubes = res[0]
        let dices = res[1]
        room.removeCubes(cubes.length)
        if(dices.length > 0){
          dices.forEach( dice =>{            
            currentPlayer.addDice(dice[2])            
          })
        }
        io.to(data.roomId).emit("redDiceInstructions", { dices: dices, cubes: cubes});
      } 
    }
    else{
      let surroundedCoordinates = room.checkSurroundedByCubes(row, col)
      console.log("surrounding cases avec balle normale : ", surroundedCoordinates)
      io.to(roomId).emit("cancelItem");

      // Si on a des cubes autour, on va les supprimer donc on rajoute des cubes dans la pile des cubes
      if(surroundedCoordinates !== null){
        console.log("pass car on a des cubes autour")
        surroundedCoordinates.forEach((cubeCoordinate, index) =>{
          // On met la case de la matrice à null donc on a retirer un cube
          room.resetMatrixAt(cubeCoordinate[0], cubeCoordinate[1])
          console.log("reset case : ", cubeCoordinate[0], cubeCoordinate[1])
          // On rajoute les coordonnées de ce cube retiré
          removedItem.push(cubeCoordinate)
          // On ajoute un cube à la pile commune des cubes disponibles à jouer
          room.addCube()
          // On vérifie si des dés peuvent être retirés
          let rmItem = room.checkRow(cubeCoordinate[0])
          console.log("on check la ligne : ", cubeCoordinate[0])
          // Si on en a, on les ajoute à la liste
            if (rmItem.length > 0) {
              console.log("on a des items à retirer : ", rmItem)
              rmItem.forEach((item) => {
                // On rajoute directement les éléments individuels retournés par checkRow
                removedItem.push(item);
                console.log("-->>>>>>> on a pushé un item : ", item);
              });
            }
        })

        console.log("On a cette liste d'objets à suppr : ", removedItem)
      }
    }
      
    // Passer à l'étape de jeu suivante
    room.nextStep();
    // Comme le lancé est valide, on n'a pas besoin de poser un cube donc on passe à l'étape du lancé de balle
    if(room.currentStep == 2){
      room.nextStep();
    }

    if(room.currentStep == 0){
      console.log("Vérification si vainqueur")
      if(!room.getCurrentPlayer().hasDices()){
        console.log("fin du jeu : winner is ", room.getCurrentPlayer().pseudo)
        if(room.players[0] == room.getCurrentPlayer()){
          room.winner = room.players[0];
        }
        else{
          room.winner = room.players[1];
        }

        io.to(roomId).emit("gameOver",{gameState : room.getState(), winner : room.winner});
      }
      else{
        console.log("pas de vainqueur, on continue")
      }
    }

    console.log("on est à l'étape : ", room.currentStep)

    // Réinitialiser l'état des boutons pour le joueur actuel
    io.to(roomId).emit("resetButtonsState", {
      playerId: currentPlayer.socketId,
      remainingTries: currentPlayer.throwTries,
    });

    io.to(roomId).emit("resetItem", { removedItem: removedItem, row: row, col: col, item: item });

    // Passer la phase de lancer de balle si lancer la balle ne sert à rien
    if(room.currentStep == 3){
      if(!room.existsEmptySpot()){
        room.nextStep();
        
        if(!currentPlayer.hasDices()){
          console.log("fin du jeu : winner is ", room.getCurrentPlayer().pseudo)
          if(room.players[0] == room.getCurrentPlayer()){
            room.winner = room.players[0];
          }
          else{
            room.winner = room.players[1];
          }

          io.to(roomId).emit("gameOver",{gameState : room.getState(), winner : room.winner});
          
        }
      }
    }
    
    // Informer les clients de l'état mis à jour
    io.to(roomId).emit("updateState", room.getState());
    

    callback({ success: true });
  });


  socket.on("cubeDrop", (data, callback) => {
    const { roomId, color, row, col, value } = data;
    const room = rooms[roomId];
    if (!room) {
        callback({ success: false, message: "Room introuvable" });
        return;
    }
    
    // Mettre à jour la matrice des socles
    room.updateSocle(row, col, value, color);

    // vérifier la matrice
    let removedItem = room.checkMatrix()
    console.log("values removed : ", removedItem);
    if(removedItem.length > 0){

      io.to(roomId).emit("removeItemsFromMatrix", {
        itemsToRemove: removedItem
      });

      removedItem.forEach((item) => {
        if(item[2] === "white" || item[2] === "red"){
          room.getCurrentPlayer().addDice(item[2]);
        }
        else{
          console.log("l'item n'est pas un dé.");
        }
      });
    }
    
    io.to(roomId).emit("resetItem", { removedItem: removedItem, row: row, col: col, item: "cube" });

    room.nextStep();

    // on redonne la main à l'autre joueur
    room.nextTurn();

    // Passer la phase de lancer de balle si lancer la balle ne sert à rien
    if(room.currentStep == 3){
      if(!room.existsEmptySpot()){
        room.nextStep();
        
        if(!room.getCurrentPlayer().hasDices()){
          console.log("fin du jeu : winner is ", room.getCurrentPlayer().pseudo)
          if(room.players[0] == room.getCurrentPlayer()){
            room.winner = room.players[0];
          }
          else{
            room.winner = room.players[1];
          }

          io.to(roomId).emit("gameOver",{gameState : room.getState(), winner : room.winner});
        }
      }
    }

    // Informer les clients de l'état mis à jour
    io.to(roomId).emit("updateState", room.getState());
    
    callback({ success: true });
  });


  socket.on("ballDrop", (data, callback) => {
    const { roomId, color, row, col, value } = data;
    const room = rooms[roomId];
    if (!room) {
        callback({ success: false, message: "Room introuvable" });
        return;
    }
    
    let removedItem = [];
    let surroundedCoordinates = room.checkSurroundedByCubes(row, col)
    console.log("surrounding cases dans drop: ", surroundedCoordinates)
    // io.to(roomId).emit("resetItem");

    // Si on a des cubes autour, on va les supprimer donc on rajoute des cubes dans la pile des cubes
    if(surroundedCoordinates !== null){

      surroundedCoordinates.forEach((cubeCoordinate, index) =>{
        // On met la case de la matrice à null donc on a retirer un cube
        room.resetMatrixAt(cubeCoordinate[0], cubeCoordinate[1])
        // On rajoute les coordonnées de ce cube retiré
        removedItem.push(cubeCoordinate)
        // On ajoute un cube à la pile commune des cubes disponibles à jouer
        room.addCube()
          // On vérifie si des dés peuvent être retirés
          let rmItem = room.checkRow(cubeCoordinate[0])
          console.log("on check la ligne : ", cubeCoordinate[0])
          // Si on en a, on les ajoute à la liste
          if (rmItem.length > 0) {
            console.log("on a des items à retirer : ", rmItem)
            rmItem.forEach((item) => {
              // On rajoute directement les éléments individuels retournés par checkRow
              removedItem.push(item);
              console.log("-->>>>>>> on a pushé un item : ", item);
            });
          }
      })

      console.log("On a cette liste d'objets à suppr : ", removedItem)
    }

    // Passer à l'étape de jeu suivante
    room.nextStep();
    // Comme le lancé est valide, on n'a pas besoin de poser un cube donc on passe à l'étape du lancé de balle
    if(room.currentStep == 2){
      room.nextStep();
    }

    // Réinitialiser l'état des boutons pour le joueur actuel
    io.to(roomId).emit("resetButtonsState", {
      playerId: room.getCurrentPlayer().socketId,
      remainingTries: room.getCurrentPlayer().throwTries,
    });

    io.to(roomId).emit("resetItem", { removedItem: removedItem, row: row, col: col, item: "ball" });

    // Informer les clients de l'état mis à jour
    io.to(roomId).emit("updateState", room.getState());
    

    callback({ success: true });
    
  });

 

  socket.on("checkSocle", (data, callback) => {
    const { roomId, row, col } = data;
    const room = rooms[roomId];
    if (!room) {
        callback({ success: false, message: "Room introuvable" });
        return;
    }

    const isOccupied = room.isSocleOccupied(row, col);
    let allowDice = col > 3 ? false : true;
    callback({ success: true, occupied: isOccupied, allowDice: allowDice });
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

  socket.on("removeThrowTries", (data, callback) => {
    const { roomId } = data;
    const room = rooms[roomId];

    if (!room) {
        if (callback) callback({ success: false, message: "Room introuvable" });
        return;
    }

    const currentPlayer = room.getCurrentPlayer();
  
    // Vérifier si le joueur a encore des essais
    if (currentPlayer.throwTries > 0) {
        currentPlayer.removeThrowTries(); // Réduire le nombre d'essais
        io.to(roomId).emit("updateState", room.getState()); // Mettre à jour l'état pour tous les clients
        if (callback) callback({ success: true, remainingTries: currentPlayer.throwTries });
    } else {
        if (callback) callback({ success: false, message: "Aucun essai restant." });
    }
  });


  socket.on("skipPhase", (data) =>{

    const { roomId } = data;
    const room = rooms[roomId];

    if (!room) {
      callback({ success: false, message: "Room introuvable" });
      return;
    }

    const currentPlayer = room.getCurrentPlayer();
    currentPlayer.resetThrowTries();

    room.nextStep();

    io.to(roomId).emit("resetButtonsState", {
      playerId: currentPlayer.socketId,
      remainingTries: currentPlayer.throwTries,
    });

    if(!currentPlayer.hasDices()){
      console.log("fin du jeu : winner is ", room.getCurrentPlayer().pseudo)
      if(room.players[0] == room.getCurrentPlayer()){
        room.winner = room.players[0];
      }
      else{
        room.winner = room.players[1];
      }

      io.to(roomId).emit("gameOver",{gameState : room.getState(), winner : room.winner});
    }

    io.to(roomId).emit("cancelItem");
    
    io.to(roomId).emit("updateState", room.getState());
  })



  socket.on("invalidateThrow", (data, callback) => {
    const { roomId, item, color} = data;
    const room = rooms[roomId];
    if (!room) {
        callback({ success: false, message: "Room introuvable" });
        return;
    }
    const currentPlayer = room.getCurrentPlayer();
    if (currentPlayer.socketId !== socket.id) {
      callback({ success: false, message: "Ce n'est pas ton tour" });
      return;
    }

    // S'il reste des lancés au joueur, il peut recommencer
    if (currentPlayer.throwTries > 0) {
      
      if(item === "dice" ) {
        if(color === "white") {
          currentPlayer.addDice("white");
        }
        else if(color === "red") {
          currentPlayer.addDice("red");
        }
      }
      else if(item === "cube") {
        room.addCube();
      }

      

      // callback({ success: true, message: "Le joueur peut relancer." });
    } else {

      if(item === "dice" ) {
        room.stack.addRandomDice(color);
      }
      // remettre un cube dans la pile puisqu'on a échoué, il sera utiliser par l'utre joueur qui le posera à l'emplacement de son choix
      if(item === "cube" ) {
        room.addCube();
      }

      // Passer à l'étape suivante
      room.nextStep();
      currentPlayer.resetThrowTries(); // Réinitialiser le nombre d'essais du joueur

      // Si l'étape est celle où il faut drop un cube, on change de joueur
      if(room.currentStep == 2){
        room.nextTurn();
      } 

      if(room.currentStep == 0 || room.currentStep == 1){
        if(!room.getCurrentPlayer().hasDices()){
          console.log("fin du jeu : winner is ", room.getCurrentPlayer().pseudo)
          if(room.players[0] == room.getCurrentPlayer()){
            room.winner = room.players[0];
          }
          else{
            room.winner = room.players[1];
          }

          io.to(roomId).emit("gameOver",{gameState : room.getState(), winner : room.winner});
        }
      }

      // Passer la phase de lancer de balle si lancer la balle ne sert à rien
      // if(room.currentStep == 3){
      //   if(!room.existsEmptySpot()){
      //     room.resetStep();
      //   }
      // }

      // Informer les clients de l'état mis à jour
      // io.to(roomId).emit("updateState", room.getState());

      // callback({ success: true, message: "Le joueur n'a plus d'essais. Passage à l'étape suivante." });
    }

    io.to(roomId).emit("resetButtonsState", {
      playerId: currentPlayer.socketId,
      remainingTries: currentPlayer.throwTries,
    });

    io.to(roomId).emit("cancelItem");
    
    io.to(roomId).emit("updateState", room.getState());

  });


  socket.on("diceFlightUpdate", (data) => {
    const { roomId, position,  rotationQuaternion} = data;
    const room = rooms[roomId];
    if (!room) {
        console.error(`Room introuvable : ${roomId}`);
        // if (callback) callback({ success: false, message: "Room introuvable" });
        return;
    }
    //console.log("test")
    // Diffuser les informations du dé à tous les autres joueurs de la room
    socket.to(roomId).emit("synchro", data);

  });

    
});
