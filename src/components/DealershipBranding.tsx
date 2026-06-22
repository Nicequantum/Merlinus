import { DEALERSHIP_CODE, DEALERSHIP_DISPLAY_NAME } from '@/lib/constants';

interface DealershipBrandingProps {
  size?: 'lg' | 'md' | 'sm';
  className?: string;
}

export function DealershipBranding({ size = 'lg', className = '' }: DealershipBrandingProps) {
  const nameClass =
    size === 'lg'
      ? 'text-2xl font-bold tracking-tight text-benz-primary'
      : size === 'md'
        ? 'text-xl font-bold tracking-tight text-benz-primary'
        : 'text-sm font-semibold tracking-tight leading-tight text-benz-primary';

  const codeClass =
    size === 'lg'
      ? 'text-xs text-benz-silver mt-1.5 tracking-[0.28em] font-semibold uppercase'
      : size === 'md'
        ? 'text-xs text-benz-silver mt-1 tracking-[0.2em] font-semibold uppercase'
        : 'text-xs text-benz-muted tracking-[0.16em] font-medium uppercase';

  return (
    <div className={`text-center ${className}`}>
      <div className={nameClass}>{DEALERSHIP_DISPLAY_NAME}</div>
      <div className={codeClass}>{DEALERSHIP_CODE}</div>
    </div>
  );
}