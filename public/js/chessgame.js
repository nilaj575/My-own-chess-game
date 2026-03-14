const socket = io();
const chess = new Chess();


const moveSound = new Audio("/sounds/move1.mp3.ogg");
const captureSound = new Audio("/sounds/capture.mp3.mpeg");
const checkmateSound = new Audio("/sounds/checkmate.mp3.mpeg");
const winSound = new Audio("/sounds/win1.mp3.mpeg");

[moveSound, captureSound, checkmateSound, winSound].forEach(sound => {
  sound.volume = 0.7;
  sound.load();
});


/* RANDOM CHESS LOADER */




const boardEl = document.querySelector(".chessboard");
const statusEl = document.getElementById("status");
const playersEl = document.getElementById("players");
const timerBox = document.getElementById("turnTimer").parentElement;
const timerEl = document.getElementById("turnTimer");
const spectatorEl = document.getElementById("spectatorCount");
const capturedContainer = document.getElementById("capturedContainer");
const spectatorContainer = document.getElementById("spectatorContainer");

const whiteNameEl = document.getElementById("whiteName");
const blackNameEl = document.getElementById("blackName");
const whiteCapturedEl = document.getElementById("whiteCaptured");
const blackCapturedEl = document.getElementById("blackCaptured");

let whiteCaptured = [];
let blackCaptured = [];

let playerRole = null;
let roomId = null;
let interval = null;
let spectatorRoom = null;

let selectedSquare = null;
let lastMove = null;


const pieceMap = {
  p:{w:"♙",b:"♟"},
  r:{w:"♖",b:"♜"},
  n:{w:"♘",b:"♞"},
  b:{w:"♗",b:"♝"},
  q:{w:"♕",b:"♛"},
  k:{w:"♔",b:"♚"}
};


const parts = window.location.pathname.split("/").filter(Boolean);
if(parts[0]==="spectate"){
  spectatorRoom = parts[1];
  roomId = spectatorRoom;
  socket.emit("spectate",roomId);
  statusEl.textContent="👁 Spectating Game";
}


function startTurnTimer(){
  clearInterval(interval);
  if(spectatorRoom) return;
  if(chess.turn() !== playerRole){
    timerBox.classList.add("hidden");
    return;
  }
  timerBox.classList.remove("hidden");
  let time = 30;
  timerEl.textContent = time;
  interval = setInterval(()=>{
    time--;
    timerEl.textContent=time;
    if(time<=0){
      clearInterval(interval);
      socket.emit("skipTurn",roomId);
    }
  },1000);
}


function showLegalMoves(square){
  const moves = chess.moves({ square: square, verbose: true });
  moves.forEach(move=>{
    const target = document.querySelector(`[data-square="${move.to}"]`);
    if(!target) return;
    const dot = document.createElement("div");
    dot.className = "move-dot";
    target.appendChild(dot);
  });
}


function renderBoard(){
  boardEl.innerHTML="";
  const board = chess.board();
  board.forEach((row,r)=>{
    row.forEach((sq,c)=>{
      const cell=document.createElement("div");
      cell.className=`square ${(r+c)%2?"dark":"light"}`;
      const square=`${String.fromCharCode(97+c)}${8-r}`;
      cell.dataset.square = square;

      if(lastMove && (square===lastMove.from || square===lastMove.to)){
        cell.classList.add("last-move");
      }

      if(sq){
        const piece=document.createElement("div");
        piece.className = `piece move ${sq.color==="w"?"white":"black"}`;
        piece.textContent = pieceMap[sq.type][sq.color];
        cell.appendChild(piece);

        piece.draggable =
          !spectatorRoom &&
          sq.color===playerRole &&
          chess.turn()===playerRole;

        piece.addEventListener("dragstart", e=>{
          selectedSquare = square;
          e.dataTransfer.setData("from", square);
          showLegalMoves(square);
        });
      }

      cell.addEventListener("dragover", e=>e.preventDefault());
      cell.addEventListener("drop", e=>{
        document.querySelectorAll(".move-dot").forEach(d=>d.remove());
        if(!roomId || spectatorRoom) return;
        const from = e.dataTransfer.getData("from");
        if(!from || from===square) return;

        socket.emit("move",{ roomId, move:{from,to:square,promotion:"q"} });
      });

      boardEl.appendChild(cell);
    });
  });
}


socket.on("waiting", () => {

  statusEl.innerHTML = `
      <div id="pieceLoader" class="piece-loader">♟</div>
      <div class="loading-text">
          Connecting to room<span class="dots"></span>
      </div>
  `;

  const loader = document.getElementById("pieceLoader");

  const pieces = ["♟","♞","♜","♝","♛","♚"];

  setInterval(() => {
    if(loader){
      const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
      loader.textContent = randomPiece;
    }
  }, 2500);

});


socket.on("paired", data => {
    roomId = data.roomId;
    playerRole = data.role;

    statusEl.classList.add("hidden");
    playersEl.classList.remove("hidden");
    boardEl.classList.remove("hidden");
    capturedContainer.classList.remove("hidden");
    spectatorContainer.classList.remove("hidden");

    if(playerRole==="b") boardEl.classList.add("flipped");
    whiteNameEl.textContent = playerRole==="w" ? "You" : "Waiting";
    blackNameEl.textContent = playerRole==="b" ? "You" : "Waiting";

    // Update spectator link properly
    const linkDiv = document.getElementById("spectateLink");
    const linkAnchor = document.getElementById("spectateLinkAnchor");
    linkAnchor.href = `${location.origin}/spectate/${roomId}`;
    linkAnchor.textContent = `${location.origin}/spectate/${roomId}`;
    linkDiv.classList.remove("hidden");
});

socket.on("move", move=>{
  lastMove = move;

  if(move.captured){
    captureSound.currentTime = 0; captureSound.play();
  } else { moveSound.currentTime = 0; moveSound.play(); }

  if(move.captured){
    if(move.color==="w") blackCaptured.push(pieceMap[move.captured]["b"]);
    else whiteCaptured.push(pieceMap[move.captured]["w"]);

    whiteCapturedEl.textContent = whiteCaptured.join(" ");
    blackCapturedEl.textContent = blackCaptured.join(" ");
  }

  chess.move(move);
  renderBoard();
  startTurnTimer();

  if(chess.in_checkmate()){
    checkmateSound.currentTime = 0; checkmateSound.play();
    const winner = chess.turn() === "w" ? "Black" : "White";
    setTimeout(()=>{
      winSound.currentTime = 0; winSound.play();
      alert(`Checkmate! ${winner} wins!`);
      location.reload();
    },150);
  } else if(chess.in_check()){
    statusEl.textContent = "⚠ CHECKMATE!";
  } else {
    statusEl.textContent = "";
  }
});

socket.on("boardState", data=>{
  chess.load(data.fen);
  renderBoard();
  startTurnTimer();
  statusEl.textContent = data.check ? "⚠ CHECKMATE!" : "";
});

socket.on("spectatorCount", count=>{
  if(spectatorEl) spectatorEl.textContent = count;
});

socket.on("gameOver", msg => {
  clearInterval(interval);
  winSound.currentTime = 0;
  winSound.play();
  setTimeout(() => {
    alert(msg);
    location.reload();
  }, 200);
});