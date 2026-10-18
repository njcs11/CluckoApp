import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  Users, Search, Filter, Download, UserX, UserCheck, 
  Trash2, Edit2, Key, Eye, Shield, CheckSquare, Square, 
  ChevronLeft, ChevronRight, X, AlertTriangle, Copy, 
  Calendar, Check, Activity, Home, Phone, Mail, FileSpreadsheet, UserPlus
} from 'lucide-react';
import './AdminUsersPage.css';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit, setLimit] = useState(10);
  const [stats, setStats] = useState({ total: 0, owners: 0, caretakers: 0, active: 0, suspended: 0 });
  
  // Filters & Search
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);

  // Bulk Actions
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  // Modals & Drawers
  const [activeUserDetail, setActiveUserDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editUserModal, setEditUserModal] = useState(null);
  const [suspendModal, setSuspendModal] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(null);

  // Invite / Create Admin State
  const [createModal, setCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    role: 'admin',
    password: ''
  });
  const [createdAccountResult, setCreatedAccountResult] = useState(null);

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
      console.error('Failed to load users:', err);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, limit, roleFilter, statusFilter, sortBy, sortDir]);

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

  // Toggle Suspend Status
  const handleConfirmSuspend = async () => {
    if (!suspendModal) return;
    try {
      const newStatus = !suspendModal.is_active;
      const res = await axios.post(`/api/admin/users/${suspendModal.id}/status`, {
        is_active: newStatus,
        reason: suspendReason
      });
      if (res.data.success) {
        toast.success(res.data.message);
        setSuspendModal(null);
        setSuspendReason('');
        fetchUsers();
        if (activeUserDetail && activeUserDetail.user.id === suspendModal.id) {
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

  // Delete User
  const handleConfirmDelete = async () => {
    if (!deleteConfirmModal) return;
    try {
      const res = await axios.delete(`/api/admin/users/${deleteConfirmModal.id}`);
      if (res.data.success) {
        toast.success(res.data.message);
        setDeleteConfirmModal(null);
        if (activeUserDetail?.user?.id === deleteConfirmModal.id) {
          setActiveUserDetail(null);
        }
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user');
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
    if (action === 'delete' && !window.confirm(`Are you sure you want to permanently delete ${selectedUserIds.length} user accounts?`)) {
      return;
    }
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
          email_sent: res.data.email_sent
        });
        setCreateForm({
          first_name: '',
          last_name: '',
          email: '',
          phone_number: '',
          role: 'admin',
          password: ''
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
      {/* Top Header */}
      <div className="admin-page-header">
        <div>
          <div className="breadcrumb-row">
            <span className="crumb-root">Platform Administration</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">User Accounts</span>
          </div>
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
        {stats.suspended > 0 && (
          <div className="stat-pill suspended">
            <span>Suspended: <strong style={{ color: 'var(--accent-red)' }}>{stats.suspended}</strong></span>
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
            placeholder="Search by name, email, phone, or farm..."
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
              <option value="suspended">Suspended Only</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="filter-select-wrap">
            <label className="filter-label">Sort:</label>
            <select 
              value={`${sortBy}_${sortDir}`} 
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'name_asc') {
                  setSortBy('first_name');
                  setSortDir('asc');
                } else if (val === 'name_desc') {
                  setSortBy('first_name');
                  setSortDir('desc');
                } else if (val === 'created_desc') {
                  setSortBy('created_at');
                  setSortDir('desc');
                } else if (val === 'created_asc') {
                  setSortBy('created_at');
                  setSortDir('asc');
                } else if (val === 'active_desc') {
                  setSortBy('last_active_at');
                  setSortDir('desc');
                } else if (val === 'email_asc') {
                  setSortBy('email');
                  setSortDir('asc');
                }
                setPage(1);
              }}
              className="filter-select"
            >
              <option value="created_desc">Joined Date (Newest)</option>
              <option value="created_asc">Joined Date (Oldest)</option>
              <option value="name_asc">Name (A → Z)</option>
              <option value="name_desc">Name (Z → A)</option>
              <option value="active_desc">Recently Active</option>
              <option value="email_asc">Email (A → Z)</option>
            </select>
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
              <span>Bulk Activate</span>
            </button>
            <button 
              className="bulk-btn suspend"
              onClick={() => handleBulkAction('suspend')}
            >
              <UserX size={14} />
              <span>Bulk Suspend</span>
            </button>
            <button 
              className="bulk-btn delete"
              onClick={() => handleBulkAction('delete')}
            >
              <Trash2 size={14} />
              <span>Bulk Delete</span>
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
                <tr>
                  <td colSpan={9} className="table-loading">
                    <div className="spinner-large" style={{ width: 24, height: 24 }} />
                    <span>Loading user accounts...</span>
                  </td>
                </tr>
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
                          <span className="status-badge suspended">SUSPENDED</span>
                        )}
                      </td>
                      <td className="text-sm text-secondary font-mono">
                        {u.last_active_at ? (
                          new Date(u.last_active_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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
                            title={u.is_active ? 'Suspend Account' : 'Reactivate Account'}
                            onClick={() => { setSuspendModal(u); setSuspendReason(''); }}
                          >
                            {u.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                          </button>
                          <button 
                            className="action-icon-btn danger" 
                            title="Permanently Delete"
                            onClick={() => setDeleteConfirmModal(u)}
                          >
                            <Trash2 size={15} />
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
                        <span className="status-badge suspended">SUSPENDED</span>
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
                      {activeUserDetail.user.created_at ? new Date(activeUserDetail.user.created_at).toLocaleDateString() : '—'}
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

              {/* Owned Farms */}
              {activeUserDetail.owned_farms?.length > 0 && (
                <div className="dossier-section">
                  <h3 className="section-title">Owned Farms ({activeUserDetail.owned_farms.length})</h3>
                  <div className="farms-cards-list">
                    {activeUserDetail.owned_farms.map(f => (
                      <div key={f.id} className="farm-mini-card">
                        <div className="farm-card-head">
                          <Home size={15} color="var(--accent-green)" />
                          <span className="farm-mini-name">{f.farm_name}</span>
                          <span className="farm-mini-code">Code: {f.farm_code}</span>
                        </div>
                        <div className="farm-card-metrics">
                          <span>{f.chicken_count} Chickens</span> • <span>{f.caretaker_count} Caretakers</span>
                        </div>
                      </div>
                    ))}
                  </div>
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

      {/* ─── MODAL 3: SUSPEND / REACTIVATE CONFIRMATION ───────────────────── */}
      {suspendModal && (
        <div className="admin-modal-backdrop" onClick={() => setSuspendModal(null)}>
          <div className="admin-modal-card warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-alert">
              <AlertTriangle size={28} color="var(--accent-amber)" />
            </div>
            <h2 className="modal-title">
              {suspendModal.is_active ? 'Suspend User Account?' : 'Reactivate User Account?'}
            </h2>
            <p className="modal-desc">
              {suspendModal.is_active
                ? `Suspending ${suspendModal.email} will immediately revoke their active sessions and block login access.`
                : `Reactivating ${suspendModal.email} will restore their login access immediately.`}
            </p>
            <div className="form-field">
              <label>Reason for Action (Recorded in Audit Ledger):</label>
              <textarea 
                rows={3} 
                className="admin-textarea"
                placeholder="e.g. Terms violation, requested hold, or identity verified..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
              />
            </div>
            <div className="modal-actions-row">
              <button className="admin-btn secondary" onClick={() => setSuspendModal(null)}>
                Cancel
              </button>
              <button 
                className={`admin-btn ${suspendModal.is_active ? 'danger' : 'primary'}`}
                onClick={handleConfirmSuspend}
              >
                {suspendModal.is_active ? 'Confirm Suspension' : 'Confirm Reactivation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: PERMANENT DELETE CONFIRMATION ───────────────────────── */}
      {deleteConfirmModal && (
        <div className="admin-modal-backdrop" onClick={() => setDeleteConfirmModal(null)}>
          <div className="admin-modal-card danger-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-alert danger">
              <Trash2 size={28} color="var(--accent-red)" />
            </div>
            <h2 className="modal-title">Permanently Delete Account?</h2>
            <p className="modal-desc">
              Are you sure you want to delete <strong>{deleteConfirmModal.email}</strong>? This action is irreversible and cascades to all associated chickens, scans, and task history.
            </p>
            <div className="modal-actions-row">
              <button className="admin-btn secondary" onClick={() => setDeleteConfirmModal(null)}>
                Cancel
              </button>
              <button className="admin-btn danger" onClick={handleConfirmDelete}>
                Delete Permanently
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
                <div style={{ padding: 16, background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2E7D32', fontWeight: 600, marginBottom: 6 }}>
                    <Check size={18} /> Account Created Successfully!
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#1B5E20' }}>
                    The <strong>{createdAccountResult.role.toUpperCase()}</strong> account for <strong>{createdAccountResult.email}</strong> is now active.
                  </p>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: createdAccountResult.email_sent ? '#2E7D32' : '#78350F' }}>
                    {createdAccountResult.email_sent 
                      ? '📧 Automated Delivery: An onboarding welcome email with their login credentials and direct sign-in link has been sent to their inbox!'
                      : '📧 Email Delivery: Account created. (Please manually share credentials below or ensure SMTP is online).'}
                  </p>
                </div>

                <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: 14, borderRadius: 8, border: '1px solid var(--border-color, #e2e8f0)', marginBottom: 16 }}>
                  <label style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                    Temporary Login Credentials
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, padding: '10px 12px', background: '#fff', borderRadius: 6, border: '1px dashed #cbd5e1' }}>
                    <code style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                      {createdAccountResult.temporary_password}
                    </code>
                    <button
                      type="button"
                      className="admin-btn secondary"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={() => copyToClipboard(createdAccountResult.temporary_password)}
                    >
                      <Copy size={13} /> Copy
                    </button>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
                    Share this temporary password with the new administrator. They can log in immediately at the Admin Login Gate.
                  </p>
                </div>

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
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border-color)' }}
                    >
                      <option value="admin">Administrator (Full Admin Access)</option>
                      <option value="owner">Farm Owner</option>
                      <option value="caretaker">Caretaker</option>
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

                <div className="form-field">
                  <label>Temporary Password (Leave blank for auto-generated)</label>
                  <input
                    type="text"
                    placeholder="Leave empty for secure generated password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  />
                </div>

                <div style={{ background: '#F1F5F9', padding: '10px 14px', borderRadius: 6, fontSize: '0.8rem', color: '#475569', marginBottom: 16 }}>
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
