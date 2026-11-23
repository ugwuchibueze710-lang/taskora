import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { LocationProvider } from './context/LocationContext.jsx';
import { CallProvider } from './context/CallContext.jsx';
import CallOverlays from './components/CallOverlays.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LocationProvider>
          <CallProvider>
            <App />
            <CallOverlays />
          </CallProvider>
        </LocationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
