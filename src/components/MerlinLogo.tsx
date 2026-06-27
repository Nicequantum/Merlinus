import { MercedesStarMark } from '@/components/MercedesStarMark';

interface MerlinLogoProps {
  className?: string;
  /** Pass when the logo is the primary label (e.g. splash). */
  title?: string;
  /** Subtle glow pulse for loading / splash states. */
  animated?: boolean;
}

export function MerlinLogo({ className = 'w-full h-full', title, animated }: MerlinLogoProps) {
  return <MercedesStarMark className={className} title={title} animated={animated} />;
}