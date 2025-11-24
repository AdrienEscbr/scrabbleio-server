class Player {
    constructor(socketId, pseudo = null) {
      this.socketId = socketId;
      this.pseudo = pseudo || this.generateRandomPseudo();
    }
  
    generateRandomPseudo() {
      const pseudonyms = [
        "EagleEye", "StormRider", "ShadowHunter", "FireFury", "IceBreaker",
        "ThunderClap", "NightWolf", "BladeRunner", "WindWalker", "LoneWolf",
      ];
      return pseudonyms[Math.floor(Math.random() * pseudonyms.length)];
    }
  }
  module.exports = Player;