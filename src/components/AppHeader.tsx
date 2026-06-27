import { Settings } from 'lucide-react';
import { DealershipBranding } from '@/components/DealershipBranding';
import { MerlinLogo } from '@/components/MerlinLogo';

interface AppHeaderProps {
  technicianName?: string;
  onOpenSettings: () => void;
}

export function AppHeader({ technicianName, onOpenSettings }: AppHeaderProps) {
  return (
    <header className="benz-header px-4 py-3 flex items-center justify-between sticky top-0 z-50">
      <div className="benz-logo-ring benz-logo-bubble w-10 h-10 shrink-0" aria-hidden="true">
        <MerlinLogo />
      </div>
      <div className="flex-1 min-w-0 px-2">
        <DealershipBranding size="sm" />
        {technicianName && (
          <p className="text-xs text-benz-muted text-center truncate mt-1 font-medium">{technicianName}</p>
        )}
      </div>
      <button onClick={onOpenSettings} className="benz-icon-btn shrink-0 w-10 h-10 flex items-center justify-center">
        <Settings size={20} />
      </button>
    </header>
  );
}