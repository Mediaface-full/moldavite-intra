import StatsPage from '@/components/StatsPage';
import { requirePageSession } from '@/lib/pageAuth';

export default async function Stats() {
  await requirePageSession();
  return <StatsPage />;
}
