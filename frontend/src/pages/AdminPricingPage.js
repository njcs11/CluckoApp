import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  CreditCard, Edit3, Check, X, Bell, Plus, Trash2, 
  RefreshCw, DollarSign, Send, ShieldAlert, Sparkles, 
  Smartphone, Award, CheckCircle2, ChevronRight
} from 'lucide-react';
import './AdminPricingPage.css';

export default function AdminPricingPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);

  // Broadcast Announcement State
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState('info');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Feature editing state in modal
  const [newFeatureText, setNewFeatureText] = useState('');

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/plans');
      if (res.data && res.data.success) {
        setPlans(res.data.plans || []);
      }
    } catch (err) {
      console.error('Failed to load plans:', err);
      toast.error('Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleStartEdit = (p) => {
    setEditingPlan({
      ...p,
      features: Array.isArray(p.features) ? [...p.features] : [],
      notify_users: true // default checked to keep users informed
    });
    setNewFeatureText('');
  };

  const handleAddFeature = () => {
    if (!newFeatureText.trim()) return;
    setEditingPlan(prev => ({
      ...prev,
      features: [...prev.features, newFeatureText.trim()]
    }));
    setNewFeatureText('');
  };

  const handleRemoveFeature = (index) => {
    setEditingPlan(prev => ({
      ...prev,
      features: prev.features.filter((_, idx) => idx !== index)
    }));
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    if (!editingPlan) return;
    setSaving(true);
    try {
      const res = await axios.put(`/api/admin/plans/${editingPlan.plan_key}`, editingPlan);
      if (res.data.success) {
        toast.success(res.data.message);
        setEditingPlan(null);
        fetchPlans();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save plan configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleSendCustomBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      toast.error('Title and message are required');
      return;
    }
    setSendingBroadcast(true);
    try {
      const res = await axios.post('/api/admin/broadcast-notification', {
        title: broadcastTitle,
        message: broadcastMessage,
        type: broadcastType
      });
      if (res.data.success) {
        toast.success('Broadcast notification dispatched to all flock farms!');
        setBroadcastTitle('');
        setBroadcastMessage('');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to dispatch broadcast');
    } finally {
      setSendingBroadcast(false);
    }
  };

  return (
    <div className="admin-pricing-container">
      {/* Top Header */}
      <div className="admin-page-header">
        <div>
          <div className="breadcrumb-row">
            <span className="crumb-root">Platform Administration</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">Pricing & Plans Configurator</span>
          </div>
          <h1 className="admin-page-title">Subscription Pricing & Feature Flags</h1>
          <p className="admin-page-sub">
            Configure subscription tiers, alter pricing rates in PHP, manage farm quotas, and automatically broadcast update notices to Clucko App users.
          </p>
        </div>
        <div className="admin-header-actions">
          <button className="admin-btn secondary" onClick={fetchPlans} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin-icon' : ''} />
            <span>Refresh Pricing</span>
          </button>
        </div>
      </div>

      {/* Plans Cards Grid */}
      <div className="plans-cards-grid">
        {loading ? (
          <div className="plans-loading">
            <div className="spinner-large" />
            <span>Loading tier configurations...</span>
          </div>
        ) : (
          plans.map(p => {
            const isPro = p.plan_key === 'pro';
            const isPremium = p.plan_key === 'premium';
            const isFree = p.plan_key === 'free' || p.plan_key === 'free_trial';

            return (
              <div key={p.plan_key} className={`pricing-plan-card ${isPremium ? 'premium-highlight' : isPro ? 'pro-highlight' : ''}`}>
                <div className="card-top-header">
                  <div>
                    {p.badge && <span className="tier-pill-badge">{p.badge}</span>}
                    <h3 className="plan-name-heading">{p.name}</h3>
                    <span className="plan-key-tag">Internal Key: {p.plan_key}</span>
                  </div>
                  <button 
                    className="edit-plan-btn" 
                    title="Alter Pricing & Quotas"
                    onClick={() => handleStartEdit(p)}
                  >
                    <Edit3 size={15} />
                    <span>Configure</span>
                  </button>
                </div>

                {/* Price Display */}
                <div className="plan-price-display">
                  <span className="price-currency">₱</span>
                  <span className="price-digits">{Number(p.price).toLocaleString()}</span>
                  <span className="price-term">
                    {p.duration_days > 0 ? ` / ${p.duration_days} days` : ' (Forever free)'}
                  </span>
                </div>

                {/* Limits Matrix */}
                <div className="limits-matrix-box">
                  <div className="limit-row">
                    <span className="limit-label">Max Farms</span>
                    <span className="limit-val">{p.max_farms >= 999999 ? 'Unlimited' : p.max_farms}</span>
                  </div>
                  <div className="limit-row">
                    <span className="limit-label">Chickens / Farm</span>
                    <span className="limit-val">{p.max_chickens_per_farm >= 999999 ? 'Unlimited' : p.max_chickens_per_farm}</span>
                  </div>
                  <div className="limit-row">
                    <span className="limit-label">AI Disease Scans</span>
                    <span className="limit-val">{p.max_captures >= 999999 ? 'Unlimited' : p.max_captures}</span>
                  </div>
                </div>

                {/* Features List */}
                <div className="features-checklist">
                  <span className="features-checklist-title">Included Perks:</span>
                  <ul>
                    {p.features?.map((f, idx) => (
                      <li key={idx}>
                        <Check size={14} className="feature-check-icon" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card-sync-notice">
                  <Smartphone size={14} color="var(--accent-green)" />
                  <span>Syncs live to Clucko Mobile App</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Broadcast Announcement to Flock Community Section */}
      <div className="admin-panel broadcast-panel">
        <div className="panel-header">
          <div className="broadcast-header-title-row">
            <div className="broadcast-icon-wrap">
              <Bell size={20} color="var(--accent-green)" />
            </div>
            <div>
              <h2 className="panel-title">Broadcast Notice to All Users</h2>
              <p className="panel-sub">
                Dispatches a high-priority system notification directly into the Clucko Mobile App notification center for every farm owner and caretaker.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSendCustomBroadcast} className="broadcast-form">
          <div className="broadcast-grid">
            <div className="form-field">
              <label>Notice Headline / Title:</label>
              <input 
                type="text" 
                required
                placeholder="e.g. Notice: Seasonal Pricing Promotion or Maintenance Advisory..."
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Notice Classification:</label>
              <select 
                value={broadcastType} 
                onChange={(e) => setBroadcastType(e.target.value)}
                className="filter-select"
              >
                <option value="info">Information / General Announcement</option>
                <option value="warning">Important Alert / Advisory</option>
                <option value="system">System Maintenance Update</option>
              </select>
            </div>

            <div className="form-field full-col">
              <label>Broadcast Message Body:</label>
              <textarea 
                rows={3} 
                required
                className="admin-textarea"
                placeholder="Compose the full notice text delivered to all flock member accounts..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
              />
            </div>
          </div>

          <div className="broadcast-submit-row">
            <button 
              type="submit" 
              className="admin-btn primary"
              disabled={sendingBroadcast}
            >
              <Send size={15} />
              <span>{sendingBroadcast ? 'Dispatching Notice...' : 'Send Broadcast Notification'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ─── EDIT PLAN MODAL ──────────────────────────────────────────────── */}
      {editingPlan && (
        <div className="admin-modal-backdrop" onClick={() => !saving && setEditingPlan(null)}>
          <div className="admin-modal-card plan-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-pill-tag">Tier Configurator</span>
                <h2 className="modal-title">Configure {editingPlan.name}</h2>
              </div>
              <button className="modal-close-btn" onClick={() => !saving && setEditingPlan(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePlan}>
              <div className="plan-edit-form-grid">
                <div className="form-field">
                  <label>Display Name:</label>
                  <input 
                    type="text" 
                    required
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                  />
                </div>

                <div className="form-field">
                  <label>Price in Philippine Pesos (₱):</label>
                  <div className="input-with-symbol">
                    <span className="symbol">₱</span>
                    <input 
                      type="number" 
                      required
                      min={0}
                      step="any"
                      value={editingPlan.price}
                      onChange={(e) => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label>Validity Duration (Days):</label>
                  <input 
                    type="number" 
                    required
                    min={0}
                    value={editingPlan.duration_days}
                    onChange={(e) => setEditingPlan({ ...editingPlan, duration_days: Number(e.target.value) })}
                  />
                </div>

                <div className="form-field">
                  <label>Badge Label (Optional):</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Popular, Best Value, Starter..."
                    value={editingPlan.badge || ''}
                    onChange={(e) => setEditingPlan({ ...editingPlan, badge: e.target.value })}
                  />
                </div>

                <div className="form-field">
                  <label>Max Farms Allowed:</label>
                  <input 
                    type="number" 
                    min={1}
                    value={editingPlan.max_farms}
                    onChange={(e) => setEditingPlan({ ...editingPlan, max_farms: Number(e.target.value) })}
                  />
                  <span className="field-hint">Enter 999999 for Unlimited</span>
                </div>

                <div className="form-field">
                  <label>Max Chickens / Farm:</label>
                  <input 
                    type="number" 
                    min={1}
                    value={editingPlan.max_chickens_per_farm}
                    onChange={(e) => setEditingPlan({ ...editingPlan, max_chickens_per_farm: Number(e.target.value) })}
                  />
                  <span className="field-hint">Enter 999999 for Unlimited</span>
                </div>

                <div className="form-field full-col">
                  <label>Max AI Disease Scans:</label>
                  <input 
                    type="number" 
                    min={0}
                    value={editingPlan.max_captures}
                    onChange={(e) => setEditingPlan({ ...editingPlan, max_captures: Number(e.target.value) })}
                  />
                  <span className="field-hint">Enter 999999 for Unlimited</span>
                </div>

                {/* Features Editor */}
                <div className="form-field full-col features-editor-field">
                  <label>Plan Perks & Bullet Points:</label>
                  <div className="feature-add-row">
                    <input 
                      type="text" 
                      placeholder="e.g. Unlimited AI disease captures, 7-day grace period..."
                      value={newFeatureText}
                      onChange={(e) => setNewFeatureText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFeature(); } }}
                    />
                    <button type="button" className="add-feature-btn" onClick={handleAddFeature}>
                      <Plus size={15} />
                      <span>Add</span>
                    </button>
                  </div>

                  <div className="features-tags-list">
                    {editingPlan.features?.map((f, idx) => (
                      <div key={idx} className="feature-tag-item">
                        <span>{f}</span>
                        <button type="button" onClick={() => handleRemoveFeature(idx)}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Auto Broadcast Notice Toggle */}
                <div className="form-field full-col broadcast-notice-toggle-box">
                  <label className="checkbox-label">
                    <input 
                      type="checkbox"
                      checked={editingPlan.notify_users}
                      onChange={(e) => setEditingPlan({ ...editingPlan, notify_users: e.target.checked })}
                    />
                    <span>Automatically broadcast Notice of Pricing Update to all users</span>
                  </label>
                  <p className="toggle-sub">
                    If checked, the system dispatches an official announcement notice to all active farm owners in the Clucko Mobile App informing them of the revised price rate.
                  </p>
                </div>
              </div>

              <div className="modal-actions-row">
                <button 
                  type="button" 
                  className="admin-btn secondary" 
                  disabled={saving}
                  onClick={() => setEditingPlan(null)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="admin-btn primary"
                  disabled={saving}
                >
                  {saving ? 'Saving & Syncing...' : `Save & Apply Live (₱${Number(editingPlan.price).toLocaleString()})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
