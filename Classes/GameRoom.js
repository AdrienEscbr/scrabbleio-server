class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.currentStep = 0;
    this.winner = null;
    this.looser = null;
    this.maxPlayers = 4;
  }

  addPlayer(player) {
    const alreadyIn = this.players.find((p) => p.socketId === player.socketId);
    if (alreadyIn) return false;
    if (this.players.length >= this.maxPlayers) return false;
    this.players.push(player);
    return true;
  }

  removePlayer(socketId) {
    const before = this.players.length;
    this.players = this.players.filter((p) => p.socketId !== socketId);
    return this.players.length !== before;
  }

  getState() {
    return {
      roomId: this.roomId,
      players: this.players.map((p) => ({ socketId: p.socketId, pseudo: p.pseudo })),
      currentStep: this.currentStep,
      winner: this.winner,
      looser: this.looser,
      maxPlayers: this.maxPlayers,
    };
  }
}

module.exports = GameRoom;
