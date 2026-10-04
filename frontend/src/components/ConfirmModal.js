import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import './ConfirmModal.css';

export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  itemName = '',
  detail = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="confirm-modal-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div
        className={`confirm-modal-dialog ${confirmVariant}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="confirm-modal-close"
          onClick={onCancel}
          aria-label="Close confirmation dialog"
        >
          <X size={18} />
        </button>

        <div className="confirm-modal-header">
          <div className={`confirm-icon-badge ${confirmVariant}`}>
            {confirmVariant === 'danger' ? (
              <Trash2 size={24} className="confirm-icon" />
            ) : (
              <AlertTriangle size={24} className="confirm-icon" />
            )}
          </div>
          <div className="confirm-modal-text">
            <h3 className="confirm-modal-title">{title}</h3>
            <p className="confirm-modal-message">
              {message}
              {itemName && <span className="confirm-item-highlight"> “{itemName}”</span>}
            </p>
            {detail && <p className="confirm-modal-detail">{detail}</p>}
          </div>
        </div>

        <div className="confirm-modal-actions">
          <button
            type="button"
            className="btn btn-secondary confirm-btn-cancel"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn confirm-btn-action ${confirmVariant}`}
            onClick={onConfirm}
            disabled={isLoading}
            autoFocus
          >
            {isLoading ? (
              <span className="confirm-spinner" />
            ) : confirmVariant === 'danger' ? (
              <Trash2 size={15} />
            ) : null}
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
