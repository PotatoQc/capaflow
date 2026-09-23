type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" role="alertdialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="desc">{message}</p>
        <button className="btn btn-primary btn-lg" onClick={onConfirm}>{confirmLabel}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}
