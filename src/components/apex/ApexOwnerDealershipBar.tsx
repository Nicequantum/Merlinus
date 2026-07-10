'use client';

interface ApexOwnerDealershipBarProps {
  dealershipName: string;
  loading?: boolean;
  onExit: () => void;
}

/** Sticky scope indicator when an owner has entered dealership context. */
export function ApexOwnerDealershipBar({
  dealershipName,
  loading = false,
  onExit,
}: ApexOwnerDealershipBarProps) {
  return (
    <div className="apex-owner-scope-bar" data-platform="apex">
      <div className="apex-owner-scope-bar-inner">
        <div className="apex-owner-scope-copy">
          <span className="apex-owner-scope-label">Dealership scope</span>
          <span className="apex-owner-scope-name">{dealershipName}</span>
        </div>
        <button
          type="button"
          className="apex-btn-secondary apex-owner-exit-btn touch-target"
          disabled={loading}
          onClick={onExit}
        >
          {loading ? 'Exiting…' : 'Exit to national'}
        </button>
      </div>
    </div>
  );
}