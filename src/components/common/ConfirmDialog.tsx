import React from 'react';
import { Modal } from './Modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  isDestructive?: boolean;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  isDestructive = false,
  loading = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="flex items-start gap-4">
        <div
          className={`p-2.5 rounded-xl shrink-0 ${
            isDestructive ? 'bg-[#fff1f2] text-[#be123c]' : 'bg-[#fef3c7] text-[#92400e]'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-xs sm:text-sm text-[#4a4741] leading-relaxed">{message}</p>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#e9e4dc]">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 text-xs font-semibold text-[#4a4741] hover:text-[#1c1b18] bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors cursor-pointer shadow-xs ${
            isDestructive ? 'bg-[#be123c] hover:bg-[#9f1239]' : 'bg-[#23424d] hover:bg-[#1a323b]'
          }`}
        >
          {loading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
