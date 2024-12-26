import { useEffect, useState, useRef } from "react";
import "./App.css";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";
import * as MonacoCollabExt from "@convergencelabs/monaco-collab-ext";

// Connect to the server
const socket = io("https://chalega-tu.onrender.com");
//const socket = io("http://localhost:5000");

const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("// start code here");
  const [users, setUsers] = useState([]);
  const [copySuccess, setCopySuccess] = useState("");
  const [typing, setTyping] = useState("");
  const [output, setOutput] = useState("");
  const editorRef = useRef(null);
  const cursorManagerRef = useRef(null);
  const selectionManagerRef = useRef(null);
  const cursorMap = useRef({}); // Map of user cursors

  useEffect(() => {
    // Listen to users joining the room
    socket.on("userJoined", (users) => {
      console.log("Users in room:", users);
      setUsers(users);
    });

    // Listen to remote code updates
    socket.on("codeUpdate", (newCode) => {
      console.log("Code updated:", newCode);
      setCode(newCode);
    });

    socket.on("userTyping", (user) => {
      setTyping(`${user.slice(0, 8)}... is Typing`);
      setTimeout(() => setTyping(""), 2000);
    });

    socket.on("languageUpdate", (newLanguage) => {
      setLanguage(newLanguage);
    });

    // Handle cursor updates from other users
    socket.on("cursorUpdate", ({ userId, position }) => {
      if (cursorManagerRef.current) {
        // Update or create cursor for the user
        let cursor = cursorMap.current[userId];
        if (!cursor) {
          cursor = cursorManagerRef.current.addCursor(
            userId,
            getRandomColor(),
            userId
          );
          cursorMap.current[userId] = cursor;
        }
        cursor.setOffset(position);
      }
    });

    // Handle selection updates from other users
    socket.on("selectionUpdate", ({ userId, selection }) => {
      if (selectionManagerRef.current) {
        selectionManagerRef.current.setSelectionOffsets(
          userId,
          selection.start,
          selection.end
        );
      }
    });

    return () => {
      socket.off("userJoined");
      socket.off("codeUpdate");
      socket.off("cursorUpdate");
      socket.off("selectionUpdate");
      socket.off("languageUpdate");
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      socket.emit("leaveRoom");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const joinRoom = () => {
    if (roomId && userName) {
      socket.emit("join", { roomId, userName });
      setJoined(true);
    }
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    setJoined(false);
    setRoomId("");
    setUserName("");
    setCode("// start code here");
    setLanguage("javascript");
    setOutput("");
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopySuccess("Copied!");
    setTimeout(() => setCopySuccess(""), 2000);
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    socket.emit("languageChange", { roomId, language: newLanguage });
  };

  const runCode = async () => {
    try {
      const response = await fetch("https://emkc.org/api/v2/piston/execute", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language: language,
          version: "*", // Use "*" to select the latest version, or specify a version like "3.10.0"
          files: [
            {
              content: code, // 'code' holds the source code from your editor
            },
          ],
        }),
      });
  
  const result = await response.json();

      setOutput(result.run.output || "No output received.");
    } catch (error) {
      setOutput("Error running code: " + error.message);
    }
  };
  

  const editorDidMount = (editor) => {
    editorRef.current = editor;

    // Initialize cursor and selection managers
    cursorManagerRef.current = new MonacoCollabExt.RemoteCursorManager({
      editor,
      tooltips: true,
      tooltipDuration: 2,
    });

    selectionManagerRef.current = new MonacoCollabExt.RemoteSelectionManager({
      editor,
    });

    // Create a local cursor for the current user
    const localCursor = cursorManagerRef.current.addCursor(userName, "red", userName);

    // Emit cursor and selection changes to the server
    editor.onDidChangeCursorPosition((e) => {
      const offset = editor.getModel().getOffsetAt(e.position);
      if (roomId) {
        socket.emit("cursorMove", { roomId, userId: userName, position: offset });
      }
      if (localCursor) {
        localCursor.setOffset(offset);
      }
    });

    editor.onDidChangeCursorSelection((e) => {
      const startOffset = editor.getModel().getOffsetAt(e.selection.getStartPosition());
      const endOffset = editor.getModel().getOffsetAt(e.selection.getEndPosition());
      if (roomId) {
        socket.emit("selectionChange", {
          roomId,
          userId: userName,
          selection: { start: startOffset, end: endOffset },
        });
      }
      if (selectionManagerRef.current) {
        selectionManagerRef.current.setSelectionOffsets(
          userName,
          startOffset,
          endOffset
        );
      }
    });

    // Ensure Monaco Editor resizes correctly when the window is resized
    window.addEventListener('resize', () => {
      editor.layout();
    });

    // Make sure the editor resizes on initial mount
    editor.layout();
  };

  const getRandomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16)}`;

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
        <div className="room-info">
          
        <h2>Code Room: {roomId}</h2>
          <button onClick={copyRoomId} className="copy-button">
            Copy Id
          </button>
          {copySuccess && <span className="copy-success">{copySuccess}</span>}
        </div>
        <h3>Users in Room:</h3>
        <ul>
          {users.map((user, index) => (
            <li key={index}>{user.slice(0, 8)}...</li>
          ))}
        </ul>
        <p className="typing-indicator">{typing}</p>
        <select
          className="language-selector"
          value={language}
          onChange={handleLanguageChange}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
        </select>
        <button className = "leave-button" onClick={leaveRoom}>Leave Room</button>
      </div>

      <div className="editor-wrapper" style={{ display: 'flex', width: '100%' }}>
        {/* Left editor: Editable */}
        <div style={{ flex: 1 }}>
          <Editor
            height="80%"
            defaultLanguage={language}
            language={language}
            value={code}
            onChange={handleCodeChange}
            theme="vs-dark"
            onMount={editorDidMount}
          />
        </div>

        {/* Right editor: Synchronized */}
        <div style={{ flex: 1 }}>
          <Editor
            height="80%"
            language={language}
            value={code}
            theme="vs-dark"
            options={{ readOnly: true }}
          />
          <button className="run-button" onClick={runCode}>
          Run Code
        </button>
        <div className="output-container">
          <h3>Output:</h3>
          <pre>{output}</pre>
        </div>
      </div>
    </div>
    </div>
  );
};

export default App;
