const Stack = require("./Stack.js");

class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = []; // Liste d'instances Player
    this.currentTurnIndex = 0;
    this.currentStep = 0;
    this.maxStep = 3;
    this.communCubes = 19;
    this.communBall = 1;
    this.stack = new Stack();
    this.winner = null;
    this.looser = null;

    // Matrice pour suivre l'état des socles (5 lignes, 8 colonnes)
    this.soclesMatrix = Array.from({ length: 5 }, () => Array(8).fill(null));
  }

  // Mettre à jour l'état d'un socle
  updateSocle(row, col, value, color) {
    if (row >= 0 && row < 5 && col >= 0 && col < 8) {
      this.soclesMatrix[row][col] = [value, color];
    }
  }

  // Vérifier si un socle est occupé
  isSocleOccupied(row, col) {
    if (row >= 0 && row < 5 && col >= 0 && col < 8) {
      return this.soclesMatrix[row][col] !== null;
    }
    return false;
  }

  getStack() {
    return this.stack.getStack();
  }

  addPlayer(player) {
    if (this.players.length < 2) {
      this.players.push(player);
      return true;
    }
    return false;
  }

  removePlayer(socketId) {
    this.players = this.players.filter((p) => p.socketId !== socketId);
    if (this.currentTurnIndex >= this.players.length) {
      this.currentTurnIndex = 0;
    }
  }

  getCurrentPlayer() {
    if (this.players.length === 0) return null;
    return this.players[this.currentTurnIndex];
  }

  nextTurn() {
    if (this.players.length > 0) {
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
    }
  }

  nextStep() {
    this.currentStep += 1;
    if(this.communCubes <= 0){
      this.currentStep += 1
    }
    if (this.currentStep > this.maxStep) {
      this.currentStep = 0;
      this.nextTurn();
    }
    console.log("Current step updated to : ", this.currentStep);
  }

  setStep(step) {
    if (step >= 0 && step <= this.maxStep) {
      this.currentStep = step;
    } else {
      console.error("Invalid step value. Step must be between 0 and 2.");
    }
  }

  resetStep() {
    this.currentStep = 0;
  }

  getStep() {
    return this.currentStep;
  }

  getState() {
    // On renvoie l'état utile pour les clients
    return {
      roomId: this.roomId,
      players: this.players.map((player) => ({
        socketId: player.socketId,
        pseudo: player.pseudo,
        whiteDices: player.whiteDices,
        redDices: player.redDices,
        cubes: this.communCubes,
        throwTries: player.throwTries,
      })),
      currentTurn: this.getCurrentPlayer()
        ? this.getCurrentPlayer().socketId
        : null,
      gameMatrix: this.soclesMatrix,
      stack: this.stack.getStack(),
      currentStep: this.currentStep,
      communBall: this.communBall,
    };
  }

  addCubes(number) {
    this.communCubes += number;
  }

  addCube() {
    this.communCubes += 1;
  }
  removeCube() {
    if (this.communCubes > 0) {
      this.communCubes -= 1;
      return true;
    }
    return false;
  }
  removeCubes(number) {
    if (this.communCubes >= number) {
      this.communCubes -= number;
      return true;
    }
    return false;
  }

  hasCubes() {
    return this.communCubes > 0;
  }

  checkRow(rowIndex) {
    // console.log("--------------------------")
    const row = this.soclesMatrix[rowIndex];
    // console.log("état de ma ligne :", row)
    const result = [];

    const recursiveCheck = () => {
      // Compter le nombre de cases vides (null)
      const nullCount = row.filter((cell) => cell === null).length;

      // Trouver les indices des cases avec des dés (valeurs entre 1 et 6) correspondant au nombre de cases vides
      const matchingIndices = [];
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const cell = row[colIndex];
        if (cell && cell[0] >= 1 && cell[0] <= 6 && cell[0] === nullCount) {
          matchingIndices.push(colIndex);
        }
      }

      // Si aucun dé ne correspond, arrêter la récursivité
      if (matchingIndices.length === 0) {
        return;
      }

      // Ajouter les couples [index de la ligne, index de l'emplacement dans la ligne] au résultat
      matchingIndices.forEach((colIndex) => {
        result.push([rowIndex, colIndex, row[colIndex][1]]);
        row[colIndex] = null; // Mettre la case à null
      });

      // Appeler récursivement pour vérifier à nouveau la ligne
      recursiveCheck();
    };

    recursiveCheck();
    // console.log("result vérif row : ", result)
    // console.log("--------------------------")
    return result;
  }

  checkMatrix() {
    const result = [];

    for (let rowIndex = 0; rowIndex < this.soclesMatrix.length; rowIndex++) {
      const rowResult = this.checkRow(rowIndex);
      result.push(...rowResult);
    }

    return result;
  }

  resetMatrixAt(rowIndex, socleIndex) {
    // Vérifier si les indices sont dans les limites de la matrice
    if (
      rowIndex >= 0 &&
      rowIndex < this.soclesMatrix.length &&
      socleIndex >= 0 &&
      socleIndex < this.soclesMatrix[rowIndex].length
    ) {
      // Mettre la case à null
      this.soclesMatrix[rowIndex][socleIndex] = null;
      console.log(`Case [${rowIndex}, ${socleIndex}] mise à null.`);
    } else {
      console.error(
        `Indices [${rowIndex}, ${socleIndex}] hors limites de la matrice.`
      );
    }
  }

  placeCubesOnRow(rowIndex, value) {
    const CUBE_ZONE_START = 4; // Début de la zone cube
    const CUBE_ZONE_END = 7;   // Fin de la zone cube
    const cubesPlaced = [];    // Liste des emplacements où les cubes sont placés
    const diceToRemove = [];   // Liste des dés à supprimer après checkRow
    
    // Vérifier si la ligne est valide
    if (rowIndex < 0 || rowIndex >= this.soclesMatrix.length) {
      console.error(`Index de ligne invalide : ${rowIndex}`);
      return [cubesPlaced, diceToRemove];
    }
  
    const row = this.soclesMatrix[rowIndex];
    console.log("row in placeCubesOnRow:", row)
    let cubesToPlace = value; // Nombre de cubes à placer
  
    // Parcourir les colonnes de la zone cube pour placer les cubes
    for (let colIndex = CUBE_ZONE_START; colIndex <= CUBE_ZONE_END && cubesToPlace > 0; colIndex++) {
      if (row[colIndex] === null) {
        // Placer un cube à cet emplacement
        row[colIndex] = [0, null];
        cubesPlaced.push([rowIndex, colIndex]);
  
        // Appeler checkRow après chaque placement
        const resultFromCheckRow = this.checkRow(rowIndex);
        diceToRemove.push(...resultFromCheckRow);
  
        // Réduire le nombre de cubes restants à placer
        cubesToPlace -= 1;
      }
    }
  
    // Retourner les emplacements des cubes placés et les dés à supprimer
    return [cubesPlaced, diceToRemove];
  }
  

  checkSurroundedByCubes(rowIndex, socleIndex) {
    // Vérifier que l'index du socle est dans la partie destinée aux cubes (colonnes 4 à 7)
    if (socleIndex < 4 || socleIndex > 7) {
      console.error(
        `Le socle donné (${socleIndex}) n'est pas dans la partie destinée aux cubes (colonnes 4 à 7).`
      );
      return null;
    }

    // Vérification de la matrice
    if (!Array.isArray(this.soclesMatrix) || this.soclesMatrix.length === 0) {
      console.error(
        "La matrice des socles (soclesMatrix) est invalide ou non définie."
      );
      return null;
    }

    // Offsets pour trouver les voisins
    const neighborOffsets = [
      [-1, 0], // Case au-dessus
      [1, 0], // Case en-dessous
      [0, -1], // Case à gauche
      [0, 1], // Case à droite
    ];

    const surroundedCoordinates = [];
    let validNeighbors = 0;

    for (const [rowOffset, colOffset] of neighborOffsets) {
      const adjacentRow = rowIndex + rowOffset;
      const adjacentCol = socleIndex + colOffset;

      // Vérifier si la case adjacente est dans les limites de la matrice
      if (
        adjacentRow >= 0 &&
        adjacentRow < this.soclesMatrix.length &&
        adjacentCol >= 4 &&
        adjacentCol <= 7
      ) {
        validNeighbors++; // Compter les voisins valides

        const adjacentCell = this.soclesMatrix[adjacentRow][adjacentCol];

        // Vérifier si la case est occupée par un cube ([0, null])
        if (adjacentCell && adjacentCell[0] === 0 && adjacentCell[1] === null) {
          surroundedCoordinates.push([adjacentRow, adjacentCol]);
        } else {
          // Une case adjacente valide n'est pas occupée par un cube
          return null;
        }
      }
    }

    // Vérifier si toutes les cases valides sont occupées par des cubes
    return surroundedCoordinates.length === validNeighbors
      ? surroundedCoordinates
      : null;
  }

  existsEmptySpot() {
    
    const numRows = this.soclesMatrix.length;
    if (numRows === 0) return false;
  
    // Colonnes autorisées pour cubes/balles : 4 à 7 inclus
    const CUBE_ZONE_START = 4;
    const CUBE_ZONE_END = 7;
  
    // Offsets pour voisins (haut, bas, gauche, droite)
    const neighborOffsets = [
      [-1, 0], // au-dessus
      [1, 0],  // en-dessous
      [0, -1], // à gauche
      [0, 1],  // à droite
    ];
  
    // Vérifie si la case (r, c) est entourée par des cubes selon la définition
    function isSurroundedByCubes(matrix, r, c) {
      let validNeighbors = 0;
      let surroundedNeighbors = 0;
  
      for (const [dr, dc] of neighborOffsets) {
        const nr = r + dr;
        const nc = c + dc;
  
        // Si voisin hors matrice ou hors zone 4..7, on l'ignore.
        if (nr < 0 || nr >= numRows || nc < CUBE_ZONE_START || nc > CUBE_ZONE_END) {
          continue;
        }
        validNeighbors++;
  
        const neighborCell = matrix[nr][nc];
        // On considère que [0, null] représente un cube posé.
        if (Array.isArray(neighborCell) && neighborCell[0] === 0 && neighborCell[1] === null) {
          surroundedNeighbors++;
        } else {
          // Si ce voisin valide n'est pas occupé par un cube, on échoue
          return false;
        }
      }
  
      // Si toutes les cases valides adjacentes sont des cubes, on est entouré.
      return validNeighbors > 0 && surroundedNeighbors === validNeighbors;
    }
  
    // Parcours de toutes les cases dans la zone 4..7
    for (let row = 0; row < numRows; row++) {
      for (let col = CUBE_ZONE_START; col <= CUBE_ZONE_END; col++) {
        const cell = this.soclesMatrix[row][col];
  
        // On ne teste que les cases vides (null). Si on voulait tester aussi balles,
        // adapter cette condition selon la représentation d'une case vide.
        if (cell === null) {
          if (isSurroundedByCubes(this.soclesMatrix, row, col)) {
            console.log(`Case entourée trouvée en [${row}, ${col}]`);
            return true;
          }
        }
      }
    }
  
    console.log(`Aucune case entourée de cubes`);
    return false;
  }
}
module.exports = GameRoom;
