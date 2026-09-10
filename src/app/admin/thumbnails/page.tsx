import ThumbnailsManager from '@/components/ThumbnailsManager';
import { requirePageAdmin } from '@/lib/pageAuth';

export default async function AdminThumbnailsPage() {
  await requirePageAdmin();
  return <ThumbnailsManager />;
}
