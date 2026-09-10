import SearchPage from '@/components/SearchPage';
import { requirePageSession } from '@/lib/pageAuth';

export default async function Search() {
  await requirePageSession();
  return <SearchPage />;
}
