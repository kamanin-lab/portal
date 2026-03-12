import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Zurück',
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 50,
            animation: 'fadeIn 0.15s ease',
          }}
        />
        <AlertDialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--shadow-xl)',
            padding: '28px 24px 24px',
            width: 'min(440px, calc(100vw - 32px))',
            zIndex: 51,
          }}
        >
          <AlertDialog.Title
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '10px',
            }}
          >
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              lineHeight: '1.5',
              marginBottom: '24px',
            }}
          >
            {message}
          </AlertDialog.Description>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <AlertDialog.Cancel asChild>
              <button
                onClick={onCancel}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-secondary)',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={onConfirm}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--r-md)',
                  border: 'none',
                  background: destructive ? '#dc2626' : 'var(--cta)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
