import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  Users, Search, Filter, Download, UserX, UserCheck, 
  Trash2, Edit2, Key, Eye, Shield, CheckSquare, Square, 
  ChevronLeft, ChevronRight, X, AlertTriangle, Copy, 
  Calendar, Check, Activity, Home, Phone, Mail, FileSpreadsheet, UserPlus,
  ArrowUpDown, ShieldAlert, MessageSquare, CheckCircle2, XCircle
} from 'lucide-react';
import { SkeletonTableRows } from '../components/SkeletonLoader';
import './AdminUsersPage.css';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit, setLimit] = useState(10);
  const [stats, setStats] = useState({ total: 0, owners: 0, caretakers: 0, active: 0, deactivated: 0, suspended: 0 });
  
  // Filters & Search
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);
  const [loading, setLoading] = useState(true);

  // Bulk Actions
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  // Modals & Drawers
  const [activeUserDetail, setActiveUserDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editUserModal, setEditUserModal] = useState(null);
  const [deactivateModal, setDeactivateModal] = useState(null);
  const [deactivateReason, setDeactivateReason] = useState('');

  // Invite / Create Admin State
  const [createModal, setCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    role: 'admin',
    password: '',
    farm_name: '',
    farm_id: ''
  });
  const [createdAccountResult, setCreatedAccountResult] = useState(null);
  const [farmsList, setFarmsList] = useState([]);

  const fetchFarmsList = async () => {
    try {
      const res = await axios.get('/api/admin/farms-list');
      if (res.data && res.data.success) {
        setFarmsList(res.data.farms || []);
      }
    } catch (err) {
      console.warn('Failed to fetch farms list for caretaker selector:', err.message);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/users', {
        params: {
          page,
          limit,
          search,
          role: roleFilter,
          status: statusFilter,
          sort_by: sortBy,
          sort_dir: sortDir
        }
      });
      if (res.data && res.data.success) {
        setUsers(res.data.users || []);
        setTotal(res.data.total || 0);
        setPages(res.data.pages || 1);
        if (res.data.stats) setStats(res.data.stats);
      }
    } catch (err) {
      console.warn('Initial load / fetch users encountered a delay:', err.message);
      // Suppress alarming toast on initial cold load; let skeleton loader wait gracefully
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, limit, roleFilter, statusFilter, sortBy, sortDir]);

  // Click outside listener for sort dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setSortMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchUsers();
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Export User Directory to Excel CSV
  const handleExportExcelUsers = async () => {
    const toastId = toast.loading('Exporting Excel-compatible user directory...');
    try {
      const res = await axios.get('/api/admin/users/export', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `clucko_users_directory_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Excel spreadsheet (.csv) downloaded successfully!', { id: toastId });
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export user directory file', { id: toastId });
    }
  };

  // Helper: Format DateTime to Philippine Standard Time (PHT, UTC+8)
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
        hour12: true
      });
    } catch {
      return dateStr;
    }
  };

  // View User Profile Drawer
  const handleOpenDetail = async (userId) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`/api/admin/users/${userId}`);
      if (res.data && res.data.success) {
        setActiveUserDetail(res.data);
      }
    } catch (err) {
      toast.error('Failed to load user details');
    } finally {
      setDetailLoading(false);
    }
  };

  // Toggle Deactivate / Reactivate Status
  const handleConfirmDeactivate = async () => {
    if (!deactivateModal) return;
    try {
      const newStatus = !deactivateModal.is_active;
      const res = await axios.post(`/api/admin/users/${deactivateModal.id}/status`, {
        is_active: newStatus,
        reason: deactivateReason
      });
      if (res.data.success) {
        toast.success(res.data.message);
        setDeactivateModal(null);
        setDeactivateReason('');
        fetchUsers();
        if (activeUserDetail && activeUserDetail.user.id === deactivateModal.id) {
          setActiveUserDetail(prev => ({
            ...prev,
            user: { ...prev.user, is_active: newStatus }
          }));
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user status');
    }
  };

  // Reset Password
  const handleResetPassword = async (userId) => {
    try {
      const res = await axios.post(`/api/admin/users/${userId}/reset-password`);
      if (res.data.success) {
        setGeneratedPw(res.data.temporary_password);
        toast.success('Temporary password generated!');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    }
  };

  // Edit User
  const handleSaveEditUser = async (e) => {
    e.preventDefault();
    if (!editUserModal) return;
    try {
      const res = await axios.put(`/api/admin/users/${editUserModal.id}`, {
        first_name: editUserModal.first_name,
        last_name: editUserModal.last_name,
        phone_number: editUserModal.phone_number,
        farm_name: editUserModal.farm_name,
        farm_location: editUserModal.farm_location,
        role: editUserModal.role
      });
      if (res.data.success) {
        toast.success('User updated successfully');
        setEditUserModal(null);
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user');
    }
  };

  // Bulk Actions
  const handleSelectAll = () => {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map(u => u.id));
    }
  };

  const handleToggleSelectUser = (id) => {
    if (selectedUserIds.includes(id)) {
      setSelectedUserIds(selectedUserIds.filter(uid => uid !== id));
    } else {
      setSelectedUserIds([...selectedUserIds, id]);
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedUserIds.length === 0) return;
    try {
      const res = await axios.post('/api/admin/users/bulk-action', {
        user_ids: selectedUserIds,
        action
      });
      if (res.data.success) {
        toast.success(res.data.message);
        setSelectedUserIds([]);
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk action failed');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  // Create / Invite Admin Handler
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = (createForm.email || '').trim().toLowerCase();
    const cleanFirstName = (createForm.first_name || '').trim();
    const cleanLastName = (createForm.last_name || '').trim();
    const cleanPhone = (createForm.phone_number || '').trim().replace(/[\s\-()]/g, '');
    const cleanPassword = (createForm.password || '').trim();

    if (!cleanEmail) {
      toast.error('Email address is required');
      return;
    }
    if (!emailRegex.test(cleanEmail)) {
      toast.error('Please enter a valid email address (e.g. admin@company.com)');
      return;
    }
    if (!cleanFirstName || cleanFirstName.length < 2) {
      toast.error('First name must be at least 2 characters');
      return;
    }
    if (cleanPhone) {
      const phRegex = /^(09|\+639)\d{9}$/;
      if (!phRegex.test(cleanPhone)) {
        toast.error('Phone number must follow Philippine mobile format (e.g. 09171234567 or +639171234567)');
        return;
      }
    }
    if (cleanPassword) {
      if (cleanPassword.length < 8) {
        toast.error('Custom password must be at least 8 characters long');
        return;
      }
      if (!/[0-9\W]/.test(cleanPassword)) {
        toast.error('Custom password must contain at least one number or special character');
        return;
      }
    }

    setCreateLoading(true);
    try {
      const payload = {
        ...createForm,
        email: cleanEmail,
        first_name: cleanFirstName,
        last_name: cleanLastName,
        phone_number: cleanPhone,
        password: cleanPassword
      };
      const res = await axios.post('/api/admin/users/create', payload);
      if (res.data.success) {
        toast.success(res.data.message);
        setCreatedAccountResult({
          email: res.data.user.email,
          role: res.data.user.role,
          name: `${res.data.user.first_name} ${res.data.user.last_name}`.trim(),
          temporary_password: res.data.temporary_password,
          login_url: res.data.login_url,
          email_sent: res.data.email_sent
        });
        setCreateForm({
          first_name: '',
          last_name: '',
          email: '',
          phone_number: '',
          role: 'admin',
          password: '',
          farm_name: '',
          farm_id: ''
        });
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create user account');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="admin-users-container">
      {/* Breadcrumb Row */}
      <div className="breadcrumb-row">
        <span className="crumb-root">Platform Administration</span>
        <span className="crumb-sep">/</span>
        <span className="crumb-current">User Accounts</span>
      </div>

      {/* Top Header */}
      <div className="admin-page-header">
        <div className="admin-title-wrap">
          <h1 className="admin-page-title">User & Account Management</h1>
          <p className="admin-page-sub">
            Centralized directory of flock owners, caretakers, and administrators. Manage profile records, credentials, and access states.
          </p>
        </div>
        <div className="admin-header-actions">
          <button 
            type="button"
            onClick={handleExportExcelUsers} 
            className="admin-btn secondary"
            title="Download full user directory formatted for Microsoft Excel"
          >
            <FileSpreadsheet size={15} />
            <span>Export to Excel (CSV)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateModal(true);
              setCreatedAccountResult(null);
              fetchFarmsList();
            }}
            className="admin-btn primary"
            title="Create or invite a new Administrator or account via UI"
          >
            <UserPlus size={15} />
            <span>+ Invite / Add Admin</span>
          </button>
        </div>
      </div>

      {/* Metric Quick Stats */}
      <div className="users-stats-strip">
        <div className="stat-pill active">
          <span className="pill-dot" />
          <span>Total Accounts: <strong>{stats.total}</strong></span>
        </div>
        <div className="stat-pill">
          <span>Owners: <strong>{stats.owners}</strong></span>
        </div>
        <div className="stat-pill">
          <span>Caretakers: <strong>{stats.caretakers}</strong></span>
        </div>
        <div className="stat-pill">
          <span>Active: <strong style={{ color: 'var(--accent-green)' }}>{stats.active}</strong></span>
        </div>
        {(stats.deactivated > 0 || stats.suspended > 0) && (
          <div className="stat-pill suspended">
            <span>Deactivated: <strong style={{ color: 'var(--accent-red)' }}>{stats.deactivated || stats.suspended}</strong></span>
          </div>
        )}
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="admin-filter-bar">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input 
            type="text"
            className="search-input"
            placeholder="Search name, email, farm..."
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
          {/* Role Filter */}
          <div className="filter-select-wrap">
            <label className="filter-label">Role:</label>
            <select 
              value={roleFilter} 
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="filter-select"
            >
              <option value="all">All Roles</option>
              <option value="owner">Farm Owners</option>
              <option value="caretaker">Caretakers</option>
              <option value="admin">Administrators</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="filter-select-wrap">
            <label className="filter-label">Status:</label>
            <select 
              value={statusFilter} 
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="filter-select"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="deactivated">Deactivated Only</option>
            </select>
          </div>

          {/* Sort Popover Icon Button */}
          <div className="sort-icon-wrap" ref={sortMenuRef} style={{ position: 'relative' }}>
            <button 
              type="button"
              className={`sort-icon-btn ${sortMenuOpen ? 'active' : ''}`}
              onClick={() => setSortMenuOpen(!sortMenuOpen)}
              title={`Sort Accounts: ${
                sortBy === 'created_at' && sortDir === 'desc' ? 'Joined Date (Newest)' :
                sortBy === 'created_at' && sortDir === 'asc' ? 'Joined Date (Oldest)' :
                sortBy === 'first_name' && sortDir === 'asc' ? 'Name (A → Z)' :
                sortBy === 'first_name' && sortDir === 'desc' ? 'Name (Z → A)' :
                sortBy === 'last_active_at' ? 'Recently Active' : 'Email (A → Z)'
              }`}
              aria-label="Sort accounts"
            >
              <ArrowUpDown size={15} />
            </button>
            {sortMenuOpen && (
              <div className="sort-popover-menu">
                <div className="sort-popover-header">Sort Accounts</div>
                {[
                  { id: 'created_desc', label: 'Joined Date (Newest)', by: 'created_at', dir: 'desc' },
                  { id: 'created_asc', label: 'Joined Date (Oldest)', by: 'created_at', dir: 'asc' },
                  { id: 'name_asc', label: 'Name (A → Z)', by: 'first_name', dir: 'asc' },
                  { id: 'name_desc', label: 'Name (Z → A)', by: 'first_name', dir: 'desc' },
                  { id: 'active_desc', label: 'Recently Active', by: 'last_active_at', dir: 'desc' },
                  { id: 'email_asc', label: 'Email (A → Z)', by: 'email', dir: 'asc' }
                ].map((opt) => {
                  const isActive = sortBy === opt.by && (opt.by === 'last_active_at' || sortDir === opt.dir);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`sort-popover-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setSortBy(opt.by);
                        setSortDir(opt.dir);
                        setPage(1);
                        setSortMenuOpen(false);
                      }}
                    >
                      <span>{opt.label}</span>
                      {isActive && <Check size={14} color="var(--accent-green)" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Action Toolbar (Appears when items are checked) */}
      {selectedUserIds.length > 0 && (
        <div className="bulk-actions-toolbar animate-in">
          <div className="bulk-selection-count">
            <CheckSquare size={16} color="var(--accent-green)" />
            <span><strong>{selectedUserIds.length}</strong> user{selectedUserIds.length > 1 ? 's' : ''} selected</span>
          </div>
          <div className="bulk-buttons">
            <button 
              className="bulk-btn activate"
              onClick={() => handleBulkAction('activate')}
            >
              <UserCheck size={14} />
              <span>Bulk Reactivate</span>
            </button>
            <button 
              className="bulk-btn suspend"
              onClick={() => handleBulkAction('deactivate')}
            >
              <UserX size={14} />
              <span>Bulk Deactivate</span>
            </button>
            <button 
              className="bulk-btn cancel"
              onClick={() => setSelectedUserIds([])}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Main Dynamic Table */}
      <div className="admin-panel table-panel">
        <div className="admin-table-wrap">
          <table className="admin-table users-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <button 
                    className="select-all-btn"
                    onClick={handleSelectAll}
                    title="Select all on this page"
                  >
                    {selectedUserIds.length === users.length && users.length > 0 ? (
                      <CheckSquare size={16} color="var(--accent-green)" />
                    ) : (
                      <Square size={16} color="var(--text-muted)" />
                    )}
                  </button>
                </th>
                <th>Account</th>
                <th>Role</th>
                <th>
                  {roleFilter === 'caretaker' 
                    ? 'Assigned Farm & Owner' 
                    : roleFilter === 'owner' 
                      ? 'Owned Farm & Location' 
                      : 'Farm & Assigned Operation'}
                </th>
                <th>Subscription</th>
                <th>Flock Usage</th>
                <th>Status</th>
                <th>Activity</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows rows={limit} cols={9} />
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-empty">
                    No users matching current filters.
                  </td>
                </tr>
              ) : (
                users.map(u => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <tr key={u.id} className={isSelected ? 'row-selected' : ''}>
                      <td>
                        <button 
                          className="select-row-btn"
                          onClick={() => handleToggleSelectUser(u.id)}
                        >
                          {isSelected ? (
                            <CheckSquare size={16} color="var(--accent-green)" />
                          ) : (
                            <Square size={16} color="var(--text-muted)" />
                          )}
                        </button>
                      </td>
                      <td>
                        <div className="user-name-col">
                          <div className="user-avatar-circle">
                            {u.first_name?.[0] || 'U'}
                          </div>
                          <div>
                            <div className="user-full-name">
                              {u.first_name} {u.last_name || ''}
                            </div>
                            <div className="user-email-text">{u.email}</div>
                            {u.phone_number && (
                              <div className="user-phone-text">{u.phone_number}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge-role ${u.role}`}>
                          {u.role === 'admin' ? 'ADMIN' : u.role === 'owner' ? 'OWNER' : 'CARETAKER'}
                        </span>
                      </td>
                      <td>
                        <div className="user-farm-col">
                          {u.role === 'caretaker' ? (
                            <>
                              <span className="farm-name-title">
                                {u.farm_name ? u.farm_name : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned (Pending)</span>}
                              </span>
                              {u.assigned_owner_name ? (
                                <span className="farm-loc-sub" style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                                  Assigned to: {u.assigned_owner_name}
                                </span>
                              ) : u.farm_location ? (
                                <span className="farm-loc-sub">{u.farm_location}</span>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <span className="farm-name-title">{u.farm_name || '—'}</span>
                              {u.farm_location && <span className="farm-loc-sub">{u.farm_location}</span>}
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge-plan ${u.current_plan}`}>
                          {u.current_plan?.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div className="usage-stats-cell">
                          <span>{u.farms_count || 0} Farms</span>
                          <span>• {u.chickens_count || 0} Chickens</span>
                          <span>• {u.scans_count || 0} Scans</span>
                        </div>
                      </td>
                      <td>
                        {u.is_active ? (
                          <span className="status-badge active">ACTIVE</span>
                        ) : (
                          <span className="status-badge suspended">DEACTIVATED</span>
                        )}
                      </td>
                      <td className="text-sm text-secondary font-mono">
                        {u.last_active_at ? (
                          formatPhtDateTime(u.last_active_at)
                        ) : (
                          'Never'
                        )}
                      </td>
                      <td>
                        <div className="row-actions-group">
                          <button 
                            className="action-icon-btn" 
                            title="View Full Profile Drawer"
                            onClick={() => handleOpenDetail(u.id)}
                          >
                            <Eye size={15} />
                          </button>
                          <button 
                            className="action-icon-btn" 
                            title="Edit User Details"
                            onClick={() => setEditUserModal({ ...u })}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button 
                            className={`action-icon-btn ${u.is_active ? 'warning' : 'success'}`} 
                            title={u.is_active ? 'Deactivate Account' : 'Reactivate Account'}
                            onClick={() => { setDeactivateModal(u); setDeactivateReason(''); }}
                          >
                            {u.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="table-pagination-footer">
          <div className="pagination-info">
            Showing <strong>{users.length > 0 ? (page - 1) * limit + 1 : 0}</strong> to{' '}
            <strong>{Math.min(page * limit, total)}</strong> of <strong>{total}</strong> users
          </div>
          <div className="pagination-controls">
            <div className="limit-selector-wrap">
              <span>Per page:</span>
              <select 
                value={limit} 
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="limit-select"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
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

      {/* ─── MODAL 1: USER DETAILS DRAWER ─────────────────────────────────── */}
      {activeUserDetail && (
        <div className="admin-modal-backdrop" onClick={() => setActiveUserDetail(null)}>
          <div className="admin-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <span className="drawer-category">User Account Dossier</span>
                <h2 className="drawer-title">
                  {activeUserDetail.user.first_name} {activeUserDetail.user.last_name}
                </h2>
              </div>
              <button className="drawer-close-btn" onClick={() => setActiveUserDetail(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Profile Card */}
              <div className="dossier-card">
                <div className="dossier-header-row">
                  <div className="dossier-avatar">
                    {activeUserDetail.user.first_name?.[0] || 'U'}
                  </div>
                  <div>
                    <div className="dossier-name">
                      {activeUserDetail.user.first_name} {activeUserDetail.user.last_name}
                    </div>
                    <div className="dossier-email">{activeUserDetail.user.email}</div>
                    <div className="dossier-badges">
                      <span className={`badge-role ${activeUserDetail.user.role}`}>
                        {activeUserDetail.user.role?.toUpperCase()}
                      </span>
                      {activeUserDetail.user.is_active ? (
                        <span className="status-badge active">ACTIVE</span>
                      ) : (
                        <span className="status-badge suspended">DEACTIVATED</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="dossier-info-grid">
                  <div className="info-item">
                    <span className="info-label">Contact Phone</span>
                    <span className="info-value">{activeUserDetail.user.phone_number || 'Not provided'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Farm Organization</span>
                    <span className="info-value">{activeUserDetail.user.farm_name || 'Individual'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Location</span>
                    <span className="info-value">{activeUserDetail.user.farm_location || 'Not provided'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Account Created</span>
                    <span className="info-value">
                      {formatPhtDateTime(activeUserDetail.user.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Active Subscription Status */}
              <div className="dossier-section">
                <h3 className="section-title">Subscription Tier</h3>
                {activeUserDetail.subscription ? (
                  <div className="sub-detail-box">
                    <div className="sub-detail-row">
                      <span className="sub-plan-badge">{activeUserDetail.subscription.plan?.toUpperCase()}</span>
                      <span className="sub-status-pill">{activeUserDetail.subscription.status}</span>
                    </div>
                    <div className="sub-dates-row">
                      <span>Expires: <strong>{new Date(activeUserDetail.subscription.end_date).toLocaleDateString()}</strong></span>
                      <span>Paid: ₱{Number(activeUserDetail.subscription.price_paid || 0).toLocaleString()}</span>
                    </div>
                    <div className="sub-limits-grid">
                      <div>Max Farms: {activeUserDetail.subscription.max_farms}</div>
                      <div>Max Chickens: {activeUserDetail.subscription.max_chickens_per_farm} / farm</div>
                      <div>Captures Limit: {activeUserDetail.subscription.max_captures >= 999999 ? 'Unlimited' : activeUserDetail.subscription.max_captures}</div>
                    </div>
                  </div>
                ) : (
                  <div className="empty-sub-state">No subscription record found.</div>
                )}
              </div>

              {/* Owned Farms (For Farm Owners) */}
              {activeUserDetail.owned_farms?.length > 0 && (
                <div className="dossier-section">
                  <h3 className="section-title">Owned Farms ({activeUserDetail.owned_farms.length})</h3>
                  <div className="farms-cards-list">
                    {activeUserDetail.owned_farms.map(f => (
                      <div key={f.id} className="farm-mini-card">
                        <div className="farm-card-head">
                          <Home size={15} color="var(--accent-green)" />
                          <span className="farm-mini-name">{f.farm_name}</span>
                        </div>
                        <div className="farm-card-metrics" style={{ marginTop: 4 }}>
                          <span>{f.chicken_count || 0} Chickens</span> • <span>{f.caretaker_count || 0} Caretakers</span>
                        </div>
                        
                        {/* Caretakers list under this farm */}
                        {f.caretakers && f.caretakers.length > 0 ? (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)', fontSize: '12px' }}>
                            <div style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
                              Assigned Caretakers:
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {f.caretakers.map(c => (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-green)' }}></span>
                                  <strong style={{ color: 'var(--text-primary)' }}>{c.first_name} {c.last_name || ''}</strong>
                                  <span style={{ color: 'var(--text-muted)' }}>({c.email})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: 6, fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No caretakers assigned to this farm yet.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assigned Farms & Supervisor (For Caretakers) */}
              {activeUserDetail.user.role === 'caretaker' && (
                <div className="dossier-section">
                  <h3 className="section-title">Assigned Farm & Supervisor</h3>
                  {activeUserDetail.member_farms && activeUserDetail.member_farms.length > 0 ? (
                    <div className="farms-cards-list">
                      {activeUserDetail.member_farms.map(mf => (
                        <div key={mf.id} className="farm-mini-card">
                          <div className="farm-card-head">
                            <Home size={15} color="var(--accent-green)" />
                            <span className="farm-mini-name">{mf.farm_name}</span>
                          </div>
                          <div style={{ marginTop: 8, fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div>
                              <span style={{ color: 'var(--text-muted)' }}>Assigned at: </span>
                              <strong style={{ color: 'var(--text-primary)' }}>{mf.farm_name}</strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-muted)' }}>Under of: </span>
                              <strong style={{ color: 'var(--accent-green)' }}>{mf.owner_name}</strong>
                              <span style={{ color: 'var(--text-muted)' }}> ({mf.owner_email})</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="farm-mini-card">
                      <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Assigned at: </span>
                          <strong style={{ color: 'var(--text-primary)' }}>{activeUserDetail.user.farm_name || 'Individual / Pending'}</strong>
                        </div>
                        {activeUserDetail.user.farm_location && (
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Location: </span>
                            <span style={{ color: 'var(--text-secondary)' }}>{activeUserDetail.user.farm_location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Recent Health Scans */}
              <div className="dossier-section">
                <h3 className="section-title">Recent Disease Scans ({activeUserDetail.recent_scans?.length || 0})</h3>
                {activeUserDetail.recent_scans?.length === 0 ? (
                  <p className="empty-sub-state">No scans recorded yet for this user.</p>
                ) : (
                  <div className="recent-scans-list">
                    {activeUserDetail.recent_scans.map(s => (
                      <div key={s.id} className="scan-mini-item">
                        <div className="scan-type-badge">{s.image_type}</div>
                        <div className="scan-condition">
                          <strong>{s.predicted_condition || 'Healthy Screening'}</strong>
                          <span className="scan-conf">{s.confidence_score ? `${s.confidence_score}%` : ''}</span>
                        </div>
                        <div className="scan-date">
                          {new Date(s.capture_datetime).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: EDIT USER MODAL ─────────────────────────────────────── */}
      {editUserModal && (
        <div className="admin-modal-backdrop" onClick={() => setEditUserModal(null)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit User Profile</h2>
              <button className="modal-close-btn" onClick={() => setEditUserModal(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveEditUser}>
              <div className="modal-form-grid">
                <div className="form-field">
                  <label>First Name</label>
                  <input 
                    type="text" 
                    required 
                    value={editUserModal.first_name}
                    onChange={(e) => setEditUserModal({ ...editUserModal, first_name: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>Last Name</label>
                  <input 
                    type="text" 
                    value={editUserModal.last_name || ''}
                    onChange={(e) => setEditUserModal({ ...editUserModal, last_name: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>Phone Number</label>
                  <input 
                    type="text" 
                    value={editUserModal.phone_number || ''}
                    onChange={(e) => setEditUserModal({ ...editUserModal, phone_number: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>Role</label>
                  <select 
                    value={editUserModal.role}
                    onChange={(e) => setEditUserModal({ ...editUserModal, role: e.target.value })}
                  >
                    <option value="owner">Farm Owner</option>
                    <option value="caretaker">Caretaker</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div className="form-field full-col">
                  <label>Farm Name</label>
                  <input 
                    type="text" 
                    value={editUserModal.farm_name || ''}
                    onChange={(e) => setEditUserModal({ ...editUserModal, farm_name: e.target.value })}
                  />
                </div>
                <div className="form-field full-col">
                  <label>Farm Location</label>
                  <input 
                    type="text" 
                    value={editUserModal.farm_location || ''}
                    onChange={(e) => setEditUserModal({ ...editUserModal, farm_location: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-actions-row">
                <button type="button" className="admin-btn secondary" onClick={() => setEditUserModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: DEACTIVATE / REACTIVATE CONFIRMATION ───────────────────── */}
      {deactivateModal && (
        <div className="admin-modal-backdrop" onClick={() => setDeactivateModal(null)}>
          <div className="admin-modal-card warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-alert">
              <AlertTriangle size={28} color="var(--accent-amber)" />
            </div>
            <h2 className="modal-title">
              {deactivateModal.is_active ? 'Deactivate User Account?' : 'Reactivate User Account?'}
            </h2>
            <p className="modal-desc">
              {deactivateModal.is_active
                ? `Deactivating ${deactivateModal.email} will immediately terminate their active sessions, log them out, and display a notice on the login page informing them that their account was deactivated by the platform developers. As stated in our Terms & Agreements, accounts deactivated by developers cannot be reactivated by farm owners.`
                : `Reactivating ${deactivateModal.email} will restore their login access immediately.`}
            </p>

            {deactivateModal.is_active && (
              <div style={{ marginTop: 12, textAlign: 'left' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  Select Guideline Conflict / Preset Reason:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {[
                    'Platform Developer Discretion: Community guidelines and policy conflict',
                    'System Integrity & Security: Irregular automated activity detected',
                    'Billing & Subscription Dispute: Under developer review',
                    'Breach of Terms: Commercial exploitation or unauthorized delegation',
                    'Administrative Hold: Investigation pending'
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="preset-reason-btn"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11.5px',
                        borderRadius: '16px',
                        background: deactivateReason === preset ? 'rgba(234, 179, 8, 0.2)' : 'var(--bg-input)',
                        border: `1px solid ${deactivateReason === preset ? 'var(--accent-amber)' : 'var(--border)'}`,
                        color: deactivateReason === preset ? 'var(--accent-amber)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onClick={() => setDeactivateReason(preset)}
                    >
                      {preset.split(':')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-field" style={{ textAlign: 'left' }}>
              <label>Reason for Action (Recorded in Audit Trail and displayed to user upon login):</label>
              <textarea 
                rows={3} 
                className="admin-textarea"
                placeholder="e.g. Platform Developer Discretion: Community guidelines conflict."
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
              />
            </div>
            <div className="modal-actions-row">
              <button className="admin-btn secondary" onClick={() => setDeactivateModal(null)}>
                Cancel
              </button>
              <button 
                className={`admin-btn ${deactivateModal.is_active ? 'danger' : 'primary'}`}
                onClick={handleConfirmDeactivate}
              >
                {deactivateModal.is_active ? 'Confirm Deactivation' : 'Confirm Reactivation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 6: INVITE / CREATE ADMIN MODAL ───────────────────────── */}
      {createModal && (
        <div className="admin-modal-backdrop" onClick={() => setCreateModal(false)}>
          <div className="admin-modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-green-soft, #2D554122)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserPlus size={20} color="var(--accent-green)" />
                </div>
                <div>
                  <h2 className="modal-title" style={{ margin: 0 }}>Add Administrator / User</h2>
                  <p className="modal-desc" style={{ margin: 0, fontSize: '0.82rem' }}>
                    Enterprise Admin-Invite-Admin creation model. No database edit needed.
                  </p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setCreateModal(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {createdAccountResult ? (
              <div style={{ marginTop: 20 }}>
                <div style={{ padding: 16, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 10, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-green)', fontWeight: 600, marginBottom: 6 }}>
                    <Check size={18} /> Admin Account Created Successfully!
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    The <strong>{createdAccountResult.role.toUpperCase()}</strong> account for <strong>{createdAccountResult.email}</strong> is now active in the platform directory.
                  </p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '0.82rem', color: createdAccountResult.email_sent ? '#22C55E' : 'var(--text-secondary)' }}>
                    {createdAccountResult.email_sent 
                      ? '📧 Automated Delivery: Custom invitation email dispatched successfully.'
                      : '📋 Instant Credential Sharing: Copy the temporary credentials below to share directly with the administrator.'}
                  </p>
                </div>

                {/* Temporary Password Box */}
                <div style={{ background: 'var(--bg-secondary, #1e293b)', padding: 14, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 12 }}>
                  <label style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                    Temporary Password
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, padding: '10px 12px', background: 'var(--bg-panel, #0f172a)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                    <code style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-green)', letterSpacing: 0.5 }}>
                      {createdAccountResult.temporary_password}
                    </code>
                    <button
                      type="button"
                      className="admin-btn secondary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => copyToClipboard(createdAccountResult.temporary_password)}
                    >
                      <Copy size={13} /> Copy Password
                    </button>
                  </div>
                </div>

                {/* Portal Link / Target App Box */}
                <div style={{ background: 'var(--bg-secondary, #1e293b)', padding: 14, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16 }}>
                  <label style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                    {createdAccountResult.role === 'admin' ? 'Admin Sign-In Portal URL' : 'Access Target Platform'}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, padding: '10px 12px', background: 'var(--bg-panel, #0f172a)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                      {createdAccountResult.role === 'admin' 
                        ? (createdAccountResult.login_url || 'https://clucko-app.vercel.app/admin/login?portal=admin')
                        : '📱 Clucko Mobile App (iOS / Android) • User signs in with this email & password.'}
                    </span>
                    <button
                      type="button"
                      className="admin-btn secondary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => copyToClipboard(createdAccountResult.login_url || 'https://clucko-app.vercel.app/admin/login?portal=admin')}
                    >
                      <Copy size={13} /> Copy Link
                    </button>
                  </div>
                </div>

                {/* 1-Click Copy Complete Invitation Message */}
                <button
                  type="button"
                  className="admin-btn"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    marginBottom: 16,
                    padding: '10px 16px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: 'var(--accent-green)',
                    border: '1px solid var(--accent-green-border)'
                  }}
                  onClick={() => {
                    const isAdm = createdAccountResult.role === 'admin';
                    const inviteMsg = isAdm
                      ? `🐣 Clucko Platform Administration Invitation\nYou have been authorized as an Administrator on Clucko.\n\nAdmin Portal: ${createdAccountResult.login_url || 'https://clucko-app.vercel.app/admin/login?portal=admin'}\nEmail: ${createdAccountResult.email}\nTemporary Password: ${createdAccountResult.temporary_password}\n\nPlease sign in through the Admin Portal and update your password.`
                      : `🐣 Welcome to Clucko Gamefowl Health AI\nYour ${createdAccountResult.role === 'owner' ? 'Farm Owner' : 'Caretaker'} account has been created.\n\nLogin Email: ${createdAccountResult.email}\nTemporary Password: ${createdAccountResult.temporary_password}\nRole: ${createdAccountResult.role === 'owner' ? 'Farm Owner' : 'Caretaker'}\n\nPlease open the Clucko Mobile App and log in with these credentials to manage your flock.`;
                    copyToClipboard(inviteMsg);
                  }}
                >
                  <Copy size={15} />
                  <span>Copy Complete Invitation Message</span>
                </button>

                <div className="modal-actions-row">
                  <button
                    type="button"
                    className="admin-btn primary"
                    onClick={() => {
                      setCreatedAccountResult(null);
                      setCreateModal(false);
                    }}
                  >
                    Done & Close
                  </button>
                  <button
                    type="button"
                    className="admin-btn secondary"
                    onClick={() => setCreatedAccountResult(null)}
                  >
                    Create Another Account
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateSubmit} style={{ marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-field">
                    <label>First Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maria"
                      value={createForm.first_name}
                      onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label>Last Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Santos"
                      value={createForm.last_name}
                      onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="admin.user@example.com"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-field">
                    <label>Account Role *</label>
                    <select
                      value={createForm.role}
                      onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
                    >
                      <option value="admin">Administrator (Admin Center Access)</option>
                      <option value="owner">Farm Owner (Mobile App • Admin Override)</option>
                      <option value="caretaker">Caretaker (Mobile App • Admin Override)</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Phone Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="09XXXXXXXXX"
                      value={createForm.phone_number}
                      onChange={(e) => setCreateForm({ ...createForm, phone_number: e.target.value })}
                    />
                  </div>
                </div>

                {/* Defensible Architectural Subtext Note for Role Selection */}
                {createForm.role === 'admin' && (
                  <div className="role-subtext-box admin-role-subtext">
                    🛡️ <strong>Web Administration:</strong> Administrator accounts have full privileges to access this Admin AI Center, review system financials, audit trails, and oversee AI Vision tools.
                  </div>
                )}
                {createForm.role === 'owner' && (
                  <div className="role-subtext-box owner-role-subtext">
                    💡 <strong>Mobile App Account:</strong> Farm Owners typically register directly via the Clucko Mobile App. Provisioning here serves as an administrative/enterprise override (e.g., in-person farm onboarding). An initial farm is automatically provisioned so the owner can immediately sign in on the mobile app.
                  </div>
                )}
                {createForm.role === 'caretaker' && (
                  <div className="role-subtext-box caretaker-role-subtext">
                    💡 <strong>Mobile App Account:</strong> Caretakers are normally invited and assigned by Farm Owners inside the Clucko Mobile App. Creating one here directly links them to a selected farm so they can immediately sign in on the mobile app without error.
                  </div>
                )}

                {/* Dynamic Role-Specific Inputs */}
                {createForm.role === 'owner' && (
                  <div className="form-field" style={{ marginTop: 12 }}>
                    <label>Initial Farm Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Santos Gamefarm (defaults to User's Farm)"
                      value={createForm.farm_name || ''}
                      onChange={(e) => setCreateForm({ ...createForm, farm_name: e.target.value })}
                    />
                  </div>
                )}

                {createForm.role === 'caretaker' && (
                  <div className="form-field" style={{ marginTop: 12 }}>
                    <label>Assign to Farm * (Required for Mobile App Access)</label>
                    <select
                      value={createForm.farm_id || ''}
                      onChange={(e) => setCreateForm({ ...createForm, farm_id: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
                    >
                      <option value="">-- Select an Existing Farm ({farmsList.length} Available) --</option>
                      {farmsList.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.farm_name} ({f.owner_name ? `Owner: ${f.owner_name}` : `Code: ${f.farm_code}`})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-field" style={{ marginTop: 12 }}>
                  <label>Temporary Password (Leave blank for auto-generated)</label>
                  <input
                    type="text"
                    placeholder="Leave empty for secure generated password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  />
                </div>

                <div style={{ background: 'var(--bg-secondary, #1e293b)', padding: '10px 14px', borderRadius: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 16, border: '1px solid var(--border)' }}>
                  🛡️ <strong>Security & Automated Email:</strong> The new account will be instantly active. An onboarding welcome email with credentials and direct login link will be automatically dispatched to their inbox. Every administrative account creation is permanently recorded in the BIR & ISO 27001 Audit Trail.
                </div>

                <div className="modal-actions-row">
                  <button type="button" className="admin-btn secondary" onClick={() => setCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="admin-btn primary" disabled={createLoading}>
                    {createLoading ? 'Creating Account...' : 'Create Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
