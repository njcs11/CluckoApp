import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Camera, Database, Cpu, FlaskConical, Menu, X, ShieldCheck } from 'lucide-react';
import './App.css';
import DetectPage from './pages/DetectPage';
import DiseasesPage from './pages/DiseasesPage';
import TrainPage from './pages/TrainPage';
import DatasetPage from './pages/DatasetPage';
import { TrainProvider, useTrain } from './context/TrainContext';
import { DetectProvider, useDetect } from './context/DetectContext';
import { CluckoBrandBadge, PipelineActivityIcon, EyeModuleIcon, WingModuleIcon } from './components/icons';

function AppLayout() {
  const { trainStatus, isAnyTrainingRunning } = useTrain();
  const { loading: isDetecting, result: detectResult } = useDetect();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);

  const activeModule = trainStatus.eye.status === 'running' ? 'eye' : (trainStatus.wing.status === 'running' ? 'wing' : null);
  const activeProgress = activeModule ? trainStatus[activeModule]?.progress || 0 : 0;
  const activeStage = activeModule ? trainStatus[activeModule]?.stage || 'Training' : '';

  return (
    <div className="app-shell">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a1d23',
            color: '#f3f4f6',
            border: '1px solid #323640',
            fontFamily: 'var(--font-sans)',
            fontSize: '13.5px',
            borderRadius: '10px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.65)'
          }
        }}
      />

      {/* Mobile Header Bar */}
      <header className="mobile-header">
        <div className="mobile-brand">
          <CluckoBrandBadge size={30} iconSize={18} glow={false} />
          <span className="brand-name">Clucko</span>
          <span className="brand-sub-badge">AI</span>
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
          <CluckoBrandBadge size={38} iconSize={22} glow={true} pulse={isAnyTrainingRunning || isDetecting} />
          <div className="brand-text-wrap">
            <div className="brand-name-row">
              <span className="brand-name">Clucko</span>
              <span className="brand-workspace-pill">PRO AI</span>
            </div>
            <div className="brand-sub">Admin AI Workspace</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Camera size={17} className="nav-icon" />
            <span>Detect</span>
            {isDetecting && (
              <span className="nav-training-badge" title="Analyzing image in background...">
                <PipelineActivityIcon size={12} active={true} color="#22c55e" />
                <span>AI</span>
              </span>
            )}
          </NavLink>

          <NavLink
            to="/diseases"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
          >
            <FlaskConical size={17} className="nav-icon" />
            <span>Diseases</span>
          </NavLink>

          <NavLink
            to="/dataset"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Database size={17} className="nav-icon" />
            <span>Dataset</span>
          </NavLink>

          <NavLink
            to="/train"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Cpu size={17} className="nav-icon" />
            <span>Train Model</span>
            {isAnyTrainingRunning && (
              <span className="nav-training-badge" title={`${activeModule?.toUpperCase()} Training in progress: ${activeProgress}%`}>
                <PipelineActivityIcon size={13} active={true} color="#22c55e" />
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
          <div className="footer-system-status">
            <span className="status-indicator-dot online" />
            <span className="footer-status-label">Clucko AI Core</span>
          </div>
          <div className="footer-version-row">
            <span className="footer-badge">v2.1 MobileNetV2</span>
            <span className="footer-sub-text">Autonomous Suite</span>
          </div>

          <button
            type="button"
            className="sidebar-legal-btn"
            onClick={() => setShowLegalModal(true)}
            style={{
              marginTop: 10,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: 'transparent',
              border: '1px solid #323640',
              borderRadius: 6,
              padding: '6px 8px',
              color: '#9ca3af',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <ShieldCheck size={13} color="#22c55e" />
            <span>Legal &amp; Privacy (RA 10173)</span>
          </button>
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
              <PipelineActivityIcon size={20} active={true} color="#22c55e" />
              <div>
                <span className="banner-title">Model Training Active in Background ({activeProgress}%)</span>
                <span className="banner-desc">
                  {activeModule === 'eye' ? <EyeModuleIcon size={13} style={{ marginRight: 5 }} /> : <WingModuleIcon size={13} style={{ marginRight: 5 }} />}
                  {activeModule === 'eye' ? 'Eye Module' : 'Wing Module'}: {activeStage} — Your training runs protected while you work.
                </span>
              </div>
            </div>
            <button className="banner-action-btn">Open Pipeline →</button>
          </div>
        )}

        {/* Global Floating banner when disease analysis is running and user is on another page */}
        {isDetecting && location.pathname !== '/' && (
          <div className="global-running-banner animate-in" onClick={() => navigate('/')}>
            <div className="banner-left">
              <PipelineActivityIcon size={20} active={true} color="#22c55e" />
              <div>
                <span className="banner-title">Disease Neural Analysis Active</span>
                <span className="banner-desc">Evaluating sample via MobileNetV2... Your diagnosis is protected.</span>
              </div>
            </div>
            <button className="banner-action-btn">View Diagnosis →</button>
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

      {showLegalModal && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setShowLegalModal(false)}
        >
          <div
            className="card legal-modal-box"
            style={{
              maxWidth: 580,
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: '#181b21',
              border: '1px solid #323640',
              borderRadius: 14,
              padding: 24,
              color: '#e5e7eb',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={22} color="#22c55e" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Legal &amp; Data Privacy Disclosures</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowLegalModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#9ca3af' }}>
              <p style={{ marginBottom: 12 }}>
                <strong style={{ color: '#fff' }}>Philippine Data Privacy Act of 2012 (RA 10173):</strong> Clucko complies with statutory privacy requirements governing the collection and processing of agricultural, user, and imagery data.
              </p>

              <div style={{ background: '#20242c', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                <div><strong>Business Entity:</strong> Clucko AI Operations</div>
                <div><strong>Jurisdiction:</strong> Davao City, Philippines</div>
                <div><strong>Data Protection Officer (DPO):</strong> jasphertadlan@gmail.com</div>
                <div><strong>Minimum Age:</strong> 18 years old</div>
              </div>

              <p style={{ marginBottom: 12 }}>
                <strong style={{ color: '#fbbf24' }}>Veterinary Medical Disclaimer (RA 9286):</strong> Clucko AI models provide automated computer-vision estimations for poultry health monitoring and research purposes only. The platform does not provide licensed veterinary diagnoses or medical prescriptions. Consult a licensed avian veterinarian for clinical diagnosis.
              </p>

              <p style={{ marginBottom: 16 }}>
                <strong style={{ color: '#fff' }}>Data Subject Rights:</strong> You have the right to access, rectify, or request erasure of your data under RA 10173 §16. Account deletion can be performed in the mobile app or by writing to the DPO email above.
              </p>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px 0' }}
                onClick={() => setShowLegalModal(false)}
              >
                Acknowledge &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TrainProvider>
        <DetectProvider>
          <AppLayout />
        </DetectProvider>
      </TrainProvider>
    </BrowserRouter>
  );
}
