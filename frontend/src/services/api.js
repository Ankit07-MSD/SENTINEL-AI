import axios from "axios";

const API_HOST = window.location.hostname;

const api = axios.create({
  baseURL: `http://${API_HOST}:5000/api`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sentinel_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the token is invalid/expired, the backend returns 401 — instead of
// leaving every page silently blank (the confusing state hit repeatedly
// during testing), clear the stale session and send the user back to
// login automatically.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("sentinel_token");
      localStorage.removeItem("sentinel_user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
