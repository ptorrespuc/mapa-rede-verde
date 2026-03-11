"use client";

import { X } from "lucide-react";

interface AdminModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function AdminModal({ isOpen, title, subtitle, onClose, children }: AdminModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card stack-md">
        <div className="modal-header">
          <div className="modal-header-top">
            <div className="stack-xs">
              <h2 className="section-title">{title}</h2>
              {subtitle ? <p className="subtitle">{subtitle}</p> : null}
            </div>
            <button
              aria-label="Fechar janela"
              className="modal-close-button"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
