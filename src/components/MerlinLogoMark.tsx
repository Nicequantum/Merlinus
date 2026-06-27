import { MerlinLogo } from '@/components/MerlinLogo';

type MerlinLogoMarkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<MerlinLogoMarkSize, string> = {
  xs: 'merlin-logo-mark--xs',
  sm: 'merlin-logo-mark--sm',
  md: 'merlin-logo-mark--md',
  lg: 'merlin-logo-mark--lg',
  xl: 'merlin-logo-mark--xl',
};

interface MerlinLogoMarkProps {
  size?: MerlinLogoMarkSize;
  className?: string;
  title?: string;
  animated?: boolean;
}

/** Framed premium Mercedes-Benz emblem — 3D metallic star across the app. */
export function MerlinLogoMark({ size = 'md', className, title, animated }: MerlinLogoMarkProps) {
  return (
    <div
      className={['merlin-logo-mark', SIZE_CLASS[size], className].filter(Boolean).join(' ')}
      aria-hidden={title ? undefined : true}
    >
      <MerlinLogo title={title} animated={animated} />
    </div>
  );
}