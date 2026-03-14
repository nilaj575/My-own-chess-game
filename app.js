const express = require("express");
const http = require("http");
const { Chess } = require("chess.js");
const socketio = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

const waitingQueue = [];
const rooms = {};
const spectators = {};

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/spectate/:roomId", (req, res) => {
  res.render("index");
});



function skipTurn(chess) {

  const moves = chess.moves({ verbose: true });

  if (moves.length === 0) return;

  const randomMove = moves[Math.floor(Math.random() * moves.length)];

  chess.move(randomMove);

}

io.on("connection", socket => {

  socket.emit("waiting");
  waitingQueue.push(socket);

  if (waitingQueue.length >= 2) {

    const p1 = waitingQueue.shift();
    const p2 = waitingQueue.shift();

    const roomId = Math.random().toString(36).slice(2, 8);

    rooms[roomId] = {
      chess: new Chess(),
      players: { w: p1.id, b: p2.id }
    };

    spectators[roomId] = 0;

    p1.join(roomId);
    p2.join(roomId);

    p1.emit("paired", { roomId, role: "w" });
    p2.emit("paired", { roomId, role: "b" });

    io.to(roomId).emit("boardState", {
      fen: rooms[roomId].chess.fen()
    });

  }

  socket.on("move", ({ roomId, move }) => {

    const room = rooms[roomId];
    if (!room) return;

    const chess = room.chess;

    const playerColor =
      socket.id === room.players.w ? "w" :
      socket.id === room.players.b ? "b" : null;

    if (playerColor !== chess.turn()) return;

    let result;

    try {
      result = chess.move(move);
    } catch {
      return;
    }

    if (!result) return;

    io.to(roomId).emit("move", result);

    io.to(roomId).emit("boardState", {
      fen: chess.fen(),
      check: chess.isCheck()
    });

  });

  socket.on("skipTurn", roomId => {

    const room = rooms[roomId];
    if (!room) return;

    skipTurn(room.chess);

    io.to(roomId).emit("boardState", {
      fen: room.chess.fen()
    });

  });

  socket.on("spectate", roomId => {

    const room = rooms[roomId];
    if (!room) return;

    socket.join(roomId);

    spectators[roomId]++;

    io.to(roomId).emit("spectatorCount", spectators[roomId]);

    socket.emit("boardState", {
      fen: room.chess.fen()
    });

  });

  socket.on("disconnect", () => {
  const i = waitingQueue.indexOf(socket);
  if (i !== -1) waitingQueue.splice(i, 1);

  
  for(const roomId in rooms){
    const room = rooms[roomId];
    const players = room.players;

    let winner = null;

    if(players.w === socket.id){
      winner = "Black";
    } else if(players.b === socket.id){
      winner = "White";
    }

    if(winner){
      // Notify all clients in room
      io.to(roomId).emit("gameOver", `Player left! ${winner} wins!`);

      // Clean up room
      delete rooms[roomId];
      delete spectators[roomId];
    }
  }
});

});

server.listen(3000, () =>
  console.log("Server running → http://localhost:3000")
);