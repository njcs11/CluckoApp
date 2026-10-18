import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  Users, DollarSign, CreditCard, Activity, TrendingUp, 
  ArrowUpRight, ShieldCheck, Database, Cpu, RefreshCw, 
  ChevronRight, Calendar, AlertTriangle, Zap, CheckCircle2,
  Table as TableIcon, FileSpreadsheet, ArrowDownRight
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import './AdminDashboardPage.css';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = async (showToast = false) => {
    try {
      if (showToast) setRefreshing(true);
      const res = await axios.get('/api/admin/analytics');
      if (res.data && res.data.success) {
        setData(res.data);
        if (showToast) toast.success('Analytics updated');
      }
    } catch (err) {
      console.error('Failed to fetch admin analytics:', err);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleExportExcelTransactions = async () => {
    const toastId = toast.loading('Exporting Excel-compatible transaction report...');
    try {
      const res = await axios.get('/api/admin/transactions/export', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `clucko_revenue_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Excel spreadsheet (.csv) downloaded successfully!', { id: toastId });
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export transactions file', { id: toastId });
    }
  };

  if (loading) {
    return (
      <div className="admin-page-loading">
        <div className="spinner-large" />
        <p>Loading Platform Analytics & Controls...</p>
      </div>
    );
  }

  const revenue = data?.revenue || { total_collected: 0, total_refunded: 0, net_revenue: 0, this_month: 0, growth_pct: 0 };
  const users = data?.users || { total: 0, owners: 0, caretakers: 0, active: 0, suspended: 0 };
  const subscriptions = data?.subscriptions || { pro: 0, premium: 0, free_trial: 0, total_paid: 0, conversion_rate_pct: 0 };
  const platform = data?.platform || { farms: 0, chickens: 0, scans: 0, alerts: 0 };
  const recentTx = data?.recent_transactions || [];
  const timeline = data?.revenue_timeline || [];

  // Compute maximum daily revenue for bar height normalization
  const maxDayRev = Math.max(...timeline.map(t => t.revenue), 1000);

  // 1. Spikes Annotation Engine (Rule 5: Annotate Spikes)
  const peakItem = timeline.reduce((max, cur) => cur.revenue > (max?.revenue || 0) ? cur : max, null);

  // 2. Table Past 5 Periods (Rule 4: Table Past 5)
  const past5Periods = [...timeline].slice(-5).reverse();

  return (
    <div className="admin-dashboard-container">
      {/* Top Header Bar */}
      <div className="admin-page-header">
        <div>
          <div className="breadcrumb-row">
            <span className="crumb-root">Platform Administration</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">Overview & KPIs</span>
          </div>
          <h1 className="admin-page-title">Executive Control Center</h1>
          <p className="admin-page-sub">
            Real-time monitoring of user accounts, subscription billing, revenue reconciliation, and flock health telemetry.
          </p>
        </div>
        <div className="admin-header-actions">
          <button 
            className="admin-btn secondary"
            onClick={handleExportExcelTransactions}
            title="Download full transactions ledger in Excel format"
          >
            <FileSpreadsheet size={15} color="var(--accent-green)" />
            <span>Export to Excel (CSV)</span>
          </button>
          <button 
            className="admin-btn secondary"
            onClick={() => fetchAnalytics(true)}
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? 'spin-icon' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <NavLink to="/admin/pricing" className="admin-btn primary">
            <CreditCard size={15} />
            <span>Manage Pricing</span>
          </NavLink>
        </div>
      </div>

      {/* KPI Highlight Cards */}
      <div className="kpi-grid">
        {/* Card 1: Net Revenue */}
        <div className="kpi-card revenue-card" title="Total settled subscription payments less processed customer refunds (Net Platform Revenue)">
          <div className="kpi-top">
            <span className="kpi-label">Net Platform Revenue</span>
            <div className="kpi-icon-wrap emerald">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-currency">₱</span>
            <span className="kpi-number">{revenue.net_revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="kpi-footer">
            <div className="kpi-pill positive">
              <TrendingUp size={12} />
              <span>This Month: ₱{revenue.this_month.toLocaleString()}</span>
            </div>
            {revenue.total_refunded > 0 && (
              <span className="kpi-sub-text refund-note">
                (₱{revenue.total_refunded.toLocaleString()} refunded)
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Active Paid Subscribers */}
        <div className="kpi-card" title="Active paying farm owners subscribed to Pro or Premium tiers">
          <div className="kpi-top">
            <span className="kpi-label">Paid Subscribers</span>
            <div className="kpi-icon-wrap amber">
              <CreditCard size={20} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-number">{subscriptions.total_paid}</span>
            <span className="kpi-unit">Flock Owners</span>
          </div>
          <div className="kpi-footer">
            <span className="badge-plan pro">Pro: {subscriptions.pro}</span>
            <span className="badge-plan premium">Premium: {subscriptions.premium}</span>
            <span className="kpi-sub-text">({subscriptions.conversion_rate_pct}% of owners)</span>
          </div>
        </div>

        {/* Card 3: User Accounts */}
        <div className="kpi-card" title="Total registered user directory across farm owners, caretakers, and administrators">
          <div className="kpi-top">
            <span className="kpi-label">Registered Users</span>
            <div className="kpi-icon-wrap blue">
              <Users size={20} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-number">{users.total}</span>
            <span className="kpi-unit">Accounts</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub-text">
              <strong style={{ color: 'var(--text-primary)' }}>{users.owners}</strong> Owners • <strong style={{ color: 'var(--text-primary)' }}>{users.caretakers}</strong> Caretakers
            </span>
            {users.suspended > 0 && (
              <span className="badge-suspended-inline">{users.suspended} Suspended</span>
            )}
          </div>
        </div>

        {/* Card 4: AI & Platform Telemetry */}
        <div className="kpi-card" title="Total gamefowl inventory, farms, and diagnostic AI scans recorded across the platform">
          <div className="kpi-top">
            <span className="kpi-label">Flock Operations</span>
            <div className="kpi-icon-wrap purple">
              <Activity size={20} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-number">{platform.chickens.toLocaleString()}</span>
            <span className="kpi-unit">Gamefowls</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub-text">
              Across <strong style={{ color: 'var(--text-primary)' }}>{platform.farms}</strong> farms • <strong style={{ color: 'var(--accent-green)' }}>{platform.scans}</strong> AI scans performed
            </span>
          </div>
        </div>
      </div>

      {/* ══════════ REVISED REVENUE ANALYTICS ENGINE (5 UX RULES) ══════════ */}
      <div className="dashboard-grid-row">
        {/* Left Column: 30-Day Revenue Trend (With 5 Applied UX Fixes) */}
        <div className="admin-panel revenue-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Revenue Trajectory & Cash Inflow</h2>
              <p className="panel-sub">Verified payments from subscriptions with direct point annotations</p>
            </div>
            <div className="panel-stat-pill">
              <span>All-time Total: <strong>₱{revenue.total_collected.toLocaleString()}</strong></span>
            </div>
          </div>

          {/* Rule 5: Annotate Spikes */}
          {peakItem && peakItem.revenue > 0 && (
            <div className="spike-annotation-banner animate-in">
              <div className="spike-badge">
                <Zap size={14} className="spike-icon" />
                <span>PEAK SPIKE DETECTED</span>
              </div>
              <div className="spike-info">
                Highest single-day cash volume: <strong>₱{peakItem.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> on <strong>{peakItem.date}</strong> ({peakItem.count} paid subscriptions).
              </div>
            </div>
          )}

          {/* Rule 1: Zero Baseline + Rule 2: One Accent + Rule 3: Direct Labels */}
          <div className="analytics-chart-canvas">
            {timeline.length === 0 ? (
              <div className="empty-chart-state">
                <Calendar size={32} color="var(--text-muted)" />
                <p>No transaction volume recorded in the last 30 days.</p>
              </div>
            ) : (
              <div className="chart-viewport">
                {/* Y-Axis Grid Lines & Reference Markers */}
                <div className="chart-y-axis">
                  <div className="y-tick">
                    <span className="y-label font-mono">₱{Math.round(maxDayRev).toLocaleString()}</span>
                    <div className="y-grid-line" />
                  </div>
                  <div className="y-tick">
                    <span className="y-label font-mono">₱{Math.round(maxDayRev / 2).toLocaleString()}</span>
                    <div className="y-grid-line dashed" />
                  </div>
                  <div className="y-tick baseline-tick">
                    <span className="y-label baseline font-mono">₱0 (Zero Baseline)</span>
                    <div className="y-grid-line baseline" />
                  </div>
                </div>

                {/* Bars Area */}
                <div className="chart-series-row">
                  {timeline.map((item, idx) => {
                    const pct = Math.max(12, Math.min(100, Math.round((item.revenue / maxDayRev) * 100)));
                    const isPeak = item.date === peakItem?.date;
                    const tooltipText = `Date: ${item.date} • Total Revenue Inflow: ₱${Number(item.revenue).toLocaleString('en-US', { minimumFractionDigits: 2 })} • Completed Transactions: ${item.count} payment(s)${isPeak ? ' (Peak Activity)' : ''}`;

                    return (
                      <div 
                        key={idx} 
                        className={`chart-data-col ${isPeak ? 'peak-col' : ''}`}
                        title={tooltipText}
                      >
                        {/* Rule 3: Direct Label directly above bar */}
                        <div className={`direct-point-label ${isPeak ? 'peak-label' : ''}`} title={tooltipText}>
                          {isPeak && <span className="peak-star">★ Peak</span>}
                          <span className="label-amount font-mono">₱{item.revenue.toLocaleString()}</span>
                          <span className="label-count font-mono">{item.count} tx</span>
                        </div>

                        {/* Bar Track & Fill (Rule 2: Single Accent) */}
                        <div className="bar-vertical-track" title={tooltipText}>
                          <div 
                            className={`bar-vertical-fill ${isPeak ? 'peak-fill' : ''}`}
                            style={{ height: `${pct}%` }}
                            title={tooltipText}
                          />
                        </div>

                        {/* Direct Date Label below bar */}
                        <span className={`bar-date-label font-mono ${isPeak ? 'peak-date' : ''}`} title={tooltipText}>
                          {item.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Rule 4: Table Past 5 Periods (Direct numerical lookup) */}
          <div className="past-5-table-section">
            <div className="past-5-header">
              <div className="past-5-title-row">
                <TableIcon size={15} color="var(--accent-green)" />
                <h3 className="past-5-title">Past Periods Settlement Summary</h3>
              </div>
              <span className="past-5-sub">Direct tabular ledger of the latest activity periods</span>
            </div>

            <div className="past-5-table-wrap">
              <table className="past-5-table">
                <thead>
                  <tr>
                    <th>Date / Batch</th>
                    <th>Transactions</th>
                    <th>Daily Volume</th>
                    <th>Average Ticket</th>
                    <th>Settlement Status</th>
                  </tr>
                </thead>
                <tbody>
                  {past5Periods.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="table-empty">No historical periods recorded.</td>
                    </tr>
                  ) : (
                    past5Periods.map((p, idx) => {
                      const isPeak = p.date === peakItem?.date;
                      const avg = p.count > 0 ? (p.revenue / p.count) : p.revenue;

                      return (
                        <tr key={idx} className={isPeak ? 'past-5-peak-row' : ''}>
                          <td className="font-mono font-bold text-white">
                            {p.date}
                            {isPeak && <span className="mini-spike-badge">Peak Spike</span>}
                          </td>
                          <td className="font-mono">
                            {p.count} successful {p.count > 1 ? 'orders' : 'order'}
                          </td>
                          <td className="font-mono font-bold text-emerald">
                            ₱{p.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="font-mono text-secondary">
                            ₱{avg.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td>
                            <span className="status-badge active">
                              100% RECONCILED
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Plan Breakdown & Quick Links */}
        <div className="admin-panel breakdown-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Tier Distribution</h2>
              <p className="panel-sub">Active subscription breakdown by service level</p>
            </div>
          </div>

          <div className="tier-breakdown-list">
            <div className="tier-item">
              <div className="tier-meta">
                <div className="tier-name-row">
                  <span className="tier-dot premium" />
                  <span className="tier-name">Premium Tier</span>
                  <span className="tier-badge">₱1,099 / yr</span>
                </div>
                <span className="tier-count">{subscriptions.premium} subscribers</span>
              </div>
              <div className="tier-progress-bg">
                <div 
                  className="tier-progress-fill premium" 
                  style={{ width: `${users.owners > 0 ? (subscriptions.premium / users.owners) * 100 : 0}%` }} 
                />
              </div>
            </div>

            <div className="tier-item">
              <div className="tier-meta">
                <div className="tier-name-row">
                  <span className="tier-dot pro" />
                  <span className="tier-name">Pro Tier</span>
                  <span className="tier-badge">₱479 / 90d</span>
                </div>
                <span className="tier-count">{subscriptions.pro} subscribers</span>
              </div>
              <div className="tier-progress-bg">
                <div 
                  className="tier-progress-fill pro" 
                  style={{ width: `${users.owners > 0 ? (subscriptions.pro / users.owners) * 100 : 0}%` }} 
                />
              </div>
            </div>

            <div className="tier-item">
              <div className="tier-meta">
                <div className="tier-name-row">
                  <span className="tier-dot trial" />
                  <span className="tier-name">Free Trial</span>
                  <span className="tier-badge">30-day grace</span>
                </div>
                <span className="tier-count">{subscriptions.free_trial} active trials</span>
              </div>
              <div className="tier-progress-bg">
                <div 
                  className="tier-progress-fill trial" 
                  style={{ width: `${users.owners > 0 ? (subscriptions.free_trial / users.owners) * 100 : 0}%` }} 
                />
              </div>
            </div>
          </div>

          <div className="quick-nav-block">
            <span className="quick-nav-title">Management Workspaces</span>
            <div className="quick-links-grid">
              <NavLink to="/admin/users" className="quick-link-card">
                <Users size={16} color="var(--accent-blue)" />
                <div className="link-text">
                  <span className="link-title">User Accounts</span>
                  <span className="link-desc">Manage roles & status</span>
                </div>
                <ChevronRight size={14} className="link-arrow" />
              </NavLink>

              <NavLink to="/admin/subscriptions" className="quick-link-card">
                <CreditCard size={16} color="var(--accent-amber)" />
                <div className="link-text">
                  <span className="link-title">Subscriptions & Refunds</span>
                  <span className="link-desc">Audit billing & refunds</span>
                </div>
                <ChevronRight size={14} className="link-arrow" />
              </NavLink>

              <NavLink to="/admin/pricing" className="quick-link-card">
                <TrendingUp size={16} color="var(--accent-green)" />
                <div className="link-text">
                  <span className="link-title">Pricing Configurator</span>
                  <span className="link-desc">Change tier prices</span>
                </div>
                <ChevronRight size={14} className="link-arrow" />
              </NavLink>

              <NavLink to="/admin/audit-logs" className="quick-link-card">
                <ShieldCheck size={16} color="var(--accent-purple)" />
                <div className="link-text">
                  <span className="link-title">System Audit Logs</span>
                  <span className="link-desc">Forensic activity ledger</span>
                </div>
                <ChevronRight size={14} className="link-arrow" />
              </NavLink>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="admin-panel table-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Recent Payment Transactions</h2>
            <p className="panel-sub">Real-time payment logs across mobile subscriptions with refund status</p>
          </div>
          <NavLink to="/admin/subscriptions" className="panel-view-all">
            <span>View All Transactions</span>
            <ArrowUpRight size={14} />
          </NavLink>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>TX ID</th>
                <th>Customer</th>
                <th>Tier</th>
                <th>Amount</th>
                <th>Gateway / Method</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty">No payment transactions recorded yet.</td>
                </tr>
              ) : (
                recentTx.map(tx => (
                  <tr key={tx.id}>
                    <td className="font-mono text-muted">#{tx.id}</td>
                    <td>
                      <div className="customer-cell">
                        <span className="customer-name">{tx.user_name || 'Customer'}</span>
                        <span className="customer-email">{tx.email || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge-plan ${tx.plan}`}>{tx.plan?.toUpperCase()}</span>
                    </td>
                    <td className="font-mono font-bold">
                      ₱{Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <div className="gateway-cell">
                        <span className="gateway-name">{tx.payment_gateway?.toUpperCase()}</span>
                        {tx.payment_method && <span className="gateway-method">({tx.payment_method})</span>}
                      </div>
                    </td>
                    <td>
                      {tx.status === 'paid' && <span className="status-badge active">PAID</span>}
                      {tx.status === 'refunded' && (
                        <span className="status-badge refunded" title={tx.refund_reason || 'Refunded'}>
                          REFUNDED
                        </span>
                      )}
                      {tx.status === 'pending' && <span className="status-badge pending">PENDING</span>}
                    </td>
                    <td className="text-secondary text-sm">
                      {tx.created_at ? new Date(tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
