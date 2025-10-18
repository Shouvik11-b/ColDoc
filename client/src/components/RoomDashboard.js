import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { roomAPI } from '../services/api';
import './Dashboard.css';

const RoomsDashboard = () => {
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const roomData = await roomAPI.getRooms();
      setRooms(roomData);
    } catch (err) {
      setError('Failed to fetch rooms');
      console.error('Error fetching rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setNewRoomName(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newRoomName.trim()) {
      setError('Please enter a room name');
      return;
    }

    try {
      setLoading(true);
      // Only send { name: "..." } as the payload
      const createdRoom = await roomAPI.createRoom({ name: newRoomName.trim() });
      setRooms([...rooms, createdRoom]);
      setNewRoomName('');
      setSuccess('Room created successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to create room');
      console.error('Error creating room:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  const handleRoomClick = (roomId) => {
    navigate(`/room/${roomId}`);
  };

  const handleAddToRoomClick = (e) => {
    setNewRoomId(Number(e.target.value))
  }

  const handleAddToRoom = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newRoomId) {
      setError('Please enter a room id');
      return;
    }

    try {
      setLoading(true);
      // Only send { name: "..." } as the payload
      const createdRoom = await roomAPI.addToRoom(newRoomId);
      setRooms([...rooms, createdRoom]);
      setNewRoomId('');
      setSuccess('Room added successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to add to room');
      console.error('Error adding to room:', err);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Rooms Dashboard</h1>
          <div className="user-info">
            <span>Welcome, {user?.username}!</span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="add-room-section">
          <h2>Create New Room</h2>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <form onSubmit={handleSubmit} className="room-form">
            <div className="form-group">
              <label htmlFor="name">Room Name:</label>
              <input
                type="text"
                id="name"
                name="name"
                value={newRoomName}
                onChange={handleInputChange}
                placeholder="e.g., Dev Team"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="add-button">
              {loading ? 'Creating...' : 'Create Room'}
            </button>
          </form>
          <form onSubmit={handleAddToRoom} className="room-form">
            <div className="form-group">
              <label htmlFor="name">Room Id:</label>
              <input
                type="text"
                id="name"
                name="name"
                value={newRoomId}
                onChange={handleAddToRoomClick}
                placeholder="e.g., Dev Team"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="add-button">
              {loading ? 'Creating...' : 'Add to Room'}
            </button>
          </form>
        </div>

        <div className="rooms-section">
          <h2>My Rooms</h2>
          {loading && rooms.length === 0 ? (
            <div className="loading">Loading rooms...</div>
          ) : rooms.length === 0 ? (
            <div className="no-rooms">No rooms created yet. Add your first room above!</div>
          ) : (
            <div className="rooms-grid">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="room-card"
                  onClick={() => handleRoomClick(room.id)}
                >
                  <h3>{room.name}</h3>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default RoomsDashboard;
