import { useEffect, useState, useRef } from "react";
import "./App.css";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";
import * as MonacoCollabExt from "@convergencelabs/monaco-collab-ext";

const socket = io("http://localhost:5000"); // Change to your server address

const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("// start code here");
  const [users, setUsers] = useState([]);
  const editorRef = useRef(null);
  const cursorManagerRef = useRef(null);
  const cursorMap = useRef({}); // To keep track of cursors by userId

  useEffect(() => {
    // Handle users joining the room
    socket.on("userJoined", (users) => {
      console.log("Users in room:", users);
      setUsers(users);
    });

    // Handle remote code updates
    socket.on("codeUpdate", (newCode) => {
      console.log("Code updated:", newCode);
      setCode(newCode);
    });

    // Handle cursor position updates from other users
    socket.on("cursorUpdate", ({ userId, position }) => {
      console.log(`Cursor update from user ${userId}: Position ${position}`);
      if (cursorManagerRef.current) {
        // Create or update the cursor for the user
        let cursor = cursorMap.current[userId];
        if (!cursor) {
          cursor = cursorManagerRef.current.addCursor(userId, getRandomColor(), userId.slice(0, 8));
          cursorMap.current[userId] = cursor;
        }
        cursor.setOffset(position);
      }
    });

    return () => {
      socket.off("userJoined");
      socket.off("codeUpdate");
      socket.off("cursorUpdate");
    };
  }, []);

  const joinRoom = () => {
    console.log(`Joining room: ${roomId}, Username: ${userName}`);
    if (roomId && userName) {
      socket.emit("join", { roomId, userName });
      setJoined(true);
    }
  };

  const leaveRoom = () => {
    console.log(`Leaving room: ${roomId}`);
    socket.emit("leaveRoom");
    setJoined(false);
    setRoomId("");
    setUserName("");
    setCode("// start code here");
    setLanguage("javascript");
  };

  const handleCodeChange = (newCode) => {
    console.log("Code changed locally:", newCode);
    setCode(newCode);
    socket.emit("codeChange", { roomId, code: newCode });
  };

  const editorDidMount = (editor) => {
    console.log("Editor mounted");
    editorRef.current = editor;

    // Initialize the cursor manager
    cursorManagerRef.current = new MonacoCollabExt.RemoteCursorManager({
      editor,
      tooltips: true,
      tooltipDuration: 2,
    });

    // Create a local cursor for the user
    const localCursor = cursorManagerRef.current.addCursor(userName, "red", userName);

    // Emit local cursor movements to the server
    editor.onDidChangeCursorPosition((e) => {
      const offset = editor.getModel().getOffsetAt(e.position);
      console.log(`Local cursor moved: Position ${offset}`);
      socket.emit("cursorMove", { roomId, userId: userName, position: offset });

      if (localCursor) {
        localCursor.setOffset(offset);
      }
    });
  };

  // Generate a random color for each user
  const getRandomColor = () => {
    return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
  };

  if (!joined) {
    return (
      <div className="join-container">
        <div className="join-form">
          <h1>Join Code Room</h1>
          <input
            type="text"
            placeholder="Room Id"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Your Name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="sidebar">
        <h2>Code Room: {roomId}</h2>
        <h3>Users in Room:</h3>
        <ul>
          {users.map((user, index) => (
            <li key={index}>{user.slice(0, 8)}...</li>
          ))}
        </ul>
        <button onClick={leaveRoom}>Leave Room</button>
      </div>

      <div className="editor-wrapper">
        <Editor
          height="100%"
          defaultLanguage={language}
          language={language}
          value={code}
          onChange={handleCodeChange}
          theme="vs-dark"
          onMount={editorDidMount}
        />
      </div>
    </div>
  );
};

export default App;
