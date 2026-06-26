import dynamic from 'next/dynamic';
import { AppInitLoading } from '@/components/AppInitLoading';

const BenzTechApp = dynamic(
  () => import('@/components/BenzTechApp').then((m) => m.BenzTechApp),
  {
    loading: () => <AppInitLoading />,
  }
);

export default function HomePage() {
  return <BenzTechApp />;
}