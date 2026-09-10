import UsersManagement from '@/components/UsersManagement';
import { requirePageAdmin } from '@/lib/pageAuth';

export default async function AdminUsersPage() {
  await requirePageAdmin();
  return <UsersManagement />;
}
