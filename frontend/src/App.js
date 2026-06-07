import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Camera, Database, Cpu, FlaskConical } from 'lucide-react';
import './App.css';
import DetectPage from './pages/DetectPage';
import DiseasesPage from './pages/DiseasesPage';
import TrainPage from './pages/TrainPage';
import DatasetPage from './pages/DatasetPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1c2e1c',
              color: '#e8f5e8',
              border: '1px solid #2a402a',
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px'
            }
          }}
        />
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="brand-icon">🐓</div>
            <div>
              <div className="brand-name">Clucko</div>
              <div className="brand-sub">GamefowlDisease Detector</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <NavLink to="/" end className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <Camera size={18} />
              <span>Detect</span>
            </NavLink>
            <NavLink to="/diseases" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <FlaskConical size={18} />
              <span>Diseases</span>
            </NavLink>
            <NavLink to="/dataset" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <Database size={18} />
              <span>Dataset</span>
            </NavLink>
            <NavLink to="/train" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <Cpu size={18} />
              <span>Train Model</span>
            </NavLink>
          </nav>

          <div className="sidebar-footer">
            <div className="footer-badge">Davao City</div>
            <div className="footer-text">Gamefowl Health AI</div>
          </div>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<DetectPage />} />
            <Route path="/diseases" element={<DiseasesPage />} />
            <Route path="/dataset" element={<DatasetPage />} />
            <Route path="/train" element={<TrainPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
