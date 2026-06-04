const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let waitingUsers = [];

function canMatch(a, b) {
  const aOK = a.seeking === "random" || a.seeking === b.gender;
  const bOK = b.seeking === "random" || b.seeking === a.gender;
  return aOK && bOK;
}

/* 🟢 ONLINE SYSTEM */
function updateOnline() {
  const count = io.engine.clientsCount;
  io.emit("online", count);
}

io.on("connection", (socket) => {

  updateOnline(); // 🟢 nowy user

  socket.data.gender = null;
  socket.data.seeking = null;
  socket.data.room = null;

  socket.on("setProfile", (data) => {
    socket.data.gender = data.gender;
    socket.data.seeking = data.seeking;
  });

  socket.on("find", () => {

    waitingUsers = waitingUsers.filter(u => u.socket.id !== socket.id);

    const matchIndex = waitingUsers.findIndex(u => canMatch(socket.data, u));

    if (matchIndex !== -1) {

      const partnerObj = waitingUsers.splice(matchIndex, 1)[0];
      const partner = partnerObj.socket;

      const room = "room_" + Date.now();

      socket.join(room);
      partner.join(room);

      socket.data.room = room;
      partner.data.room = room;

      socket.emit("matched");
      partner.emit("matched");

      socket.emit("connected");
      partner.emit("connected");

    } else {
      waitingUsers.push({
        socket,
        gender: socket.data.gender,
        seeking: socket.data.seeking
      });

      socket.emit("waiting");
    }
  });

  socket.on("message", (text) => {
    const room = socket.data.room;
    if (!room) return;

    io.to(room).emit("message", {
      text,
      sender: socket.id
    });
  });

  socket.on("typing", () => {
    const room = socket.data.room;
    if (!room) return;

    socket.to(room).emit("typing");
  });

  socket.on("manual-disconnect", () => {
    const room = socket.data.room;
    if (!room) return;

    socket.to(room).emit("partner-left");

    socket.leave(room);
    socket.data.room = null;

    socket.emit("disconnected");
  });

  socket.on("disconnect", () => {

    waitingUsers = waitingUsers.filter(u => u.socket.id !== socket.id);

    const room = socket.data.room;
    if (room) socket.to(room).emit("partner-left");

    updateOnline(); // 🔴 user wychodzi
  });

});

server.listen(3000, () => {
  console.log("http://localhost:3000");
});