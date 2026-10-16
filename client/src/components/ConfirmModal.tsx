import { ModalSheet } from './ModalSheet';

interface ConfirmModalProps {
  isOpen: boolean; title: string; message: string;
  onConfirm: () => void; onCancel: () => void;
  confirmText?: string; cancelText?: string; isDanger?: boolean;
  busy?: boolean; error?: string;
}
export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false, busy = false, error }: ConfirmModalProps) {
  if (!isOpen) return null;
  return <ModalSheet title={title} onClose={onCancel} busy={busy}><p className="text-muted whitespace-pre-line">{message}</p>{error && <p role="alert" className="text-red-800 bg-red-50 p-3 rounded-xl">{error}</p>}<div className="flex flex-wrap gap-3"><button disabled={busy} onClick={onCancel} className="btn btn-secondary flex-1">{cancelText}</button><button disabled={busy} onClick={onConfirm} className={`btn flex-1 ${isDanger ? 'btn-danger' : 'btn-primary'}`}>{busy ? 'Saving…' : confirmText}</button></div></ModalSheet>;
}
