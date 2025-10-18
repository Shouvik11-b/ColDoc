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

  // Initialize socket connection once
  useEffect(() => {
    console.log("🔌 Connecting to Socket.IO server...");

    const socket = io("http://localhost:8000", {
      path: "/ws/sockets", // ✅ Must match FastAPI mount path
      transports: ['websocket'],
      auth: { token, room_id: roomid },
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
    });

    socket.on("reconnect", (attempt) => {
      console.log(`🔁 Reconnected after ${attempt} attempts`);
      setIsConnected(true);
    });

    // --- Document Sync Events ---
    socket.on("load_document", ({ content, version }) => {
      console.log("📄 Document loaded:", content);
      setDocumentText(content);
      setVersion(version);
    });

    socket.on("document_update", ({ op, version: newVersion }) => {
      console.log("✏️ Incoming update:", op);
      applyOperation(op);
      setVersion(newVersion);
    });

    // Cleanup on unmount
    return () => {
      console.log("🧹 Disconnecting socket...");
      socket.disconnect();
    };
  }, [roomid, token]);

  // --- Apply incoming operations ---
  const applyOperation = (op) => {
    setDocumentText((prevText) => {
      if (op.type === "insert") {
        return prevText.slice(0, op.pos) + op.text + prevText.slice(op.pos);
      } else if (op.type === "delete") {
        return prevText.slice(0, op.pos) + prevText.slice(op.pos + op.length);
      }
      return prevText;
    });
  };

  // --- Handle local typing ---
  const handleChange = (e) => {
    const newText = e.target.value;
    const oldText = documentText;

    // Find simple diff start position
    let i = 0;
    while (i < newText.length && newText[i] === oldText[i]) i++;

    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    // Determine operation type
    if (newText.length > oldText.length) {
      // Inserted text
      const inserted = newText.slice(i, newText.length - (oldText.length - i));
      const op = { type: "insert", pos: i, text: inserted };
      console.log("⬆️ Sending insert op:", op);
      socket.emit("edit_document", { version, op });
    } else if (newText.length < oldText.length) {
      // Deleted text
      const deletedLen = oldText.length - newText.length;
      const op = { type: "delete", pos: i, length: deletedLen };
      console.log("⬆️ Sending delete op:", op);
      socket.emit("edit_document", { version, op });
    }

    // Update local text immediately
    setDocumentText(newText);
  };

  return (
    <div style={{ padding: "1rem" }}>
      <h2>
        Room <strong>{roomid}</strong> —{" "}
        {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
      </h2>

      <textarea
        value={documentText}
        onChange={handleChange}
        placeholder="Start typing..."
        style={{
          width: "100%",
          height: "400px",
          fontSize: "16px",
          padding: "10px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          resize: "none",
        }}
      />
    </div>
  );
}

export default DocRoom;
