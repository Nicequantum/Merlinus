import { MercedesStarMark } from '@/components/MercedesStarMark';

interface MerlinLogoProps {
  className?: string;
  /** Pass when the logo is the primary label (e.g. splash). */
  title?: string;
}

export function MerlinLogo({ className = 'w-full h-full', title }: MerlinLogoProps) {
  return <MercedesStarMark className={className} title={title} />;
}