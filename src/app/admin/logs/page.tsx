import ActivityLogPage from '@/components/ActivityLogPage';
import { requirePageAdmin } from '@/lib/pageAuth';

export default async function AdminLogsPage() {
  await requirePageAdmin();
  return <ActivityLogPage />;
}
