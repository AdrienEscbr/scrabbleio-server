
class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = []; // Liste d'instances Player
    this.currentStep = 0;
    this.winner = null;
    this.looser = null;
  }
}
module.exports = GameRoom;
