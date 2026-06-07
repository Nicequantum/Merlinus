import { BenzTechApp } from '@/components/BenzTechApp';

export default function HomePage() {
  const demoMode = process.env.DEMO_MODE !== 'false';
  return <BenzTechApp demoMode={demoMode} />;
}