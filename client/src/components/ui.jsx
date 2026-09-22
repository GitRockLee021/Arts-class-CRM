import { useState } from 'react';

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="center-pad">
      <div className="spinner" aria-label="Loading"></div>
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

const BADGES = {
  active: 'ok',
  closed: 'warn',
  sent: 'ok',
  completed: 'info',
  inactive: 'warn',
  left: 'warn',
  draft: 'muted',
  failed: 'bad',
  error: 'bad',
  'dry-run': 'info',
  skipped: 'muted',
};

export function Badge({ status }) {
  const cls = BADGES[status] || 'muted';
  return <span className={`badge badge-${cls}`}>{status}</span>;
}

export function Field({ label, children, className = '', hint }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export const PHONE_RE = /^\d{10}$/;

export function FieldError({ children }) {
  return children ? <span className="field-error">{children}</span> : null;
}

export function useForm(initial) {
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setRaw = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return { form, set, setRaw, setForm };
}

export function Confirm({ message, onConfirm, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <Modal title="Confirm" onClose={() => setOpen(false)}>
          <p className="muted">{message}</p>
          <div className="row end">
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}