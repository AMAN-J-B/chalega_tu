import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import axios from "axios";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity
  },
});

const rooms = new Map(); // Map to store room data (users and code)
const port = process.env.PORT || 5000;
const url = `https://chalega-tu.onrender.com`;
//const url = `http://localhost:5000`; // Replace with your server URL
const reloadInterval = 30000;

function reloadWebsite() {
  axios
    .get(url)
    .then((response) => {
      console.log(`Reloaded at ${new Date().toISOString()}: Status Code ${response.status}`);
    })
    .catch((error) => {
      console.error(`Error reloading at ${new Date().toISOString()}:`, error.message);
    });
}

setInterval(reloadWebsite, reloadInterval);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  let currentRoom = null;
  let currentUser = null;

  // Handle user joining a room
  socket.on("join", ({ roomId, userName }) => {
    console.log(`User ${userName} joining room: ${roomId}`);
    if (currentRoom) {
      socket.leave(currentRoom);
      rooms.get(currentRoom)?.delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom) || []));
    }

    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Set(), code: "// start code here" });
    }
    rooms.get(roomId).users.add(userName);

    io.to(roomId).emit("userJoined", Array.from(rooms.get(roomId).users));
    console.log(`Users in room ${roomId}:`, Array.from(rooms.get(roomId).users));
    socket.emit("codeUpdate", rooms.get(roomId).code); // Send current code to the user
  });

  // Handle code changes
  socket.on("codeChange", ({ roomId, code }) => {
    console.log(`Code updated in room ${roomId} by ${currentUser}`);
    rooms.get(roomId).code = code; // Update room's code
    socket.to(roomId).emit("codeUpdate", code); // Broadcast updated code to other users
  });

  // Handle cursor movement
  socket.on("cursorMove", ({ roomId, userId, position }) => {
    console.log(`Cursor moved in room ${roomId} by ${userId} to position ${position}`);
    socket.to(roomId).emit("cursorUpdate", { userId, position });
  });

  // Handle selection changes
  socket.on("selectionChange", ({ roomId, userId, selection }) => {
    console.log(`Selection changed in room ${roomId} by ${userId}: Start ${selection.start}, End ${selection.end}`);
    socket.to(roomId).emit("selectionUpdate", { userId, selection });
  });

  // Handle user leaving a room
  socket.on("leaveRoom", () => {
    console.log(`User ${currentUser} leaving room ${currentRoom}`);
    if (currentRoom && currentUser) {
      rooms.get(currentRoom)?.users.delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users));
      socket.leave(currentRoom);
    }//inko andar rkna h 
    currentRoom = null;
    currentUser = null;
  });

  socket.on("typing", ({ roomId, userName }) => {
    socket.to(roomId).emit("userTyping", userName);
  });

  socket.on("languageChange", ({ roomId, language }) => {
    io.to(roomId).emit("languageUpdate", language);
  });


  // Handle user disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    if (currentRoom && currentUser) {
      rooms.get(currentRoom)?.users.delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users));
    }
  });
});

// Serve static files (e.g., for a React frontend)
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
