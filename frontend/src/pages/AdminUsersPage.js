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
  const [stats, setStats] = useState({ total: 0, owners: 0, caretakers: 0, active: 0, suspended: 0 });
  
  // Filters & Search
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);
  const [accountFilter, setAccountFilter] = useState('all');
  const [allAccounts, setAllAccounts] = useState([]);
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

  // Appeals Management State
  const [appealsModal, setAppealsModal] = useState(false);
  const [appeals, setAppeals] = useState([]);
  const [appealsLoading, setAppealsLoading] = useState(false);
  const [pendingAppealsCount, setPendingAppealsCount] = useState(0);

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
          sort_dir: sortDir,
          user_id: accountFilter
        }
      });
      if (res.data && res.data.success) {
        setUsers(res.data.users || []);
        if (res.data.all_accounts && res.data.all_accounts.length > 0) {
          setAllAccounts(res.data.all_accounts);
        }
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

  const handleAccountFilterChange = (val) => {
    setAccountFilter(val);
    setPage(1);
  };

  useEffect(() => {
    // Initial fetch of full accounts directory
    axios.get('/api/admin/users', { params: { limit: 100 } })
      .then(r => {
        if (r.data && r.data.all_accounts) setAllAccounts(r.data.all_accounts);
        else if (r.data && r.data.users) setAllAccounts(r.data.users);
      })
      .catch(() => {});
  }, []);

  const fetchAppeals = async () => {
    setAppealsLoading(true);
    try {
      const res = await axios.get('/api/admin/appeals');
      if (res.data && res.data.success) {
        setAppeals(res.data.appeals || []);
        setPendingAppealsCount((res.data.appeals || []).filter(a => a.status === 'pending').length);
      }
    } catch (err) {
      console.warn('Appeals fetch error:', err);
    } finally {
      setAppealsLoading(false);
    }
  };

  const handleAppealAction = async (appealId, action) => {
    try {
      const res = await axios.post(`/api/admin/appeals/${appealId}/action`, { action });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchAppeals();
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update appeal status');
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchAppeals();
  }, [page, limit, roleFilter, statusFilter, accountFilter, sortBy, sortDir]);

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
            onClick={() => {
              setAppealsModal(true);
              fetchAppeals();
            }} 
            className={`admin-btn ${pendingAppealsCount > 0 ? 'warning' : 'secondary'}`}
            title="Review submitted account suspension appeals"
            style={{ position: 'relative' }}
          >
            <ShieldAlert size={15} />
            <span>Appeals Review</span>
            {pendingAppealsCount > 0 && (
              <span style={{
                background: 'var(--accent-red)',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '10px',
                marginLeft: '4px'
              }}>
                {pendingAppealsCount}
              </span>
            )}
          </button>
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

          {/* Account Filter Dropdown — Direct Individual User Accounts */}
          <div className="filter-select-wrap">
            <label className="filter-label">Account:</label>
            <select 
              value={accountFilter} 
              onChange={(e) => handleAccountFilterChange(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Accounts ({allAccounts.length || stats.total || users.length})</option>
              {(allAccounts.length > 0 ? allAccounts : users).map((acc) => {
                const roleLabel = acc.role === 'admin' ? 'Admin' : acc.role === 'owner' ? 'Owner' : 'Caretaker';
                const fullName = `${acc.first_name || ''} ${acc.last_name || ''}`.trim() || acc.email;
                const statusTag = acc.is_active === false ? ' [Suspended]' : '';
                return (
                  <option key={acc.id} value={acc.id}>
                    {fullName} ({acc.email}) — {roleLabel}{statusTag}
                  </option>
                );
              })}
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
                ? `Suspending ${suspendModal.email} will immediately revoke their active sessions, terminate mobile access, and display the suspension notice with support appeal link.`
                : `Reactivating ${suspendModal.email} will restore their login access immediately.`}
            </p>

            {suspendModal.is_active && (
              <div style={{ marginTop: 12, textAlign: 'left' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  Select Guideline Conflict / Preset Reason:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {[
                    'Terms of Service: Community guidelines conflict',
                    'Suspicious Activity: Unauthorized automated access detected',
                    'Billing Discrepancy: Subscription payment under administrative review',
                    'Farm Owner Request: Disciplinary hold or membership revoked',
                    'Security Audit: Verification required before account reactivation'
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="preset-reason-btn"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11.5px',
                        borderRadius: '16px',
                        background: suspendReason === preset ? 'rgba(234, 179, 8, 0.2)' : 'var(--bg-input)',
                        border: `1px solid ${suspendReason === preset ? 'var(--accent-amber)' : 'var(--border)'}`,
                        color: suspendReason === preset ? 'var(--accent-amber)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onClick={() => setSuspendReason(preset)}
                    >
                      {preset.split(':')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-field" style={{ textAlign: 'left' }}>
              <label>Reason for Action (Visible to User in Support / Appeal & Recorded in Audit Trail):</label>
              <textarea 
                rows={3} 
                className="admin-textarea"
                placeholder="e.g. Terms of Service: Community guidelines conflict. Please contact Customer Service to appeal."
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

      {/* ─── MODAL 4: ACCOUNT APPEALS REVIEW ───────────────────────── */}
      {appealsModal && (
        <div className="admin-modal-backdrop" onClick={() => setAppealsModal(false)}>
          <div className="admin-modal-card" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(234, 179, 8, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldAlert size={20} color="var(--accent-amber)" />
                </div>
                <div>
                  <h2 className="modal-title" style={{ margin: 0 }}>Account Suspension Appeals</h2>
                  <p className="modal-desc" style={{ margin: 0, fontSize: '0.82rem' }}>
                    Review user defenses, inspect guideline violations, and approve or dismiss appeals.
                  </p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setAppealsModal(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: 16 }}>
              {appealsLoading ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                  Loading appeals list...
                </div>
              ) : appeals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <CheckCircle2 size={36} color="var(--accent-green)" style={{ margin: '0 auto 12px' }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>No appeals submitted yet</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                    When a suspended user files an appeal through the mobile app, it will appear here.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {appeals.map(appeal => (
                    <div 
                      key={appeal.id} 
                      style={{ 
                        background: 'var(--bg-input)', 
                        border: '1px solid var(--border)', 
                        borderRadius: 8, 
                        padding: 14 
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{appeal.user_name}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginLeft: 8 }}>({appeal.user_email})</span>
                        </div>
                        <span 
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 12,
                            textTransform: 'uppercase',
                            background: appeal.status === 'pending' ? 'rgba(234, 179, 8, 0.15)' : appeal.status === 'approved' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: appeal.status === 'pending' ? 'var(--accent-amber)' : appeal.status === 'approved' ? 'var(--accent-green)' : 'var(--accent-red)'
                          }}
                        >
                          {appeal.status}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.82rem', marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Suspension Reason: </span>
                        <span style={{ color: 'var(--accent-amber)' }}>{appeal.suspension_reason || 'Administrative hold'}</span>
                      </div>

                      <div style={{ background: 'var(--bg-card)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 10 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                          USER APPEAL STATEMENT:
                        </div>
                        "{appeal.appeal_message}"
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <span>Submitted on {new Date(appeal.created_at).toLocaleString()}</span>
                        {appeal.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              className="admin-btn primary"
                              style={{ padding: '4px 12px', fontSize: '0.78rem' }}
                              onClick={() => handleAppealAction(appeal.id, 'approve')}
                            >
                              <UserCheck size={13} />
                              <span>Approve & Lift Suspension</span>
                            </button>
                            <button
                              type="button"
                              className="admin-btn secondary"
                              style={{ padding: '4px 12px', fontSize: '0.78rem', color: 'var(--accent-red)' }}
                              onClick={() => handleAppealAction(appeal.id, 'reject')}
                            >
                              <XCircle size={13} />
                              <span>Dismiss Appeal</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-actions-row" style={{ marginTop: 16 }}>
              <button type="button" className="admin-btn secondary" onClick={() => setAppealsModal(false)}>
                Close
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

                {/* Portal Link Box */}
                <div style={{ background: 'var(--bg-secondary, #1e293b)', padding: 14, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16 }}>
                  <label style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                    Admin Sign-In Portal URL
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, padding: '10px 12px', background: 'var(--bg-panel, #0f172a)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                      https://clucko-app.vercel.app/admin/login?portal=admin
                    </span>
                    <button
                      type="button"
                      className="admin-btn secondary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => copyToClipboard('https://clucko-app.vercel.app/admin/login?portal=admin')}
                    >
                      <Copy size={13} /> Copy URL
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
                    const inviteMsg = `🐣 Clucko Platform Administration Invitation\nYou have been invited as an Administrator on Clucko.\n\nAdmin Portal: https://clucko-app.vercel.app/admin/login?portal=admin\nEmail: ${createdAccountResult.email}\nTemporary Password: ${createdAccountResult.temporary_password}\n\nPlease sign in and set your new password immediately.`;
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
