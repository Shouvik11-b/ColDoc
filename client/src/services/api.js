// src/services/api.js
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API calls
export const authAPI = {
  register: async (userData) => {
    const response = await api.post('/register', userData);
    return response.data;
  },
  
  login: async (credentials) => {
    const response = await api.post('/login', credentials);
    return response.data;
  },
  
  getCurrentUser: async () => {
    const response = await api.get('/me');
    return response.data;
  }
};

// Fruit API calls
export const fruitAPI = {
  getFruits: async () => {
    const response = await api.get('/fruit');
    return response.data;
  },
  
  createFruit: async (fruitData) => {
    const response = await api.post('/fruit', fruitData);
    return response.data;
  }
};

export const roomAPI = {
  getRooms: async () => {
    const res = await api.get('/room');
    return res.data;
  },
  
  createRoom: async (roomData) => {
    const res = await api.post('/room', roomData);
    return res.data;
  },

  addToRoom: async (roomId) => {
    console.log(roomId);
    const res = await api.post('/addToRoom', { id: roomId });
    return res.data;
  }
};

export default api;