import { BenzTechApp } from '@/components/BenzTechApp';

export default function HomePage() {
  const demoMode = process.env.DEMO_MODE === 'true';
  return <BenzTechApp demoMode={demoMode} />;
}