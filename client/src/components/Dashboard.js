// src/components/Dashboard.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fruitAPI } from '../services/api';
import { useNavigate, Link } from 'react-router-dom';

import './Dashboard.css';

const Dashboard = () => {
  const [fruits, setFruits] = useState([]);
  const [newFruit, setNewFruit] = useState({ name: '', colour: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const { user, logout } = useAuth();

  const navigate = useNavigate();

  useEffect(() => {
    fetchFruits();
  }, []);

  const fetchFruits = async () => {
    try {
      setLoading(true);
      const fruitData = await fruitAPI.getFruits();
      setFruits(fruitData);
    } catch (error) {
      setError('Failed to fetch fruits');
      console.error('Error fetching fruits:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setNewFruit({
      ...newFruit,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newFruit.name.trim() || !newFruit.colour.trim()) {
      setError('Please fill in both name and colour');
      return;
    }

    try {
      setLoading(true);
      const createdFruit = await fruitAPI.createFruit(newFruit);
      setFruits([...fruits, createdFruit]);
      setNewFruit({ name: '', colour: '' });
      setSuccess('Fruit added successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('Failed to add fruit');
      console.error('Error adding fruit:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  const goToRoomPage = () => {
    navigate('/room');
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Fruit Management Dashboard</h1>
          <div className="user-info">
            <span>Welcome, {user?.username}!</span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
            <button onClick={goToRoomPage} className="logout-button">
              Rooms
            </button>
          </div>
        </div>
      </header>
      {/* <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Fruit Management Dashboard</h1>
          <div className="user-info">
            <span>Welcome, {user?.username}!</span>
            
              Logout
            </button>
          </div>
        </div>
      </header> */}

      <main className="dashboard-main">
        <div className="add-fruit-section">
          <h2>Add New Fruit</h2>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          
          <form onSubmit={handleSubmit} className="fruit-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Fruit Name:</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={newFruit.name}
                  onChange={handleInputChange}
                  placeholder="e.g., Apple"
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="colour">Colour:</label>
                <input
                  type="text"
                  id="colour"
                  name="colour"
                  value={newFruit.colour}
                  onChange={handleInputChange}
                  placeholder="e.g., Red"
                  required
                />
              </div>
            </div>
            
            <button type="submit" disabled={loading} className="add-button">
              {loading ? 'Adding...' : 'Add Fruit'}
            </button>
          </form>
        </div>

        <div className="fruits-section">
          <h2>My Fruits</h2>
          {loading && fruits.length === 0 ? (
            <div className="loading">Loading fruits...</div>
          ) : fruits.length === 0 ? (
            <div className="no-fruits">No fruits added yet. Add your first fruit above!</div>
          ) : (
            <div className="fruits-grid">
              {fruits.map((fruit) => (
                <div key={fruit.id} className="fruit-card">
                  <h3>{fruit.name}</h3>
                  <p className="fruit-colour">Colour: {fruit.colour}</p>
                  <p className="fruit-date">
                    Added: {new Date(fruit.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;