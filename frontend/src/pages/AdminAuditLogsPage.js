import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  ShieldCheck, Search, Filter, Download, RefreshCw, 
  ChevronLeft, ChevronRight, X, Clock, User, 
  FileText, ArrowRight, Eye, FileSpreadsheet
} from 'lucide-react';
import { SkeletonTableRows } from '../components/SkeletonLoader';
import './AdminAuditLogsPage.css';

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit, setLimit] = useState(20);
  const [actionFilter, setActionFilter] = useState('all');
  const [targetFilter, setTargetFilter] = useState('all');
  const [operatorFilter, setOperatorFilter] = useState('all');
  const [operatorsList, setOperatorsList] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/audit-logs', {
        params: {
          page,
          limit,
          action: actionFilter,
          target_type: targetFilter,
          operator: operatorFilter,
          search
        }
      });
      if (res.data && res.data.success) {
        setLogs(res.data.logs || []);
        if (res.data.operators) {
          setOperatorsList(res.data.operators);
        }
        setTotal(res.data.total || 0);
        setPages(res.data.pages || 1);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, limit, actionFilter, targetFilter, operatorFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchLogs();
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Export Forensic Audit Trail to Excel CSV
  const handleExportExcelAudit = async () => {
    const toastId = toast.loading('Exporting Excel-compatible security audit trail...');
    try {
      const res = await axios.get('/api/admin/audit-logs/export', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `clucko_audit_trail_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Excel spreadsheet (.csv) downloaded successfully!', { id: toastId });
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export audit trail', { id: toastId });
    }
  };

  // Helper: Format DateTime to Philippine Standard Time (PHT, UTC+8) with seconds precision
  const formatPhtDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const s = String(dateStr).trim();
      const hasTz = s.endsWith('Z') || s.includes('+') || (s.includes('-') && s.lastIndexOf('-') > 10);
      const parseStr = hasTz ? s : `${s.replace(' ', 'T')}Z`;
      const d = new Date(parseStr);
      return isNaN(d.getTime()) ? s : d.toLocaleString('en-US', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return dateStr;
    }
  };

  const getActionBadgeClass = (action) => {
    const act = (action || '').toLowerCase();
    // 1. Approvals & Adjustments -> GREEN
    if (act.includes('refund_approved') || act.includes('approved')) return 'action-badge green';
    if (act.includes('pricing') || act.includes('adjusted')) return 'action-badge green';
    
    // 2. Rejections & Declines -> RED
    if (act.includes('refund_rejected') || act.includes('rejected') || act.includes('declined')) return 'action-badge red';
    
    // 3. Deletions, Cancellations, Deactivations -> AMBER / ORANGE
    if (act.includes('deactivate') || act.includes('suspend') || act.includes('deleted') || act.includes('cancelled')) return 'action-badge amber';
    if (act.includes('refund')) return 'action-badge amber';
    
    // 4. Payment Gateway Verification -> CYAN
    if (act.includes('payment_verified') || act.includes('paymongo') || act.includes('transaction')) return 'action-badge cyan';
    
    // 5. User Creation & Password Actions -> BLUE
    if (act.includes('activate') || act.includes('password') || act.includes('created')) return 'action-badge blue';
    
    // 6. SuperAdmin authentication & Root operations -> PURPLE
    return 'action-badge purple';
  };

  return (
    <div className="admin-audit-container">
      {/* Top Header */}
      <div className="admin-page-header">
        <div>
          <div className="breadcrumb-row">
            <span className="crumb-root">Platform Administration</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">Audit Trail</span>
          </div>
          <h1 className="admin-page-title">Audit Logs &amp; Activity History</h1>
          <p className="admin-page-sub">
            History of administrative actions, account updates, pricing adjustments, and refund operations.
          </p>
        </div>
        <div className="admin-header-actions">
          <button 
            type="button"
            onClick={handleExportExcelAudit} 
            className="admin-btn secondary"
            title="Download audit logs in Excel format"
          >
            <FileSpreadsheet size={15} />
            <span>Export to Excel (CSV)</span>
          </button>
          <button className="admin-btn secondary" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input 
            type="text"
            className="search-input"
            placeholder="Search description, operator..."
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear-btn" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filters-group">
          <div className="filter-select-wrap">
            <label className="filter-label">Action:</label>
            <select 
              value={actionFilter} 
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="filter-select"
            >
              <option value="all">All Actions</option>
              <option value="plan_pricing_updated">Price Updated</option>
              <option value="subscription_refunded">Refund Processed</option>
              <option value="subscription_adjusted">Plan Adjusted</option>
              <option value="user_deactivated">User Deactivated</option>
              <option value="user_activated">User Activated</option>
              <option value="broadcast_sent">Announcement Sent</option>
            </select>
          </div>

          <div className="filter-select-wrap">
            <label className="filter-label">Target:</label>
            <select 
              value={targetFilter} 
              onChange={(e) => { setTargetFilter(e.target.value); setPage(1); }}
              className="filter-select"
            >
              <option value="all">All Targets</option>
              <option value="user">User Accounts</option>
              <option value="transaction">Payment Transactions</option>
              <option value="pricing">Pricing &amp; Plans</option>
              <option value="subscription">Subscriptions</option>
              <option value="system">Announcements</option>
            </select>
          </div>

          {operatorsList.length > 0 && (
            <div className="filter-select-wrap">
              <label className="filter-label">Operator:</label>
              <select 
                value={operatorFilter} 
                onChange={(e) => { setOperatorFilter(e.target.value); setPage(1); }}
                className="filter-select"
              >
                <option value="all">All Operators</option>
                {operatorsList.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="admin-panel table-panel">
        <div className="admin-table-wrap">
          <table className="admin-table audit-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Timestamp</th>
                <th>Operator</th>
                <th>Action</th>
                <th>Target</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows rows={Math.min(limit, 10)} cols={6} />
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-empty">
                    No audit records matching current filters.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id}>
                    <td className="font-mono text-muted">#{log.id}</td>
                    <td className="text-secondary text-sm font-mono whitespace-nowrap">
                      {formatPhtDateTime(log.created_at)}
                    </td>
                    <td>
                      <div className="operator-cell">
                        <User size={13} color="var(--accent-green)" />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.admin_name || 'Super Admin'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={getActionBadgeClass(log.action)}>
                        {log.action?.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="target-cell">
                        <span className="target-type">{log.target_type}</span>
                        {log.target_id && <span className="target-id font-mono">#{log.target_id}</span>}
                      </div>
                    </td>
                    <td>
                      <span className="audit-desc-text" title={log.description}>
                        {log.description}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="table-pagination-footer">
          <div className="pagination-info">
            Showing <strong>{logs.length > 0 ? (page - 1) * limit + 1 : 0}</strong> to{' '}
            <strong>{Math.min(page * limit, total)}</strong> of <strong>{total}</strong> entries
          </div>
          <div className="pagination-right-group">
            <div className="limit-select-wrap">
              <span>Rows per page:</span>
              <select 
                value={limit} 
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="pagination-controls">
              <button 
                className="page-nav-btn"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>
              <span className="page-current-display">
                Page {page} of {pages}
              </span>
              <button 
                className="page-nav-btn"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
