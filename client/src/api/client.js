import axios from 'axios';
import { supabase } from '../lib/supabaseClient.js';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Auth is now a Supabase access token instead of a session cookie -- attach
// whatever the current Supabase session's token is to every request.
// supabase.auth.getSession() resolves instantly from its own in-memory
// cache (it only hits the network to refresh an expiring token), so this
// adds no real latency to normal requests.
api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || 'We couldn\'t connect right now. Please try again.';
    return Promise.reject(Object.assign(new Error(message), { status: err.response?.status, code: err.response?.data?.code }));
  }
);

export default api;
