import React, { useEffect, useState, useRef, useContext } from 'react';
import { io } from 'socket.io-client';
import { useParams } from "react-router-dom";



// const token = localStorage.getItem('token');
// Connect to FastAPI websocket (make sure FastAPI uses socket.io integration)
// const socket = io('http://localhost:8000', {
//   path: '/ws/sockets',
//   transports: ['websocket'],
//   auth: {
//       token: token,
//       room_id: roomid,
//     },
// });

function DocRoom() {
    const { roomid } = useParams();
    const token = localStorage.getItem('token');

    const socket = io('http://localhost:8000', {
  path: '/ws/sockets',
  transports: ['websocket'],
  auth: {
      token: token,
      room_id: roomid,
    },
});

//   return (
//     <div>
//       <h2>Welcome to Room {roomid}</h2>
//     </div>
//   );

  const [isConnected, setIsConnected] = useState(socket ? socket.connected:false);
  const [documentText, setDocumentText] = useState('');
  const ignoreChange = useRef(false);
  

  useEffect(() => {
    
    socket.on('connect', () => setIsConnected(socket.connected));
    socket.on('disconnect', () => setIsConnected(socket.connected));

    // When another user edits, update the local document
    socket.on('document_update', (newText) => {
      // Prevent infinite loops by marking this as remote update
      ignoreChange.current = true;
      setDocumentText(newText);
    });

    // Optionally request the current document on load
    socket.emit('get_document');

    socket.on('load_document', (doc) => {
      setDocumentText(doc);
    });

  }, []);

  // Emit changes as user types
  const handleChange = (e) => {
    const newText = e.target.value;
    setDocumentText(newText);

    if (!ignoreChange.current) {
      socket.emit('edit_document', newText);
    } else {
      ignoreChange.current = false;
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</h2>

      <textarea
        value={documentText}
        onChange={handleChange}
        placeholder="Start typing..."
        style={{
          width: '100%',
          height: '400px',
          fontSize: '16px',
          padding: '10px',
          border: '1px solid #ccc',
          borderRadius: '8px',
          resize: 'none',
        }}
      />
    </div>

  );
}

export default DocRoom;
