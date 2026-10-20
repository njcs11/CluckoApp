import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import axios from 'axios';
import { 
  Camera, Database, Cpu, FlaskConical, Menu, X,
  LayoutDashboard, Users, CreditCard, Sliders, ShieldCheck, LogOut,
  Sun, Moon
} from 'lucide-react';
import './App.css';
import DetectPage from './pages/DetectPage';
import DiseasesPage from './pages/DiseasesPage';
import TrainPage from './pages/TrainPage';
import DatasetPage from './pages/DatasetPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminSubscriptionsPage from './pages/AdminSubscriptionsPage';
import AdminPricingPage from './pages/AdminPricingPage';
import AdminAuditLogsPage from './pages/AdminAuditLogsPage';
import AdminLoginPage from './pages/AdminLoginPage';
import { TrainProvider, useTrain } from './context/TrainContext';
import { DetectProvider, useDetect } from './context/DetectContext';
import { CluckoBrandBadge, PipelineActivityIcon, EyeModuleIcon, WingModuleIcon } from './components/icons';

// Configure Axios base URL for local development vs cloud production (Vercel -> Render)
const API_BASE = process.env.REACT_APP_API_URL || '';
if (API_BASE) {
  axios.defaults.baseURL = API_BASE.replace(/\/$/, '');
}
// Render free tier cold-starts can take 30-40s; allow 50s before aborting
axios.defaults.timeout = 50000;

// Configure Axios JWT injection for platform administration
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('clucko_admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-redirect on 401 unauthorized & Silent Retry for Render Cloud Cold Starts (502, 503, 504, timeout)
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    
    // Auto-redirect on 401 unauthorized
    if (error.response && error.response.status === 401 && window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login') {
      localStorage.removeItem('clucko_admin_token');
      localStorage.removeItem('clucko_admin_user');
      window.location.href = '/admin/login';
      return Promise.reject(error);
    }

    // Silent 1-time retry on cloud wake-up errors (502, 503, 504, ECONNABORTED, timeout)
    const status = error.response ? error.response.status : null;
    const isNetworkOrColdStart = !status || [502, 503, 504].includes(status) || error.code === 'ECONNABORTED';

    if (config && isNetworkOrColdStart && !config._retry) {
      config._retry = true;
      // Wait 2.5 seconds for container to finish booting
      await new Promise((res) => setTimeout(res, 2500));
      return axios(config);
    }

    return Promise.reject(error);
  }
);

function AdminProtectedRoute({ children }) {
  const token = localStorage.getItem('clucko_admin_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return children;
}

function AppLayout() {
  const { trainStatus, isAnyTrainingRunning } = useTrain();
  const { loading: isDetecting, result: detectResult } = useDetect();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('clucko_admin_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('clucko_admin_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  let adminUser = null;
  try {
    const raw = localStorage.getItem('clucko_admin_user');
    if (raw) adminUser = JSON.parse(raw);
  } catch (_) {}

  const handleAdminLogout = () => {
    localStorage.removeItem('clucko_admin_token');
    localStorage.removeItem('clucko_admin_user');
    toast.success('Signed out of Administrator Panel');
    navigate('/admin/login');
  };

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
          <div className="sidebar-section-title">AI Vision Suite</div>

          <NavLink
            to="/detect"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
            title="AI Vision Disease Detector — Real-Time Inference"
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
            title="Gamefowl Disease Knowledge Base & Diagnostic Library"
          >
            <FlaskConical size={17} className="nav-icon" />
            <span>Diseases</span>
          </NavLink>

          <NavLink
            to="/dataset"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
            title="Training Image Repository & Dataset Management"
          >
            <Database size={17} className="nav-icon" />
            <span>Dataset</span>
          </NavLink>

          <NavLink
            to="/train"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
            title="MobileNetV2 Deep Learning Training Pipeline"
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

          <div className="sidebar-section-title admin-divider">Control Center</div>

          <NavLink
            to="/admin"
            end
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
            title="Executive Analytics, Revenue Charts & Financial Intelligence"
          >
            <LayoutDashboard size={17} className="nav-icon" />
            <span>Overview & KPIs</span>
          </NavLink>

          <NavLink
            to="/admin/users"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
            title="User Accounts, Role Management & Admin Onboarding"
          >
            <Users size={17} className="nav-icon" />
            <span>User Accounts</span>
          </NavLink>

          <NavLink
            to="/admin/subscriptions"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
            title="Subscription Ledgers, Payment Transactions & Refund Processing"
          >
            <CreditCard size={17} className="nav-icon" />
            <span>Billing & Refunds</span>
          </NavLink>

          <NavLink
            to="/admin/pricing"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
            title="Plan Pricing Matrix & Quota Configuration"
          >
            <Sliders size={17} className="nav-icon" />
            <span>Pricing & Config</span>
          </NavLink>

          <NavLink
            to="/admin/audit-logs"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => setMobileMenuOpen(false)}
            title="Immutable Forensic Audit Trail & BIR-Compliant Security Logs"
          >
            <ShieldCheck size={17} className="nav-icon" />
            <span>Audit Trail</span>
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

        {adminUser && (
          <div 
            className="sidebar-admin-profile"
            title={`Active Session: ${adminUser.full_name || 'Admin'} (${adminUser.email}) — ${adminUser.is_superadmin ? 'SuperAdmin Full Root Authority' : 'Authorized Administrator'}`}
          >
            <div className="admin-avatar-small" title={adminUser.is_superadmin ? 'SuperAdmin Privileges Active' : 'Administrator'}>
              {adminUser.is_superadmin ? '⚡' : (adminUser.first_name?.[0] || 'A')}
            </div>
            <div className="admin-profile-info">
              <div className="admin-name-row">
                <span className="admin-profile-name" title={adminUser.full_name || adminUser.email}>
                  {adminUser.full_name || adminUser.email}
                </span>
                <span 
                  className={`admin-role-badge ${adminUser.is_superadmin ? 'superadmin' : 'admin'}`}
                  title={adminUser.is_superadmin ? 'SuperAdmin Root Authority' : 'Standard Administrator'}
                >
                  {adminUser.is_superadmin ? 'SUPER' : 'ADMIN'}
                </span>
              </div>
              <span className="admin-profile-email" title={adminUser.email}>
                {adminUser.email}
              </span>
            </div>
            <button
              className="admin-logout-btn"
              onClick={handleAdminLogout}
              title="Sign Out of Administrator Panel"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <div className="footer-system-status">
            <div className="status-label-group">
              <span className="status-indicator-dot online" />
              <span className="footer-status-label">Clucko AI Core</span>
            </div>
            <button 
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun size={13} className="theme-icon sun" />
              ) : (
                <Moon size={13} className="theme-icon moon" />
              )}
            </button>
          </div>
          <div className="footer-version-row">
            <span className="footer-badge">v2.1 MobileNetV2</span>
            <span className="footer-sub-text">Autonomous Suite</span>
          </div>
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
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="/detect" element={<DetectPage />} />
            <Route path="/diseases" element={<DiseasesPage />} />
            <Route path="/dataset" element={<DatasetPage />} />
            <Route path="/train" element={<TrainPage />} />
            
            {/* Admin Management Suite Routes */}
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/subscriptions" element={<AdminSubscriptionsPage />} />
            <Route path="/admin/pricing" element={<AdminPricingPage />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
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
        <DetectProvider>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/login" element={<AdminLoginPage />} />
            <Route path="/*" element={<AdminProtectedRoute><AppLayout /></AdminProtectedRoute>} />
          </Routes>
        </DetectProvider>
      </TrainProvider>
    </BrowserRouter>
  );
}
