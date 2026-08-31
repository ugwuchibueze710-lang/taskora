import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Normalizes error messages so every screen can show one consistent, human string.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || 'We couldn\'t connect right now. Please try again.';
    return Promise.reject(Object.assign(new Error(message), { status: err.response?.status, code: err.response?.data?.code }));
  }
);

export default api;
