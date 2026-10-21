import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  CreditCard, Search, Filter, Download, RefreshCw, 
  RotateCcw, ShieldCheck, ChevronLeft, ChevronRight, 
  AlertCircle, CheckCircle2, DollarSign, Calendar, 
  HelpCircle, Check, X, Award, Clock, FileSpreadsheet,
  UserCheck, Inbox, MessageSquare, Eye, CheckSquare, Square, Layers, Sparkles
} from 'lucide-react';
import { SkeletonTableRows } from '../components/SkeletonLoader';
import './AdminSubscriptionsPage.css';

export default function AdminSubscriptionsPage() {
  const [activeTab, setActiveTab] = useState('subscriptions'); // 'subscriptions' | 'refund_requests' | 'transactions'

  // Transactions State
  const [transactions, setTransactions] = useState([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txPages, setTxPages] = useState(1);
  const [txLimit, setTxLimit] = useState(15);
  const [txStatusFilter, setTxStatusFilter] = useState('all');
  const [txCustomerFilter, setTxCustomerFilter] = useState('all');
  const [customersList, setCustomersList] = useState([]);
  const [txSearch, setTxSearch] = useState('');
  const [txSummary, setTxSummary] = useState({ total_paid: 0, total_refunded: 0, paid_count: 0, refund_count: 0 });
  const [loadingTx, setLoadingTx] = useState(true);
  const [verifyingTxId, setVerifyingTxId] = useState(null);
  const [cancellingTxId, setCancellingTxId] = useState(null);

  // Void / Cancel Stale Pending Transaction
  const handleCancelPending = async (txId) => {
    if (!window.confirm(`Are you sure you want to cancel and void pending transaction #${txId}? This will mark it as an abandoned expired session in the ledger.`)) {
      return;
    }
    setCancellingTxId(txId);
    try {
      const res = await axios.post(`/api/admin/transactions/${txId}/cancel-pending`, {
        reason: 'Abandoned Checkout (Expired Session)'
      });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchTransactions();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel transaction');
    } finally {
      setCancellingTxId(null);
    }
  };

  // Refund Requests State (Tab 2)
  const [refundRequests, setRefundRequests] = useState([]);
  const [refundAccountFilter, setRefundAccountFilter] = useState('all');
  const [refundAccountsList, setRefundAccountsList] = useState([]);
  const [pendingRefundCount, setPendingRefundCount] = useState(0);
  const [loadingRefunds, setLoadingRefunds] = useState(false);
  const [refundFilter, setRefundFilter] = useState('all');
  const [reviewModalReq, setReviewModalReq] = useState(null);
  const [reviewAction, setReviewAction] = useState('approve'); // 'approve' | 'reject'
  const [reviewNotes, setReviewNotes] = useState('');
  const [processingReview, setProcessingReview] = useState(false);
  const [reviewPurchases, setReviewPurchases] = useState([]);
  const [loadingReviewPurchases, setLoadingReviewPurchases] = useState(false);
  const [selectedTargetTxId, setSelectedTargetTxId] = useState(null);

  // Subscriptions State (Tab 3)
  const [subscriptions, setSubscriptions] = useState([]);
  const [subAccountFilter, setSubAccountFilter] = useState('all');
  const [subAccountsList, setSubAccountsList] = useState([]);
  const [subTotal, setSubTotal] = useState(0);
  const [subPage, setSubPage] = useState(1);
  const [subPages, setSubPages] = useState(1);
  const [subLimit, setSubLimit] = useState(15);
  const [subPlanFilter, setSubPlanFilter] = useState('all');
  const [subStatusFilter, setSubStatusFilter] = useState('all');
  const [subSearch, setSubSearch] = useState('');
  const [loadingSub, setLoadingSub] = useState(false);

  // Direct Refund Modal State (from transaction row)
  const [refundModalTx, setRefundModalTx] = useState(null);
  const [refundReason, setRefundReason] = useState('');
  const [revertPlan, setRevertPlan] = useState(true);
  const [processingRefund, setProcessingRefund] = useState(false);

  // Itemized Purchases & Selective Refund Modal State (Account Management)
  const [managePurchasesModal, setManagePurchasesModal] = useState(null);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState([]);
  const [purchaseRefundTarget, setPurchaseRefundTarget] = useState(null);
  const [purchaseRefundReason, setPurchaseRefundReason] = useState('');
  const [processingPurchaseRefund, setProcessingPurchaseRefund] = useState(false);
  const [managePurchasesTab, setManagePurchasesTab] = useState('purchases'); // 'purchases' | 'adjust'

  // Adjust Plan Modal State
  const [adjustSubModal, setAdjustSubModal] = useState(null);
  const [adjustPlan, setAdjustPlan] = useState('pro');
  const [adjustDays, setAdjustDays] = useState(30);
  const [adjustReason, setAdjustReason] = useState('');
  const [processingAdjust, setProcessingAdjust] = useState(false);

  // Helper: Format DateTime to Philippine Standard Time (PHT, UTC+8)
  const formatPhtDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const hasTz = dateStr.endsWith('Z') || dateStr.includes('+') || (dateStr.includes('-') && dateStr.lastIndexOf('-') > 10);
      const parseStr = hasTz ? dateStr : `${dateStr}Z`;
      const d = new Date(parseStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleString('en-US', {
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

  // Fetch Transactions
  const fetchTransactions = async () => {
    setLoadingTx(true);
    try {
      const res = await axios.get('/api/admin/transactions', {
        params: {
          page: txPage,
          limit: txLimit,
          status: txStatusFilter,
          customer: txCustomerFilter,
          search: txSearch
        }
      });
      if (res.data && res.data.success) {
        setTransactions(res.data.transactions || []);
        setTxTotal(res.data.total || 0);
        setTxPages(res.data.pages || 1);
        if (res.data.accounts) {
          setCustomersList(res.data.accounts);
        } else if (res.data.customers) {
          setCustomersList(res.data.customers);
        }
        if (res.data.summary) setTxSummary(res.data.summary);
      }
    } catch (err) {
      console.warn('Silent note: Transactions ledger fetch error (server warming up?):', err?.message);
    } finally {
      setLoadingTx(false);
    }
  };

  // Fetch Refund Requests
  const fetchRefundRequests = async () => {
    setLoadingRefunds(true);
    try {
      const res = await axios.get('/api/admin/refund-requests');
      if (res.data && res.data.success) {
        setRefundRequests(res.data.requests || []);
        if (res.data.accounts) {
          setRefundAccountsList(res.data.accounts);
        }
        const pending = (res.data.requests || []).filter(r => r.status === 'pending').length;
        setPendingRefundCount(pending);
      }
    } catch (err) {
      console.warn('Silent note: Refund requests fetch error (server warming up?):', err?.message);
    } finally {
      setLoadingRefunds(false);
    }
  };

  // Fetch Subscriptions
  const fetchSubscriptions = async () => {
    setLoadingSub(true);
    try {
      const res = await axios.get('/api/admin/subscriptions', {
        params: {
          page: subPage,
          limit: subLimit,
          plan: subPlanFilter,
          status: subStatusFilter,
          account: subAccountFilter,
          search: subSearch
        }
      });
      if (res.data && res.data.success) {
        setSubscriptions(res.data.subscriptions || []);
        if (res.data.accounts) {
          setSubAccountsList(res.data.accounts);
        }
        setSubTotal(res.data.total || 0);
        setSubPages(res.data.pages || 1);
      }
    } catch (err) {
      console.warn('Silent note: Subscriptions fetch error (server warming up?):', err?.message);
    } finally {
      setLoadingSub(false);
    }
  };

  // Verify PayMongo Gateway Status for Pending GCash Transaction
  const handleVerifyPaymongo = async (txId) => {
    setVerifyingTxId(txId);
    try {
      const res = await axios.post(`/api/admin/transactions/${txId}/verify-paymongo`);
      if (res.data.success) {
        if (res.data.paid) {
          toast.success(res.data.message || 'Payment confirmed by PayMongo and plan activated!');
          fetchTransactions();
          fetchSubscriptions();
        } else {
          toast(res.data.message || 'Payment is still awaiting GCash completion.', { icon: 'ℹ️' });
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to verify transaction with PayMongo');
    } finally {
      setVerifyingTxId(null);
    }
  };

  // Initial load
  useEffect(() => {
    fetchRefundRequests();
    fetchTransactions();
  }, []);

  useEffect(() => {
    if (activeTab === 'transactions') {
      fetchTransactions();
    } else if (activeTab === 'refund_requests') {
      fetchRefundRequests();
    } else {
      fetchSubscriptions();
    }
  }, [activeTab, txPage, txLimit, txStatusFilter, txCustomerFilter, subPage, subLimit, subPlanFilter, subStatusFilter, subAccountFilter]);

  // Debounced search for transactions
  useEffect(() => {
    if (activeTab !== 'transactions') return;
    const timer = setTimeout(() => {
      setTxPage(1);
      fetchTransactions();
    }, 350);
    return () => clearTimeout(timer);
  }, [txSearch]);

  // Debounced search for subscriptions
  useEffect(() => {
    if (activeTab !== 'subscriptions') return;
    const timer = setTimeout(() => {
      setSubPage(1);
      fetchSubscriptions();
    }, 350);
    return () => clearTimeout(timer);
  }, [subSearch]);

  // Export Transactions Ledger to BIR-Standard Excel CSV
  const handleExportExcelTransactions = async () => {
    const toastId = toast.loading('Exporting BIR-Standard Revenue Ledger to Excel CSV...');
    try {
      const res = await axios.get('/api/admin/transactions/export', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `clucko_bir_revenue_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('BIR-standard Excel spreadsheet (.csv) downloaded successfully!', { id: toastId });
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export transactions ledger', { id: toastId });
    }
  };

  // Direct Refund from Transactions Row
  const handleConfirmRefund = async () => {
    if (!refundModalTx) return;
    if (!refundReason.trim()) {
      toast.error('Please specify a refund reason for auditing');
      return;
    }
    setProcessingRefund(true);
    try {
      const res = await axios.post(`/api/admin/transactions/${refundModalTx.id}/refund`, {
        reason: refundReason,
        revert_plan: revertPlan
      });
      if (res.data.success) {
        toast.success(res.data.message);
        setRefundModalTx(null);
        setRefundReason('');
        fetchTransactions();
        fetchRefundRequests();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Refund failed');
    } finally {
      setProcessingRefund(false);
    }
  };

  // Open Manage Purchases Modal
  const handleOpenManagePurchases = async (userId) => {
    setManagePurchasesModal({ userId, loading: true, data: null });
    setSelectedPurchaseIds([]);
    setPurchaseRefundTarget(null);
    setPurchaseRefundReason('');
    setManagePurchasesTab('purchases');
    try {
      const res = await axios.get(`/api/admin/subscriptions/${userId}/purchases`);
      if (res.data && res.data.success) {
        setManagePurchasesModal({
          userId,
          loading: false,
          data: res.data
        });
        setAdjustPlan(res.data.user.current_plan || 'pro');
        setAdjustDays(30);
        setAdjustReason('');
      }
    } catch (err) {
      console.error('Failed to load purchases:', err);
      toast.error('Failed to load account purchase history');
      setManagePurchasesModal(null);
    }
  };

  // Toggle selection for selective purchase refund
  const handleToggleSelectPurchase = (txId) => {
    if (selectedPurchaseIds.includes(txId)) {
      setSelectedPurchaseIds(selectedPurchaseIds.filter(id => id !== txId));
    } else {
      setSelectedPurchaseIds([...selectedPurchaseIds, txId]);
    }
  };

  // Select all eligible paid purchases
  const handleSelectAllPaidPurchases = (paidTxs) => {
    const paidIds = paidTxs.map(t => t.id);
    if (selectedPurchaseIds.length === paidIds.length) {
      setSelectedPurchaseIds([]);
    } else {
      setSelectedPurchaseIds(paidIds);
    }
  };

  // Prompt purchase refund
  const handlePromptRefundPurchase = (txOrBatch) => {
    setPurchaseRefundTarget(txOrBatch);
    setPurchaseRefundReason(txOrBatch === 'batch' ? 'Batch Refund by Admin' : 'Accidental Purchase / Cancelled per user request');
  };

  // Execute purchase refund
  const handleExecutePurchaseRefund = async () => {
    if (!managePurchasesModal?.userId) return;
    if (!purchaseRefundReason.trim()) {
      toast.error('Please specify a refund justification reason');
      return;
    }

    let idsToRefund = [];
    if (purchaseRefundTarget === 'batch') {
      idsToRefund = selectedPurchaseIds;
    } else if (purchaseRefundTarget && purchaseRefundTarget.id) {
      idsToRefund = [purchaseRefundTarget.id];
    }

    if (idsToRefund.length === 0) {
      toast.error('No transactions selected for refund');
      return;
    }

    setProcessingPurchaseRefund(true);
    try {
      const res = await axios.post(`/api/admin/subscriptions/${managePurchasesModal.userId}/refund-purchase`, {
        transaction_ids: idsToRefund,
        reason: purchaseRefundReason
      });

      if (res.data.success) {
        toast.success(res.data.message);
        setPurchaseRefundTarget(null);
        setSelectedPurchaseIds([]);
        setPurchaseRefundReason('');
        // Reload purchases modal data
        const refreshRes = await axios.get(`/api/admin/subscriptions/${managePurchasesModal.userId}/purchases`);
        if (refreshRes.data.success) {
          setManagePurchasesModal(prev => ({
            ...prev,
            loading: false,
            data: refreshRes.data
          }));
        }
        fetchSubscriptions();
        fetchTransactions();
        fetchRefundRequests();
      }
    } catch (err) {
      console.error('Refund purchase error:', err);
      toast.error(err.response?.data?.error || 'Failed to process purchase refund');
    } finally {
      setProcessingPurchaseRefund(false);
    }
  };

  // Execute Review on Owner Refund Request
  const handleConfirmReview = async () => {
    if (!reviewModalReq) return;
    if (reviewAction === 'reject' && !reviewNotes.trim()) {
      toast.error('Please specify a rejection reason to clearly notify the owner');
      return;
    }
    setProcessingReview(true);
    try {
      const res = await axios.post(`/api/admin/refund-requests/${reviewModalReq.id}/review`, {
        action: reviewAction,
        admin_notes: reviewNotes,
        transaction_id: selectedTargetTxId || reviewModalReq.transaction_id
      });
      if (res.data.success) {
        toast.success(res.data.message);
        setReviewModalReq(null);
        setReviewNotes('');
        setSelectedTargetTxId(null);
        fetchRefundRequests();
        fetchTransactions();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Review submission failed');
    } finally {
      setProcessingReview(false);
    }
  };

  // Execute Adjust Plan
  const handleConfirmAdjust = async () => {
    if (!adjustSubModal) return;
    setProcessingAdjust(true);
    try {
      const res = await axios.post(`/api/admin/subscriptions/${adjustSubModal.user_id}/adjust`, {
        plan: adjustPlan,
        duration_days: adjustDays,
        reason: adjustReason || 'Admin grant'
      });
      if (res.data.success) {
        toast.success(res.data.message);
        setAdjustSubModal(null);
        fetchSubscriptions();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Plan adjustment failed');
    } finally {
      setProcessingAdjust(false);
    }
  };

  // Open review modal with itemized purchases
  const handleOpenReviewModal = async (req, action) => {
    setReviewModalReq(req);
    setReviewAction(action);
    setReviewNotes('');
    setReviewPurchases([]);
    setSelectedTargetTxId(req.transaction_id);
    if (action === 'approve') {
      setLoadingReviewPurchases(true);
      try {
        const res = await axios.get(`/api/admin/subscriptions/${req.user_id}/purchases`);
        if (res.data && res.data.success) {
          const list = res.data.purchases || [];
          setReviewPurchases(list);
          const reqTx = list.find(p => p.id === req.transaction_id);
          if (reqTx && reqTx.status === 'paid' && reqTx.is_within_grace) {
            setSelectedTargetTxId(reqTx.id);
          } else {
            const firstEligible = list.find(p => p.status === 'paid' && p.is_within_grace);
            if (firstEligible) {
              setSelectedTargetTxId(firstEligible.id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load owner purchases for approval review:', err);
      } finally {
        setLoadingReviewPurchases(false);
      }
    }
  };

  // Filtered refund requests for Tab 2
  const filteredRefundRequests = refundRequests.filter(req => {
    if (refundFilter !== 'all' && req.status !== refundFilter) return false;
    if (refundAccountFilter !== 'all' && String(req.user_id) !== String(refundAccountFilter)) return false;
    return true;
  });

  return (
    <div className="admin-subs-container">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <div className="breadcrumb-row">
            <span className="crumb-root">Platform Administration</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">Subscriptions & Billing</span>
          </div>
          <h1 className="admin-page-title">Billing & Subscription Management</h1>
          <p className="admin-page-sub">
            Monitor revenue intake, active account tiers, payment transactions, and review owner refund requests.
          </p>
        </div>
        <div className="admin-header-actions">
          <button 
            type="button"
            onClick={handleExportExcelTransactions} 
            className="admin-btn secondary"
            title="Download full BIR-compliant transaction ledger formatted for Microsoft Excel"
          >
            <FileSpreadsheet size={15} />
            <span>Export to Excel (CSV)</span>
          </button>
        </div>
      </div>

      {/* Financial Health Summary Cards */}
      <div className="billing-summary-strip">
        <div className="billing-metric-card">
          <span className="metric-label">Total Payment Volume (TPV)</span>
          <span className="metric-val text-emerald">
            ₱{txSummary.total_paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <span className="metric-sub">{txSummary.paid_count} completed payments</span>
        </div>

        <div className="billing-metric-card">
          <span className="metric-label">Total Refunded Amount</span>
          <span className="metric-val text-red">
            ₱{txSummary.total_refunded.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <span className="metric-sub">{txSummary.refund_count} refunds processed</span>
        </div>

        <div className="billing-metric-card">
          <span className="metric-label">Net Revenue</span>
          <span className="metric-val text-white">
            ₱{(Math.max(0, txSummary.total_paid - txSummary.total_refunded)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <span className="metric-sub">Total revenue after refund reconciliation</span>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="subs-tabs-bar">
        <button 
          className={`tab-btn ${activeTab === 'subscriptions' ? 'active' : ''}`}
          onClick={() => setActiveTab('subscriptions')}
        >
          <Award size={15} />
          <span>Active Subscriptions ({subTotal})</span>
        </button>

        <button 
          className={`tab-btn ${activeTab === 'refund_requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('refund_requests')}
        >
          <RotateCcw size={15} />
          <span>Owner Refund Requests</span>
          {pendingRefundCount > 0 && (
            <span className="tab-pending-pill">{pendingRefundCount} pending</span>
          )}
        </button>

        <button 
          className={`tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          <CreditCard size={15} />
          <span>Payment Transactions ({txTotal})</span>
        </button>
      </div>

      {/* ═══════════ TAB 1: ACTIVE SUBSCRIPTIONS ═══════════ */}
      {activeTab === 'subscriptions' && (
        <div className="tab-view-content animate-in">
          {/* Controls */}
          <div className="admin-filter-bar">
            <div className="search-input-wrap">
              <Search size={16} className="search-icon" />
              <input 
                type="text"
                className="search-input"
                placeholder="Search name or email..."
                autoComplete="off"
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
              />
              {subSearch && (
                <button className="search-clear-btn" onClick={() => setSubSearch('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="filters-group">
              <div className="filter-select-wrap">
                <label className="filter-label">Tier:</label>
                <select 
                  value={subPlanFilter} 
                  onChange={(e) => { setSubPlanFilter(e.target.value); setSubPage(1); }}
                  className="filter-select"
                >
                  <option value="all">All Tiers</option>
                  <option value="premium">Premium Tier</option>
                  <option value="pro">Pro Tier</option>
                  <option value="free_trial">Free Trial</option>
                  <option value="free">Standard Free</option>
                </select>
              </div>

              <div className="filter-select-wrap">
                <label className="filter-label">Status:</label>
                <select 
                  value={subStatusFilter} 
                  onChange={(e) => { setSubStatusFilter(e.target.value); setSubPage(1); }}
                  className="filter-select"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="grace_period">In Grace Period</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>
          </div>

          {/* Subscriptions Table */}
          <div className="admin-panel table-panel">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Current Plan</th>
                    <th>Status</th>
                    <th>Subscription Period</th>
                    <th>Plan Limits</th>
                    <th>Farm & Bird Usage</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingSub ? (
                    <SkeletonTableRows rows={6} cols={7} />
                  ) : subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="table-empty">
                        No subscription records found.
                      </td>
                    </tr>
                  ) : (
                    subscriptions.map(sub => {
                      const isExpired = sub.end_date && new Date(sub.end_date) < new Date();
                      return (
                        <tr key={sub.id}>
                          <td>
                            <div className="customer-cell">
                              <span className="customer-name">{sub.user_name}</span>
                              <span className="customer-email">{sub.email}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge-plan ${sub.plan}`}>{sub.plan?.toUpperCase()}</span>
                          </td>
                          <td>
                            {sub.status === 'active' && !isExpired && (
                              <span className="status-badge active">ACTIVE</span>
                            )}
                            {sub.status === 'active' && isExpired && (
                              <span className="status-badge pending">GRACE PERIOD</span>
                            )}
                            {sub.status === 'expired' && (
                              <span className="status-badge suspended">EXPIRED</span>
                            )}
                          </td>
                          <td>
                            <div className="dates-col">
                              <span>Expires: <strong>{sub.end_date ? new Date(sub.end_date).toLocaleDateString() : '—'}</strong></span>
                              <span className="dates-sub">Paid: ₱{Number(sub.price_paid || 0).toLocaleString()}</span>
                            </div>
                          </td>
                          <td>
                            <div className="quota-col">
                              <span>Farms: {sub.max_farms >= 999999 ? 'Unlimited' : sub.max_farms}</span>
                              <span>Chickens/Farm: {sub.max_chickens_per_farm >= 999999 ? 'Unlimited' : sub.max_chickens_per_farm}</span>
                              <span>Scans: {sub.max_captures >= 999999 ? 'Unlimited' : sub.max_captures}</span>
                            </div>
                          </td>
                          <td>
                            <div className="usage-stats-cell">
                              <span>{sub.farms_count || 0} farms created</span>
                              <span>• {sub.chickens_count || 0} chickens</span>
                              <span>• {sub.captures_used || 0} scans used</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                              <button 
                                className="admin-btn primary btn-xs"
                                title="View itemized purchase history, check grace period eligibility, and manage account purchases"
                                onClick={() => handleOpenManagePurchases(sub.user_id)}
                              >
                                <Eye size={13} />
                                <span>View / Adjust</span>
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

            {/* Pagination */}
            <div className="table-pagination-footer">
              <div className="pagination-info">
                Showing <strong>{subscriptions.length > 0 ? (subPage - 1) * subLimit + 1 : 0}</strong> to{' '}
                <strong>{Math.min(subPage * subLimit, subTotal)}</strong> of <strong>{subTotal}</strong> subscribers
              </div>
              <div className="pagination-controls">
                <button 
                  className="page-nav-btn"
                  disabled={subPage <= 1}
                  onClick={() => setSubPage(subPage - 1)}
                >
                  <ChevronLeft size={16} />
                  <span>Previous</span>
                </button>
                <span className="page-current-display">
                  Page {subPage} of {subPages}
                </span>
                <button 
                  className="page-nav-btn"
                  disabled={subPage >= subPages}
                  onClick={() => setSubPage(subPage + 1)}
                >
                  <span>Next</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ TAB 2: OWNER REFUND REQUESTS ═══════════ */}
      {activeTab === 'refund_requests' && (
        <div className="tab-view-content animate-in">
          {/* Controls */}
          <div className="admin-filter-bar">
            <div className="refund-tab-intro">
              <MessageSquare size={16} className="text-emerald" />
              <span>
                Review formal refund requests submitted by farm owners from the Clucko mobile app. Approving a request processes the refund, reverts the account to the Free tier, and sends a notification.
              </span>
            </div>

            <div className="filters-group">
              <div className="filter-select-wrap">
                <label className="filter-label">Filter Status:</label>
                <select 
                  value={refundFilter} 
                  onChange={(e) => setRefundFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Requests ({refundRequests.length})</option>
                  <option value="pending">Pending Review ({pendingRefundCount})</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Declined</option>
                </select>
              </div>
            </div>
          </div>

          {/* Refund Requests Table */}
          <div className="admin-panel table-panel">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>REQ ID</th>
                    <th>Farm Owner</th>
                    <th>Tier & Amount</th>
                    <th>Reason / Details</th>
                    <th>Submitted (PHT)</th>
                    <th>Status</th>
                    <th>Admin Review Notes</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRefunds ? (
                    <SkeletonTableRows rows={5} cols={8} />
                  ) : filteredRefundRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="table-empty">
                        No owner refund requests found.
                      </td>
                    </tr>
                  ) : (
                    filteredRefundRequests.map(req => (
                      <tr key={req.id}>
                        <td className="font-mono text-muted">#RR-{req.id}</td>
                        <td>
                          <div className="customer-cell">
                            <span className="customer-name">{req.customer_name || 'Owner'}</span>
                            <span className="customer-email">{req.customer_email || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="amount-col">
                            <span className={`badge-plan ${req.plan}`}>{req.plan?.toUpperCase()}</span>
                            <span className="font-mono font-bold mt-1">
                              ₱{Number(req.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="refund-particulars-cell">
                            <strong className="text-white text-xs">{req.reason}</strong>
                            {req.details ? (
                              <p className="refund-particulars-detail text-muted text-xs">
                                "{req.details}"
                              </p>
                            ) : (
                              <span className="text-muted text-xs italic">No additional note provided</span>
                            )}
                          </div>
                        </td>
                        <td className="text-sm text-secondary font-mono">
                          {formatPhtDateTime(req.created_at)}
                        </td>
                        <td>
                          {req.status === 'pending' && (
                            <span className="status-badge pending">PENDING REVIEW</span>
                          )}
                          {req.status === 'approved' && (
                            <span className="status-badge active">APPROVED & REFUNDED</span>
                          )}
                          {req.status === 'rejected' && (
                            <span className="status-badge suspended">DECLINED</span>
                          )}
                        </td>
                        <td>
                          {req.admin_notes ? (
                            <div className="admin-notes-cell">
                              <span className="text-xs text-secondary">{req.admin_notes}</span>
                              <span className="text-2xs text-muted font-mono">{formatPhtDateTime(req.reviewed_at)}</span>
                            </div>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {req.status === 'pending' ? (
                            <div className="refund-request-actions">
                              <button 
                                className="admin-btn primary btn-xs"
                                title="Review owner purchase ledger and approve refund"
                                onClick={() => handleOpenReviewModal(req, 'approve')}
                              >
                                <Check size={13} />
                                <span>Approve</span>
                              </button>
                              <button 
                                className="admin-btn danger btn-xs"
                                title="Decline refund request with reason"
                                onClick={() => handleOpenReviewModal(req, 'reject')}
                              >
                                <X size={13} />
                                <span>Decline</span>
                              </button>
                            </div>
                          ) : (
                            <span className="refund-processed-label">
                              {req.status === 'approved' ? 'Resolved' : 'Closed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ TAB 3: PAYMENT TRANSACTIONS & REFUNDS ═══════════ */}
      {activeTab === 'transactions' && (
        <div className="tab-view-content animate-in">
          {/* Controls */}
          <div className="admin-filter-bar">
            <div className="search-input-wrap">
              <Search size={16} className="search-icon" />
              <input 
                type="text"
                className="search-input"
                placeholder="Search customer, email, session..."
                autoComplete="off"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
              />
              {txSearch && (
                <button className="search-clear-btn" onClick={() => setTxSearch('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="filters-group">
              <div className="filter-select-wrap">
                <label className="filter-label">Status:</label>
                <select 
                  value={txStatusFilter} 
                  onChange={(e) => { setTxStatusFilter(e.target.value); setTxPage(1); }}
                  className="filter-select"
                >
                  <option value="all">All Statuses</option>
                  <option value="paid">Paid (Eligible for Refund)</option>
                  <option value="refunded">Refunded</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled / Expired</option>
                </select>
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="admin-panel table-panel">
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
                    <th>Date & Time (PHT)</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingTx ? (
                    <SkeletonTableRows rows={6} cols={7} />
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="table-empty">
                        No transactions found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    transactions.map(tx => (
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
                        <td>
                          <div className="amount-col">
                            <span className="font-mono font-bold">
                              ₱{Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            {tx.refund_amount && (
                              <span className="refund-amount-sub">
                                (-₱{Number(tx.refund_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })})
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="gateway-cell">
                            <span className="gateway-name">{tx.payment_gateway?.toUpperCase()}</span>
                            {tx.payment_method && <span className="gateway-method">({tx.payment_method})</span>}
                          </div>
                        </td>
                        <td>
                          {tx.status === 'paid' && (
                            <span className="status-badge active">PAID</span>
                          )}
                          {tx.status === 'refunded' && (
                            <div className="refund-badge-col">
                              <span className="status-badge refunded">REFUNDED</span>
                              {tx.refund_reason && (
                                <span className="refund-reason-sub" title={tx.refund_reason}>
                                  {tx.refund_reason}
                                </span>
                              )}
                            </div>
                          )}
                          {(tx.status === 'cancelled' || tx.status === 'failed') && (
                            <div className="refund-badge-col">
                              <span className="status-badge cancelled" title={tx.refund_reason || 'Checkout session expired or abandoned by customer'}>
                                {tx.status === 'cancelled' ? 'CANCELLED' : 'FAILED'}
                              </span>
                              {tx.refund_reason && (
                                <span className="refund-reason-sub" title={tx.refund_reason}>
                                  {tx.refund_reason}
                                </span>
                              )}
                            </div>
                          )}
                          {tx.status === 'pending' && (
                            <div className="pending-badge-wrap">
                              <span className="status-badge pending">PENDING</span>
                              <span className="pending-info-sub" title="Account initiated checkout but abandoned before finalizing GCash OTP">Awaiting GCash</span>
                              {tx.payment_gateway === 'paymongo' && (
                                <button
                                  type="button"
                                  className="verify-gateway-btn"
                                  title="Query PayMongo to check if GCash payment was actually completed"
                                  disabled={verifyingTxId === tx.id}
                                  onClick={() => handleVerifyPaymongo(tx.id)}
                                >
                                  {verifyingTxId === tx.id ? (
                                    <span className="spinner-mini" style={{ width: 10, height: 10 }} />
                                  ) : (
                                    <>
                                      <RefreshCw size={11} />
                                      <span>Verify Gateway</span>
                                    </>
                                  )}
                                </button>
                              )}
                              <button
                                type="button"
                                className="void-pending-btn"
                                title="Void or cancel abandoned checkout session"
                                disabled={cancellingTxId === tx.id}
                                onClick={() => handleCancelPending(tx.id)}
                              >
                                {cancellingTxId === tx.id ? (
                                  <span className="spinner-mini" style={{ width: 9, height: 9 }} />
                                ) : (
                                  <>
                                    <X size={10} />
                                    <span>Void / Expire</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="text-sm text-secondary font-mono">
                          {formatPhtDateTime(tx.created_at)}
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
                Showing <strong>{transactions.length > 0 ? (txPage - 1) * txLimit + 1 : 0}</strong> to{' '}
                <strong>{Math.min(txPage * txLimit, txTotal)}</strong> of <strong>{txTotal}</strong> transactions
              </div>
              <div className="pagination-controls">
                <button 
                  className="page-nav-btn"
                  disabled={txPage <= 1}
                  onClick={() => setTxPage(txPage - 1)}
                >
                  <ChevronLeft size={16} />
                  <span>Previous</span>
                </button>
                <span className="page-current-display">
                  Page {txPage} of {txPages}
                </span>
                <button 
                  className="page-nav-btn"
                  disabled={txPage >= txPages}
                  onClick={() => setTxPage(txPage + 1)}
                >
                  <span>Next</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── REVIEW REFUND REQUEST MODAL (Tab 2) ───────────────────────────── */}
      {/* ─── REVIEW REFUND REQUEST MODAL (Tab 2) ───────────────────────────── */}
      {reviewModalReq && (() => {
        const currentTargetTx = reviewPurchases.find(p => p.id === selectedTargetTxId) || 
                                reviewPurchases.find(p => p.id === reviewModalReq.transaction_id) || 
                                { id: reviewModalReq.transaction_id, amount: reviewModalReq.amount, plan: reviewModalReq.plan, is_within_grace: true };
        const isTargetExpired = currentTargetTx && !currentTargetTx.is_within_grace;

        return (
          <div className="admin-modal-backdrop" onClick={() => !processingReview && setReviewModalReq(null)}>
            <div className={`admin-modal-card refund-modal-card ${reviewAction === 'approve' ? 'review-approval-modal' : ''}`} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-row">
                  {reviewAction === 'approve' ? (
                    <CheckCircle2 size={18} color="var(--accent-green)" />
                  ) : (
                    <AlertCircle size={18} color="var(--accent-red)" />
                  )}
                  <h2 className="modal-title">
                    {reviewAction === 'approve' ? 'Approve & Execute Refund' : 'Decline Refund Request'}
                  </h2>
                </div>
                <button className="modal-close-btn" onClick={() => !processingReview && setReviewModalReq(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="refund-summary-box">
                <div className="summary-item">
                  <span className="summary-lbl">Request Reference:</span>
                  <span className="summary-val font-mono">#RR-{reviewModalReq.id}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-lbl">Farm Owner:</span>
                  <span className="summary-val">{reviewModalReq.customer_name} ({reviewModalReq.customer_email})</span>
                </div>
                <div className="summary-item">
                  <span className="summary-lbl">Selected Target TX:</span>
                  <span className="summary-val font-mono font-bold text-white">
                    #{currentTargetTx.id} ({currentTargetTx.plan?.toUpperCase()})
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-lbl">Customer Reason:</span>
                  <span className="summary-val text-white">{reviewModalReq.reason}</span>
                </div>
                {reviewModalReq.details && (
                  <div className="summary-item">
                    <span className="summary-lbl">Customer Notes:</span>
                    <span className="summary-val text-muted text-xs">"{reviewModalReq.details}"</span>
                  </div>
                )}
                <div className="summary-item highlight">
                  <span className="summary-lbl">Refund Total:</span>
                  <span className="summary-val font-bold text-emerald">
                    ₱{Number(currentTargetTx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {reviewAction === 'approve' ? (
                <div className="review-approval-body">
                  {/* Itemized Purchases Inspection & Selective Target Table */}
                  <div className="review-purchases-section mt-2">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Layers size={15} color="var(--accent-green)" />
                        <strong className="text-white text-xs uppercase tracking-wider">Owner Purchase Ledger & Selective Rollback Impact</strong>
                      </div>
                      <span className="text-muted text-xs font-mono">{reviewPurchases.length} total purchases</span>
                    </div>

                    {loadingReviewPurchases ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
                        <div className="spinner-large" style={{ width: 18, height: 18, margin: '0 auto 8px' }} />
                        Loading owner purchase history...
                      </div>
                    ) : reviewPurchases.length === 0 ? (
                      <div style={{ padding: '12px', color: '#9CA3AF', fontSize: '12.5px' }}>
                        No purchase records found for this account.
                      </div>
                    ) : (
                      <div className="purchases-table-wrap" style={{ maxHeight: 240, marginBottom: 12 }}>
                        <table className="admin-table itemized-table">
                          <thead>
                            <tr>
                              <th style={{ width: 44, textAlign: 'center' }}>Select</th>
                              <th>TX ID</th>
                              <th>Plan Tier</th>
                              <th>Amount</th>
                              <th>Purchase Date</th>
                              <th>Grace Period (7d)</th>
                              <th>Action Impact</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reviewPurchases.map(p => {
                              const isTarget = p.id === currentTargetTx.id;
                              const isEligible = p.status === 'paid' && p.is_within_grace;
                              const isExpiredGrace = p.status === 'paid' && !p.is_within_grace;
                              const isSettled = p.status === 'refunded';

                              return (
                                <tr 
                                  key={p.id} 
                                  onClick={() => {
                                    if (isEligible) {
                                      setSelectedTargetTxId(p.id);
                                    } else if (isExpiredGrace) {
                                      toast.error(`TX #${p.id} was purchased ${Math.floor(p.age_days)} days ago and is past the 7-day refund window.`);
                                    }
                                  }}
                                  style={{
                                    cursor: isEligible ? 'pointer' : 'not-allowed',
                                    opacity: isSettled ? 0.45 : isExpiredGrace ? 0.65 : 1,
                                    background: isTarget ? 'rgba(239, 68, 68, 0.18)' : undefined,
                                    borderLeft: isTarget ? '4px solid #EF4444' : undefined,
                                    transition: 'background 0.12s ease'
                                  }}
                                  title={
                                    isSettled 
                                      ? `TX #${p.id} already settled/refunded` 
                                      : isExpiredGrace 
                                        ? `Purchased ${Math.floor(p.age_days)} days ago. Past 7-day refund grace period - Non-refundable.` 
                                        : `Click to select TX #${p.id} as the refund target`
                                  }
                                >
                                  <td style={{ textAlign: 'center' }}>
                                    <input 
                                      type="radio"
                                      name="target_refund_tx"
                                      checked={isTarget}
                                      disabled={!isEligible}
                                      onChange={() => isEligible && setSelectedTargetTxId(p.id)}
                                      style={{ accentColor: '#EF4444', cursor: isEligible ? 'pointer' : 'not-allowed' }}
                                    />
                                  </td>
                                  <td className="font-mono text-muted">#{p.id}</td>
                                  <td>
                                    <span className={`badge-plan ${p.plan}`}>{p.plan?.toUpperCase()}</span>
                                  </td>
                                  <td>
                                    <span className="font-mono font-bold text-white">
                                      ₱{Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                  </td>
                                  <td className="text-xs font-mono text-secondary">
                                    {formatPhtDateTime(p.created_at)}
                                  </td>
                                  <td>
                                    {p.is_within_grace ? (
                                      <span className="grace-valid-pill">
                                        <Clock size={10} /> Eligible ({p.grace_days_left}d left)
                                      </span>
                                    ) : (
                                      <span className="grace-expired-pill" style={{ background: 'rgba(239, 68, 68, 0.14)', color: '#F87171', borderColor: 'rgba(239, 68, 68, 0.35)' }}>
                                        <AlertCircle size={10} /> Expired ({Math.floor(p.age_days)}d ago)
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {isTarget ? (
                                      <span className="status-badge refunded" style={{ fontWeight: 700 }}>
                                        ● TARGET TO REFUND
                                      </span>
                                    ) : isExpiredGrace ? (
                                      <span className="refund-processed-label text-xs" style={{ color: '#EF4444' }}>
                                        NON-REFUNDABLE (PAST 7D)
                                      </span>
                                    ) : p.status === 'paid' ? (
                                      <span className="status-badge active" style={{ cursor: 'pointer' }}>
                                        REMAINS ACTIVE (Click to Select)
                                      </span>
                                    ) : (
                                      <span className="refund-processed-label text-xs">Settled</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {isTargetExpired && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      borderRadius: '8px',
                      color: '#FCA5A5',
                      fontSize: '12.5px',
                      marginBottom: '12px'
                    }}>
                      <AlertCircle size={16} color="#EF4444" style={{ flexShrink: 0 }} />
                      <span>
                        <strong>Grace Period Expired:</strong> Transaction #{currentTargetTx.id} was purchased {Math.floor(currentTargetTx.age_days)} days ago and is past the 7-day refund window. Per platform policy, refunds cannot be issued for this purchase.
                      </span>
                    </div>
                  )}

                  <div className="refund-toggle-row">
                    <div className="text-sm font-semibold text-white">Selective Rollback Impact:</div>
                    <p className="toggle-sub" style={{ marginLeft: 0 }}>
                      • <strong>Selected Target Transaction #{currentTargetTx.id}</strong> (₱{Number(currentTargetTx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}) will be refunded.<br/>
                      • All other valid active purchases ({reviewPurchases.filter(p => p.status === 'paid' && p.id !== currentTargetTx.id).length}) will remain active, preserving the owner's plan tier and farm quotas.<br/>
                      • 7-Day Grace Period Policy: strictly verified prior to refund issuance.<br/>
                      • A formal notification will be dispatched to the owner's Clucko inbox.
                    </p>
                    <div className="form-field mt-2">
                      <label>Admin Note for Owner (Optional):</label>
                      <input 
                        type="text"
                        className="admin-input"
                        placeholder="e.g. Approved per 7-day satisfaction policy"
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="form-field">
                  <label className="text-red font-semibold">Decline Reason (Mandatory - will be sent to the owner):</label>
                  <textarea 
                    rows={3}
                    required
                    className="admin-textarea"
                    placeholder="e.g. Request submitted past the 7-day refund window or account quota has been fully utilized..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                </div>
              )}

              <div className="modal-actions-row">
                <button 
                  type="button" 
                  className="admin-btn secondary"
                  disabled={processingReview}
                  onClick={() => setReviewModalReq(null)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className={`admin-btn ${reviewAction === 'approve' ? 'primary' : 'danger'}`}
                  disabled={processingReview || (reviewAction === 'approve' && isTargetExpired)}
                  onClick={handleConfirmReview}
                  title={reviewAction === 'approve' && isTargetExpired ? 'Cannot issue refund: selected purchase has passed the 7-day grace period' : ''}
                >
                  {processingReview 
                    ? 'Processing...' 
                    : reviewAction === 'approve' 
                      ? `Confirm & Issue ₱${Number(currentTargetTx.amount).toLocaleString()}` 
                      : 'Decline Request'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── DIRECT REFUND MODAL (from transactions row) ─────────────────── */}
      {refundModalTx && (
        <div className="admin-modal-backdrop" onClick={() => !processingRefund && setRefundModalTx(null)}>
          <div className="admin-modal-card refund-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <RotateCcw size={18} color="var(--accent-red)" />
                <h2 className="modal-title">Process Subscription Refund</h2>
              </div>
              <button className="modal-close-btn" onClick={() => !processingRefund && setRefundModalTx(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="refund-summary-box">
              <div className="summary-item">
                <span className="summary-lbl">Transaction ID:</span>
                <span className="summary-val font-mono">#{refundModalTx.id}</span>
              </div>
              <div className="summary-item">
                <span className="summary-lbl">Account:</span>
                <span className="summary-val">{refundModalTx.user_name} ({refundModalTx.email})</span>
              </div>
              <div className="summary-item">
                <span className="summary-lbl">Plan Purchased:</span>
                <span className="summary-val">{refundModalTx.plan?.toUpperCase()}</span>
              </div>
              <div className="summary-item highlight">
                <span className="summary-lbl">Refund Amount:</span>
                <span className="summary-val font-bold text-emerald">
                  ₱{Number(refundModalTx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="form-field">
              <label>Refund Reason (Mandatory for Compliance & Audit Trail):</label>
              <textarea 
                rows={3}
                required
                className="admin-textarea"
                placeholder="e.g. Account requested cancellation within 7 days, accidental tier selection, or billing inquiry..."
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
            </div>

            <div className="refund-toggle-row">
              <label className="checkbox-label">
                <input 
                  type="checkbox"
                  checked={revertPlan}
                  onChange={(e) => setRevertPlan(e.target.checked)}
                />
                <span>Revert user account back to Standard Free Tier immediately</span>
              </label>
              <p className="toggle-sub">
                If checked, the account's limits are reset to 1 farm and 20 chickens. If unchecked, the user retains access until the current cycle naturally concludes.
              </p>
            </div>

            <div className="modal-actions-row">
              <button 
                type="button" 
                className="admin-btn secondary"
                disabled={processingRefund}
                onClick={() => setRefundModalTx(null)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="admin-btn danger"
                disabled={processingRefund}
                onClick={handleConfirmRefund}
              >
                {processingRefund ? 'Processing Refund...' : `Confirm Refund of ₱${Number(refundModalTx.amount).toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: ITEMIED PURCHASES & SELECTIVE REFUND MANAGER ───────── */}
      {managePurchasesModal && (
        <div className="admin-modal-backdrop" onClick={() => !processingPurchaseRefund && setManagePurchasesModal(null)}>
          <div className="admin-modal-card purchases-manager-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <div className="icon-badge-box">
                  <Layers size={18} color="var(--accent-green)" />
                </div>
                <div>
                  <h2 className="modal-title">Account Purchases & Plan Management</h2>
                  <p className="modal-sub">
                    Itemized transaction ledger, 7-day grace period status, and selective single or multi-purchase refunds.
                  </p>
                </div>
              </div>
              <button 
                className="modal-close-btn" 
                onClick={() => !processingPurchaseRefund && setManagePurchasesModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            {managePurchasesModal.loading ? (
              <div className="modal-loading-box">
                <div className="spinner-large" style={{ width: 28, height: 28 }} />
                <span>Loading account purchases ledger...</span>
              </div>
            ) : managePurchasesModal.data ? (
              <div className="purchases-modal-body">
                {/* Account Summary Banner */}
                <div className="account-hero-banner">
                  <div className="account-hero-left">
                    <div className="account-hero-name">
                      {managePurchasesModal.data.user.first_name} {managePurchasesModal.data.user.last_name}
                    </div>
                    <div className="account-hero-email">
                      {managePurchasesModal.data.user.email} • {managePurchasesModal.data.user.phone_number || 'No phone'}
                    </div>
                    <div className="account-hero-badges">
                      <span className={`badge-plan ${managePurchasesModal.data.user.current_plan}`}>
                        {managePurchasesModal.data.user.current_plan?.toUpperCase()}
                      </span>
                      <span className={`status-badge ${managePurchasesModal.data.user.sub_status === 'active' ? 'active' : 'suspended'}`}>
                        {managePurchasesModal.data.user.sub_status?.toUpperCase()}
                      </span>
                      {managePurchasesModal.data.user.end_date && (
                        <span className="validity-hero-tag">
                          Expires: {new Date(managePurchasesModal.data.user.end_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="account-hero-right">
                    <div className="hero-stat-pill">
                      <span className="hero-stat-lbl">Active Purchases</span>
                      <span className="hero-stat-num text-emerald">{managePurchasesModal.data.active_purchases_count}</span>
                    </div>
                    <div className="hero-stat-pill">
                      <span className="hero-stat-lbl">Total Paid Volume</span>
                      <span className="hero-stat-num">₱{managePurchasesModal.data.total_paid_volume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="hero-stat-pill">
                      <span className="hero-stat-lbl">Total Refunded</span>
                      <span className="hero-stat-num text-red">₱{managePurchasesModal.data.total_refunded_volume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Internal Tabs */}
                <div className="internal-modal-tabs">
                  <button 
                    type="button" 
                    className={`internal-tab-btn ${managePurchasesTab === 'purchases' ? 'active' : ''}`}
                    onClick={() => setManagePurchasesTab('purchases')}
                  >
                    <span>Itemized Purchases ({managePurchasesModal.data.purchases?.length || 0})</span>
                  </button>
                  <button 
                    type="button" 
                    className={`internal-tab-btn ${managePurchasesTab === 'adjust' ? 'active' : ''}`}
                    onClick={() => setManagePurchasesTab('adjust')}
                  >
                    <span>Manual Tier Override</span>
                  </button>
                </div>

                {managePurchasesTab === 'purchases' && (
                  <div>
                    {/* View-Only Information Notice */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      background: 'rgba(56, 189, 248, 0.08)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      fontSize: '12.5px',
                      color: '#E0F2FE'
                    }}>
                      <Clock size={16} color="#38BDF8" style={{ flexShrink: 0 }} />
                      <span>
                        <strong>Audited Purchase History (View-Only):</strong> Shows all stacked renewals and validity dates. To process an official refund, review and approve requests submitted by farm owners under the <strong>Owner Refund Requests</strong> tab.
                      </span>
                    </div>

                    {/* Itemized Table - View Only */}
                    <div className="purchases-table-wrap">
                      <table className="admin-table itemized-table">
                        <thead>
                          <tr>
                            <th>TX ID</th>
                            <th>Plan Tier</th>
                            <th>Amount</th>
                            <th>Purchase Date</th>
                            <th>Grace Period Rule</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {managePurchasesModal.data.purchases?.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="table-empty">
                                No purchases recorded for this account.
                              </td>
                            </tr>
                          ) : (
                            managePurchasesModal.data.purchases?.map(p => (
                              <tr key={p.id}>
                                <td className="font-mono text-muted">#{p.id}</td>
                                <td>
                                  <span className={`badge-plan ${p.plan}`}>{p.plan?.toUpperCase()}</span>
                                </td>
                                <td>
                                  <span className="font-mono font-bold text-white">
                                    ₱{Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </span>
                                </td>
                                <td className="text-sm font-mono text-secondary">
                                  {formatPhtDateTime(p.created_at)}
                                </td>
                                <td>
                                  {p.is_within_grace ? (
                                    <span className="grace-valid-pill" title={`Purchased ${p.age_days} days ago. Within 7-day refund window.`}>
                                      <Clock size={11} /> Eligible ({p.grace_days_left}d left)
                                    </span>
                                  ) : (
                                    <span className="grace-expired-pill" title={`Purchased ${p.age_days} days ago. Past standard 7-day window.`}>
                                      <AlertCircle size={11} /> Grace Expired ({Math.floor(p.age_days)}d ago)
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {p.status === 'paid' && (
                                    <span className="status-badge active">PAID / ACTIVE</span>
                                  )}
                                  {p.status === 'refunded' && (
                                    <div className="refund-badge-col">
                                      <span className="status-badge refunded">REFUNDED</span>
                                      {p.refund_reason && (
                                        <span className="refund-reason-sub" title={p.refund_reason}>{p.refund_reason}</span>
                                      )}
                                    </div>
                                  )}
                                  {p.status === 'pending' && (
                                    <span className="status-badge pending">PENDING</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {managePurchasesTab === 'adjust' && (
                  <div className="manual-override-tab">
                    <div className="modal-form-grid">
                      <div className="form-field full-col">
                        <label>Override Plan Tier:</label>
                        <select 
                          value={adjustPlan} 
                          onChange={(e) => setAdjustPlan(e.target.value)}
                          className="filter-select"
                        >
                          <option value="premium">Premium Account (Unlimited Farms & Chickens)</option>
                          <option value="pro">Pro Account (2 Farms, 60 Chickens)</option>
                          <option value="free_trial">Free Trial (1 Farm, 20 Chickens, 30 Scans)</option>
                          <option value="free">Standard Free Tier</option>
                        </select>
                      </div>

                      <div className="form-field full-col">
                        <label>Validity Duration (Days from Today):</label>
                        <input 
                          type="number"
                          min={1}
                          max={730}
                          value={adjustDays}
                          onChange={(e) => setAdjustDays(Number(e.target.value))}
                        />
                      </div>

                      <div className="form-field full-col">
                        <label>Adjustment Reason / Admin Note:</label>
                        <input 
                          type="text"
                          placeholder="e.g. VIP courtesy extension, account satisfaction..."
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="modal-actions-row" style={{ marginTop: 16 }}>
                      <button 
                        type="button" 
                        className="admin-btn primary"
                        disabled={processingAdjust}
                        onClick={async () => {
                          setProcessingAdjust(true);
                          try {
                            const res = await axios.post(`/api/admin/subscriptions/${managePurchasesModal.userId}/adjust`, {
                              plan: adjustPlan,
                              duration_days: adjustDays,
                              reason: adjustReason
                            });
                            if (res.data.success) {
                              toast.success(res.data.message);
                              const refreshRes = await axios.get(`/api/admin/subscriptions/${managePurchasesModal.userId}/purchases`);
                              if (refreshRes.data.success) {
                                setManagePurchasesModal(prev => ({ ...prev, data: refreshRes.data }));
                              }
                              fetchSubscriptions();
                            }
                          } catch (err) {
                            toast.error(err.response?.data?.error || 'Failed to adjust plan');
                          } finally {
                            setProcessingAdjust(false);
                          }
                        }}
                      >
                        {processingAdjust ? 'Saving...' : 'Save Manual Override'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
