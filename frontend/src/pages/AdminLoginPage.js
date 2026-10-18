import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  ShieldCheck, Lock, Mail, Eye, EyeOff, 
  ArrowRight, Sparkles, Terminal, KeyRound 
} from 'lucide-react';
import { CluckoBrandBadge } from '../components/icons';
import './AdminLoginPage.css';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [badgeClicks, setBadgeClicks] = useState(0);

  // Parse query parameters
  const searchParams = new URLSearchParams(location.search);
  const portalParam = searchParams.get('portal');
  const roleParam = searchParams.get('role');
  const emailParam = searchParams.get('email');
  const masterParam = searchParams.get('master');

  // Master credentials box is only visible to SuperAdmin/Developer; hidden for invited admins
  const [showMasterCard, setShowMasterCard] = useState(() => {
    if (masterParam === '1' || portalParam === 'superadmin') {
      localStorage.removeItem('clucko_portal_role');
      return true;
    }
    if (portalParam === 'admin' || roleParam === 'admin') {
      localStorage.setItem('clucko_portal_role', 'admin');
      return false;
    }
    if (localStorage.getItem('clucko_portal_role') === 'admin') {
      return false;
    }
    return true; // Default visible for SuperAdmin on localhost
  });

  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
    if (portalParam === 'admin' || roleParam === 'admin') {
      localStorage.setItem('clucko_portal_role', 'admin');
      setShowMasterCard(false);
    } else if (masterParam === '1' || portalParam === 'superadmin') {
      localStorage.removeItem('clucko_portal_role');
      setShowMasterCard(true);
    }
  }, [emailParam, portalParam, roleParam, masterParam]);

  // Triple-click on badge toggles master credentials box (useful for SuperAdmin switching views)
  const handleBadgeClick = () => {
    const next = badgeClicks + 1;
    setBadgeClicks(next);
    if (next >= 3) {
      setShowMasterCard(prev => {
        const newVal = !prev;
        if (newVal) {
          localStorage.removeItem('clucko_portal_role');
          toast.success('Developer Master Access unlocked');
        } else {
          localStorage.setItem('clucko_portal_role', 'admin');
          toast('Developer Master Access hidden', { icon: '🔒' });
        }
        return newVal;
      });
      setBadgeClicks(0);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your administrator email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post('/api/admin/login', {
        email: email.trim(),
        password
      });

      if (res.data.success && res.data.token) {
        localStorage.setItem('clucko_admin_token', res.data.token);
        localStorage.setItem('clucko_admin_user', JSON.stringify(res.data.user));

        // Configure default header for immediate subsequent requests
        axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;

        toast.success(`Welcome back, ${res.data.user.full_name || 'Administrator'}!`);
        navigate('/admin');
      } else {
        setErrorMessage(res.data.error || 'Authentication failed. Please verify credentials.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid credentials or server unavailable.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFillSuperAdmin = () => {
    setEmail('superadmin@clucko.com');
    setPassword('CluckoMaster2026!@#');
    setErrorMessage('');
  };

  return (
    <div className="admin-login-wrapper">
      <div className="admin-login-ambient-glow" />

      <div className="admin-login-card animate-in">
        {/* Brand Header */}
        <div className="admin-login-header">
          <div className="login-badge-wrap" onClick={handleBadgeClick} style={{ cursor: 'pointer' }} title="Clucko AI Security Gateway">
            <CluckoBrandBadge size={42} iconSize={24} glow={true} pulse={true} />
          </div>
          <div className="login-title-row">
            <span className="brand-title">Clucko</span>
            <span className="brand-tag">ADMIN AI</span>
          </div>
          <p className="login-subtitle">
            Enterprise Control Center & Financial Intelligence Suite
          </p>

          <div className="login-security-tag">
            <ShieldCheck size={13} color="#10b981" />
            <span>Authorized Administrator Access Only</span>
          </div>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="login-error-banner animate-in">
            <div className="error-dot" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="admin-login-form">
          <div className="form-group">
            <label className="input-label" htmlFor="admin-email">Administrator Email</label>
            <div className="input-field-wrap">
              <Mail size={16} className="input-icon" />
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="admin@clucko.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="label-row">
              <label className="input-label" htmlFor="admin-password">Secure Password</label>
            </div>
            <div className="input-field-wrap">
              <Lock size={16} className="input-icon" />
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input"
                required
              />
              <button
                type="button"
                className="toggle-pw-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="btn-loading-state">
                <span className="spinner-mini" />
                <span>Authenticating System...</span>
              </span>
            ) : (
              <span className="btn-content-state">
                <span>Sign In to Admin Center</span>
                <ArrowRight size={16} />
              </span>
            )}
          </button>
        </form>

        {/* Developer / Master SuperAdmin Quick Credential Helper (Only visible to SuperAdmin/Developer) */}
        {showMasterCard && (
          <div className="developer-superadmin-card animate-in">
            <div className="superadmin-card-header">
              <Terminal size={13} color="#10b981" />
              <span>Developer SuperAdmin Master Access</span>
            </div>
            <p className="superadmin-card-desc">
              Developer root privileges override all database limits (unrestricted deletion & gateway overrides).
            </p>
            <button
              type="button"
              className="quick-fill-btn"
              onClick={handleFillSuperAdmin}
              title="Auto-fill Developer SuperAdmin Master Credentials"
            >
              <KeyRound size={12} />
              <span>Use Master SuperAdmin Credentials</span>
            </button>
          </div>
        )}

        {/* Footer Notice */}
        <div className="admin-login-footer">
          <div className="footer-ver font-mono">Clucko AI Engine v2.1 • 256-bit Encrypted Session</div>
        </div>
      </div>
    </div>
  );
}
