// Base URL for our backend API.
// Opened from localhost (local testing) -> talk to the local backend.
// Anywhere else (the deployed site)     -> talk to the live Render API.
const API_BASE_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://localhost:5000/api'
  : 'https://bite-rush-api.onrender.com/api';
