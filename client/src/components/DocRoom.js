import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { useParams } from "react-router-dom";

function DocRoom() {
  const { roomid } = useParams();
  const token = localStorage.getItem("token");

  // Persistent socket reference
  const socketRef = useRef(null);

  // Document state
  const [documentText, setDocumentText] = useState("");
  const [version, setVersion] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [cursors, setCursors] = useState({});
  const [username, setUsername] = useState("");

  // Refs for cursor management and change detection
  const textareaRef = useRef(null);
  const lastCursorPos = useRef(0);
  const processingUpdate = useRef(false);
  const ignoreNextChange = useRef(false);

  // Initialize socket connection once
  useEffect(() => {
    console.log("🔌 Connecting to Socket.IO server...");

    const socket = io("http://localhost:8000", {
      path: "/ws/sockets",
      transports: ["websocket"],
      auth: { token, room_id: roomid },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // --- Connection Events ---
    socket.on("connect", () => {
      console.log("✅ Connected to server");
      setIsConnected(true);
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Connection error:", err.message);
      setIsConnected(false);
    });

    socket.on("disconnect", (reason) => {
      console.warn("⚠️ Disconnected:", reason);
      setIsConnected(false);
      
      // Auto-reconnect on unexpected disconnection
      if (reason === "io server disconnect") {
        socket.connect();
      }
    });

    socket.on("reconnect", (attempt) => {
      console.log(`🔁 Reconnected after ${attempt} attempts`);
      setIsConnected(true);
      // Request document resync after reconnection
      socket.emit("request_sync");
    });

    // --- Document Sync Events ---
    socket.on("load_document", ({ content, version: docVersion, cursors: remoteCursors }) => {
      console.log("📄 Document loaded, version:", docVersion);
      ignoreNextChange.current = true;
      setDocumentText(content);
      setVersion(docVersion);
      
      if (remoteCursors) {
        setCursors(remoteCursors);
      }
    });

    socket.on("document_update", ({ op, version: newVersion, username: remoteUser, cursor, sid }) => {
      if (processingUpdate.current) return;
      
      processingUpdate.current = true;
      console.log("✏️ Incoming update from", remoteUser, ":", op);

      // Apply operation to document
      setDocumentText((prevText) => {
        const newText = applyOperation(prevText, op);
        
        // Transform and preserve local cursor position
        if (textareaRef.current && document.activeElement === textareaRef.current) {
          const currentCursor = textareaRef.current.selectionStart;
          const transformedCursor = transformCursorPosition(currentCursor, op);
          
          // Restore cursor position after React re-render
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = transformedCursor;
              textareaRef.current.selectionEnd = transformedCursor;
              lastCursorPos.current = transformedCursor;
            }
            processingUpdate.current = false;
          }, 0);
        } else {
          processingUpdate.current = false;
        }
        
        return newText;
      });

      setVersion(newVersion);

      // Update remote cursor position
      if (cursor !== undefined && sid) {
        setCursors((prev) => ({
          ...prev,
          [sid]: { position: cursor, username: remoteUser },
        }));
      }
    });

    // --- Cursor Events ---
    socket.on("cursor_update", ({ sid, username: remoteUser, position }) => {
      setCursors((prev) => ({
        ...prev,
        [sid]: { position, username: remoteUser },
      }));
    });

    // --- User Events ---
    socket.on("user_joined", ({ sid, username: newUser }) => {
      console.log("👤 User joined:", newUser);
    });

    socket.on("user_left", ({ sid, username: leftUser }) => {
      console.log("👋 User left:", leftUser);
      setCursors((prev) => {
        const newCursors = { ...prev };
        delete newCursors[sid];
        return newCursors;
      });
    });

    // --- Resync Event ---
    socket.on("resync", ({ content, version: syncVersion }) => {
      console.log("🔄 Resyncing document to version:", syncVersion);
      ignoreNextChange.current = true;
      setDocumentText(content);
      setVersion(syncVersion);
    });

    // Cleanup on unmount
    return () => {
      console.log("🧹 Disconnecting socket...");
      socket.disconnect();
    };
  }, [roomid, token]);

  // --- Apply incoming operations ---
  const applyOperation = (text, op) => {
    try {
      if (op.type === "insert") {
        return text.slice(0, op.pos) + op.text + text.slice(op.pos);
      } else if (op.type === "delete") {
        return text.slice(0, op.pos) + text.slice(op.pos + op.length);
      } else if (op.type === "replace") {
        const length = op.length || 0;
        return text.slice(0, op.pos) + op.text + text.slice(op.pos + length);
      }
    } catch (error) {
      console.error("❌ Error applying operation:", error);
      // Request resync on error
      socketRef.current?.emit("request_sync");
    }
    return text;
  };

  // --- Transform cursor position based on operation ---
  const transformCursorPosition = (cursorPos, op) => {
    if (op.type === "insert") {
      // If insert happened before cursor, shift cursor right
      if (op.pos <= cursorPos) {
        return cursorPos + op.text.length;
      }
    } else if (op.type === "delete") {
      // If delete happened before cursor, shift cursor left
      if (op.pos < cursorPos) {
        const deletedBeforeCursor = Math.min(op.length, cursorPos - op.pos);
        return Math.max(op.pos, cursorPos - deletedBeforeCursor);
      } else if (op.pos === cursorPos) {
        return cursorPos; // Deletion at cursor position
      }
    } else if (op.type === "replace") {
      if (op.pos < cursorPos) {
        const oldLength = op.length || 0;
        const newLength = op.text.length;
        return cursorPos - oldLength + newLength;
      }
    }
    return cursorPos;
  };

  // --- Generate operation from text difference ---
  const generateOperation = (oldText, newText, cursorPos) => {
    // Find where the change starts
    let startPos = 0;
    while (
      startPos < oldText.length &&
      startPos < newText.length &&
      oldText[startPos] === newText[startPos]
    ) {
      startPos++;
    }

    // Find where the change ends (working backwards)
    let oldEnd = oldText.length;
    let newEnd = newText.length;
    while (
      oldEnd > startPos &&
      newEnd > startPos &&
      oldText[oldEnd - 1] === newText[newEnd - 1]
    ) {
      oldEnd--;
      newEnd--;
    }

    const deletedText = oldText.slice(startPos, oldEnd);
    const insertedText = newText.slice(startPos, newEnd);

    // Determine operation type
    if (deletedText.length > 0 && insertedText.length > 0) {
      // Replace operation (simultaneous delete and insert)
      return {
        type: "replace",
        pos: startPos,
        length: deletedText.length,
        text: insertedText,
      };
    } else if (insertedText.length > 0) {
      // Pure insert
      return {
        type: "insert",
        pos: startPos,
        text: insertedText,
      };
    } else if (deletedText.length > 0) {
      // Pure delete
      return {
        type: "delete",
        pos: startPos,
        length: deletedText.length,
      };
    }

    return null; // No change
  };

  // --- Handle local typing ---
  const handleChange = (e) => {
    // Skip if this is a programmatic change from remote update
    if (ignoreNextChange.current) {
      ignoreNextChange.current = false;
      return;
    }

    const newText = e.target.value;
    const oldText = documentText;
    const cursorPos = e.target.selectionStart;

    // Generate operation
    const op = generateOperation(oldText, newText, cursorPos);

    if (op && socketRef.current?.connected) {
      console.log("⬆️ Sending operation:", op);
      
      // Send to server with current version and cursor position
      socketRef.current.emit("edit_document", {
        version,
        op,
        cursor: cursorPos,
      });
    }

    // Update local state immediately (optimistic update)
    setDocumentText(newText);
    lastCursorPos.current = cursorPos;
  };

  // --- Handle cursor movement ---
  const handleSelect = (e) => {
    const cursorPos = e.target.selectionStart;
    
    // Only emit if cursor actually moved
    if (cursorPos !== lastCursorPos.current) {
      lastCursorPos.current = cursorPos;
      
      if (socketRef.current?.connected) {
        socketRef.current.emit("cursor_move", { position: cursorPos });
      }
    }
  };

  // --- Calculate line and column from cursor position ---
  const getCursorLineColumn = (text, position) => {
    const lines = text.slice(0, position).split("\n");
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  };

  const currentCursorInfo = getCursorLineColumn(documentText, lastCursorPos.current);

  return (
    <div style={{ padding: "1rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ 
        marginBottom: "1rem", 
        padding: "1rem", 
        backgroundColor: "#f5f5f5", 
        borderRadius: "8px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <h2 style={{ margin: 0 }}>
            Room: <strong>{roomid}</strong>
          </h2>
          <div style={{ fontSize: "0.9rem", color: "#666", marginTop: "0.5rem" }}>
            Version: {version} | 
            Status: {isConnected ? "🟢 Connected" : "🔴 Disconnected"} |
            Active users: {Object.keys(cursors).length + 1}
          </div>
        </div>
        
        <div style={{ fontSize: "0.9rem", color: "#666" }}>
          Line: {currentCursorInfo.line}, Col: {currentCursorInfo.column}
        </div>
      </div>

      {/* Active Users */}
      {Object.keys(cursors).length > 0 && (
        <div style={{ 
          marginBottom: "1rem", 
          padding: "0.5rem 1rem", 
          backgroundColor: "#e3f2fd", 
          borderRadius: "4px",
          fontSize: "0.9rem"
        }}>
          <strong>Active users:</strong>
          {Object.entries(cursors).map(([sid, data]) => (
            <span key={sid} style={{ 
              marginLeft: "15px",
              padding: "2px 8px",
              backgroundColor: getColorForUser(sid),
              color: "white",
              borderRadius: "12px"
            }}>
              {data.username} (Line {getCursorLineColumn(documentText, data.position).line})
            </span>
          ))}
        </div>
      )}

      {/* Document Editor */}
      <div style={{ position: "relative" }}>
        <textarea
          ref={textareaRef}
          value={documentText}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyUp={handleSelect}
          onClick={handleSelect}
          placeholder="Start typing..."
          disabled={!isConnected}
          style={{
            width: "100%",
            height: "500px",
            fontSize: "16px",
            padding: "15px",
            border: isConnected ? "2px solid #4CAF50" : "2px solid #f44336",
            borderRadius: "8px",
            resize: "vertical",
            fontFamily: "Monaco, Consolas, 'Courier New', monospace",
            lineHeight: "1.5",
            backgroundColor: isConnected ? "white" : "#f9f9f9",
          }}
        />
        
        {!isConnected && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "rgba(244, 67, 54, 0.9)",
            color: "white",
            padding: "1rem 2rem",
            borderRadius: "8px",
            fontSize: "1.2rem",
            fontWeight: "bold",
            pointerEvents: "none"
          }}>
            ⚠️ Disconnected - Reconnecting...
          </div>
        )}
      </div>

      {/* Statistics */}
      <div style={{ 
        marginTop: "1rem", 
        fontSize: "0.8rem", 
        color: "#999",
        display: "flex",
        justifyContent: "space-between"
      }}>
        <div>
          Characters: {documentText.length} | 
          Words: {documentText.trim().split(/\s+/).filter(Boolean).length} |
          Lines: {documentText.split("\n").length}
        </div>
        <div>
          Server Version: {version}
        </div>
      </div>
    </div>
  );
}

// Helper function to generate consistent colors for users
const getColorForUser = (sid) => {
  const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F06292", "#AED581"];
  const hash = sid.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
};

export default DocRoom;
