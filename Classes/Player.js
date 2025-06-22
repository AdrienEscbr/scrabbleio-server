class Player {
    constructor(socketId, pseudo = null) {
      this.socketId = socketId;
      this.pseudo = pseudo || this.generateRandomPseudo();
      this.whiteDices = 5;
      this.redDices = 1;
      this.throwTries = 3;
    }
  
    generateRandomPseudo() {
      const pseudonyms = [
        "EagleEye", "StormRider", "ShadowHunter", "FireFury", "IceBreaker",
        "ThunderClap", "NightWolf", "BladeRunner", "WindWalker", "LoneWolf",
      ];
      return pseudonyms[Math.floor(Math.random() * pseudonyms.length)];
    }
  
    canThrowDice(color) {
      return color === "white" ? this.whiteDices > 0 : this.redDices > 0;
    }

    hasDices() {
      if(this.whiteDices <= 0 && this.redDices <= 0) {
        console.log("Player has lost the game, no dices left.");
        return false;
      }
      else{
        console.log("Player has dices: ", this.whiteDices, this.redDices);
        return true;
      }
    }

    hasTries() {
      if(this.throwTries <= 0) {
        console.log("Player has no tries left.");
        return false;
      }
      else{
        console.log("Player has tries: ", this.throwTries);
        return true;
      }
    }

    resetThrowTries() {
      this.throwTries = 3;
    }

    removeThrowTries() {
      if (this.throwTries > 0) {
        this.throwTries--;
        return true;
      }
      return false;
    }
    
    getThrowTries() {
      return this.throwTries;
    }

    addDice(color) {
      if (color === "white") {
        this.whiteDices++;
        return true;
      } else if (color === "red") {
        this.redDices++;
        return true;
      }
      else{
        return false;
      }
    }

    addDices(color, number) {
      console.log(`addDices called with color: ${color}, number: ${number}`);
      if (color === "white") {
        this.whiteDices += number;
        return true;
      } else if (color === "red") {
        this.redDices += number;
        return true;
      }
      else{
        return false;
      }
    }

    removeDice(color) {
      if (color === "white" && this.whiteDices > 0) {
        this.whiteDices--;
        return true;
      } else if (color === "red" && this.redDices > 0) {
        this.redDices--;
        return true;
      }
      else{
        return false;
      }
    }

 
    throwDice(color) {
      return this.removeDice(color);
    }

  }
  module.exports = Player;