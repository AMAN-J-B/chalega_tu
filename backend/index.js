import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import axios from "axios";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const rooms = new Map();
const port = process.env.PORT || 5000;
 const url = `http://localhost:5000`;
//const url = `https://chalega-tu.onrender.com`;
const reloadInterval = 30000;

// Periodic website reload
function reloadWebsite() {
  axios
    .get(url)
    .then((response) => {
      console.log(
        `Reloaded at ${new Date().toISOString()}: Status Code ${response.status}`
      );
    })
    .catch((error) => {
      console.error(
        `Error reloading at ${new Date().toISOString()}:`,
        error.message
      );
    });
}
setInterval(reloadWebsite, reloadInterval);

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  let currentRoom = null;
  let currentUser = null;

  // Handle user joining a room
  socket.on("join", ({ roomId, userName }) => {
    console.log(`User ${userName} joining room: ${roomId}`);
    if (currentRoom) {
      // Leave current room
      console.log(`User ${currentUser} leaving room: ${currentRoom}`);
      socket.leave(currentRoom);
      rooms.get(currentRoom)?.delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom) || []));
    }

    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(userName);

    io.to(roomId).emit("userJoined", Array.from(rooms.get(roomId)));
    console.log(`Users in room ${roomId}:`, Array.from(rooms.get(roomId)));
  });

  // Handle code changes
  socket.on("codeChange", ({ roomId, code }) => {
    console.log(`Code updated in room ${roomId} by ${currentUser}`);
    socket.to(roomId).emit("codeUpdate", code);
  });

  // Handle cursor movement
  socket.on("cursorMove", ({ roomId, userId, position }) => {
    console.log(`Cursor moved: Room ${roomId}, User ${userId}, Position ${position}`);
    socket.to(roomId).emit("cursorUpdate", { userId, position });
  });

  // Handle user leaving a room
  socket.on("leaveRoom", () => {
    console.log(`User ${currentUser} leaving room ${currentRoom}`);
    if (currentRoom && currentUser) {
      rooms.get(currentRoom)?.delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom) || []));
      socket.leave(currentRoom);
    }
    currentRoom = null;
    currentUser = null;
  });

  // Handle user disconnect
  socket.on("disconnect", () => {
    console.log(`User Disconnected: ${socket.id}`);
    if (currentRoom && currentUser) {
      rooms.get(currentRoom)?.delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom) || []));
    }
  });
});

// Serve static files
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "/frontend/dist")));

// Fallback route to serve the frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

// Start the server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
