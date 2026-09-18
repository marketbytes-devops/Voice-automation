import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { UserPage } from './pages/UserPage';
import { AdminPage } from './pages/AdminPage';

function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{
        style: {
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.1)',
          fontSize: '14px',
        },
        success: {
          style: {
            background: 'rgba(34, 197, 94, 0.9)',
            border: 'none',
          }
        },
        error: {
          style: {
            background: 'rgba(239, 68, 68, 0.9)',
            border: 'none',
          }
        }
      }} />
      <Routes>
        <Route path="/" element={<UserPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
