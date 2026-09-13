import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Camera, Database, Cpu, FlaskConical, Loader2, Menu, X } from 'lucide-react';
import './App.css';
import DetectPage from './pages/DetectPage';
import DiseasesPage from './pages/DiseasesPage';
import TrainPage from './pages/TrainPage';
import DatasetPage from './pages/DatasetPage';
import { TrainProvider, useTrain } from './context/TrainContext';

function AppLayout() {
  const { trainStatus, isAnyTrainingRunning } = useTrain();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeModule = trainStatus.eye.status === 'running' ? 'eye' : (trainStatus.wing.status === 'running' ? 'wing' : null);
  const activeProgress = activeModule ? trainStatus[activeModule]?.progress || 0 : 0;
  const activeStage = activeModule ? trainStatus[activeModule]?.stage || 'Training' : '';

  return (
    <div className="app-shell">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#132013',
            color: '#e8f5e8',
            border: '1px solid #234023',
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)'
          }
        }}
      />

      {/* Mobile Header Bar */}
      <header className="mobile-header">
        <div className="mobile-brand">
          <span className="brand-icon">🐓</span>
          <span className="brand-name">Clucko</span>
        </div>
        <button 
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon">🐓</div>
          <div>
            <div className="brand-name">Clucko</div>
            <div className="brand-sub">Admin AI Workspace</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink 
            to="/" 
            end 
            className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Camera size={18} />
            <span>Detect</span>
          </NavLink>

          <NavLink 
            to="/diseases" 
            className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
          >
            <FlaskConical size={18} />
            <span>Diseases</span>
          </NavLink>

          <NavLink 
            to="/dataset" 
            className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Database size={18} />
            <span>Dataset</span>
          </NavLink>

          <NavLink 
            to="/train" 
            className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Cpu size={18} />
            <span>Train Model</span>
            {isAnyTrainingRunning && (
              <span className="nav-training-badge" title={`${activeModule?.toUpperCase()} Training in progress: ${activeProgress}%`}>
                <Loader2 size={11} className="spin" />
                <span>{activeProgress}%</span>
              </span>
            )}
          </NavLink>
        </nav>

        {isAnyTrainingRunning && (
          <div className="sidebar-active-training" onClick={() => { navigate('/train'); setMobileMenuOpen(false); }}>
            <div className="training-mini-header">
              <span className="pulse-dot" />
              <span className="training-mini-title">Background Training</span>
            </div>
            <div className="training-mini-sub">{activeModule?.toUpperCase()} • {activeStage}</div>
            <div className="training-mini-bar-bg">
              <div className="training-mini-bar-fill" style={{ width: `${activeProgress}%` }} />
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          <div className="footer-badge">v2.1 Pro AI</div>
          <div className="footer-text">Gamefowl Health Suite</div>
        </div>
      </aside>

      {/* Backdrop overlay for mobile menu */}
      {mobileMenuOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main Content Area */}
      <div className="content-wrapper">
        {/* Global Floating banner when training is running and user is on another page */}
        {isAnyTrainingRunning && location.pathname !== '/train' && (
          <div className="global-running-banner animate-in" onClick={() => navigate('/train')}>
            <div className="banner-left">
              <Loader2 size={16} className="spin banner-icon" />
              <div>
                <span className="banner-title">Model Training Active in Background ({activeProgress}%)</span>
                <span className="banner-desc">
                  {activeModule === 'eye' ? '👁️ Eye Module' : '🪶 Wing Module'}: {activeStage} — Your progress is protected while you browse.
                </span>
              </div>
            </div>
            <button className="banner-action-btn">Open Trainer →</button>
          </div>
        )}

        <main className="main-content">
          <Routes>
            <Route path="/" element={<DetectPage />} />
            <Route path="/diseases" element={<DiseasesPage />} />
            <Route path="/dataset" element={<DatasetPage />} />
            <Route path="/train" element={<TrainPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TrainProvider>
        <AppLayout />
      </TrainProvider>
    </BrowserRouter>
  );
}
