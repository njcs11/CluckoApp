import React from 'react';
import ConfirmModal from './ConfirmModal';

interface LogoutConfirmModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmModal({ visible, onCancel, onConfirm }: LogoutConfirmModalProps) {
  return (
    <ConfirmModal
      visible={visible}
      title="Logout"
      message="Are you sure you want to logout?"
      confirmText="Logout"
      cancelText="Cancel"
      icon="log-out-outline"
      iconColor="#E53935"
      isDestructive={true}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}