import React from 'react';
import ConfirmModal from './ConfirmModal';

interface ExitGuestConfirmModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ExitGuestConfirmModal({ visible, onCancel, onConfirm }: ExitGuestConfirmModalProps) {
  return (
    <ConfirmModal
      visible={visible}
      title="Exit Guest Mode"
      message="You'll be taken back to the login page. Any guest browsing won't be saved."
      confirmText="Exit"
      cancelText="Stay"
      icon="exit-outline"
      iconColor="#2E7D32"
      isDestructive={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}