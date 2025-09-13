import { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className = "" }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      data-testid="modal-overlay"
    >
      <div 
        className={`bg-card rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl ${className}`}
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-content"
      >
        <div className="bg-gradient-to-r from-primary to-accent text-white px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">{title}</h2>
            <button 
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
              data-testid="button-close-modal"
            >
              <X size={24} />
            </button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {children}
        </div>
      </div>
    </div>
  );
}
