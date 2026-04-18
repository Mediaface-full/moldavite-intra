'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface User {
  id: number;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'USER';
  createdAt: string;
}

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'ADMIN' | 'USER'>('USER');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    const res = await apiFetch('/api/admin/users');
    if (res.ok) setUsers(await res.json());
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, name: newName, role: newRole }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('USER');
        loadUsers();
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } catch { setError('Chyba'); } finally { setCreating(false); }
  };

  const handleDelete = async (userId: number) => {
    if (!confirm('Opravdu smazat tohoto uživatele?')) return;
    await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    loadUsers();
  };

  const handleRoleChange = async (userId: number, role: string) => {
    await apiFetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    loadUsers();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Uživatelé</h1>
          <p className="text-text-secondary mt-1">Správa přístupu do systému</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-moldavite-600 hover:bg-moldavite-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Přidat uživatele
        </button>
      </div>

      {/* Users table */}
      <div className="overflow-x-auto rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-secondary border-b border-border-color">
              <th className="text-left px-4 py-3 text-text-secondary font-medium">Jméno</th>
              <th className="text-left px-4 py-3 text-text-secondary font-medium">Email</th>
              <th className="text-left px-4 py-3 text-text-secondary font-medium">Role</th>
              <th className="text-left px-4 py-3 text-text-secondary font-medium">Vytvořen</th>
              <th className="text-right px-4 py-3 text-text-secondary font-medium">Akce</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border-color hover:bg-bg-card-hover transition-colors">
                <td className="px-4 py-3 text-text-primary font-medium">{user.name || '-'}</td>
                <td className="px-4 py-3 text-text-secondary">{user.email}</td>
                <td className="px-4 py-3">
                  <select value={user.role} onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="bg-bg-secondary border border-border-color rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-moldavite-500">
                    <option value="ADMIN">Admin</option>
                    <option value="USER">Uživatel</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-text-muted text-xs">
                  {new Date(user.createdAt).toLocaleDateString('cs-CZ')}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-3 justify-end">
                    <button onClick={() => setEditingUser(user)}
                      className="text-text-secondary hover:text-moldavite-400 transition-colors text-xs">
                      Upravit
                    </button>
                    <button onClick={() => handleDelete(user.id)}
                      className="text-text-muted hover:text-red-400 transition-colors text-xs">
                      Smazat
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-bg-card border border-border-color rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold mb-6">Nový uživatel</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Jméno</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jan Novák"
                  className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Email *</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required
                  className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Heslo *</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
                  className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Role</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'ADMIN' | 'USER')}
                  className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500">
                  <option value="USER">Uživatel</option>
                  <option value="ADMIN">Administrátor</option>
                </select>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={creating}
                  className="flex-1 bg-moldavite-600 hover:bg-moldavite-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                  {creating ? 'Vytvářím...' : 'Vytvořit uživatele'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 rounded-lg text-sm text-text-secondary border border-border-color hover:border-border-hover transition-colors">
                  Zrušit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); loadUsers(); }}
        />
      )}
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'USER'>(user.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      if (name !== (user.name || '')) body.name = name;
      if (email !== user.email) body.email = email;
      if (role !== user.role) body.role = role;
      if (password) body.password = password;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json();
        setError(data.error || 'Úprava selhala');
      }
    } catch {
      setError('Chyba sítě');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-bg-card border border-border-color rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Upravit uživatele</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Jméno</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">
              Nové heslo
              <span className="ml-2 normal-case text-[10px] text-text-muted">
                nech prázdné, pokud nechceš měnit
              </span>
            </label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6}
              placeholder="min. 6 znaků"
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500 placeholder-text-muted" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'USER')}
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500">
              <option value="USER">Uživatel</option>
              <option value="ADMIN">Administrátor</option>
            </select>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-moldavite-600 hover:bg-moldavite-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Ukládám…' : 'Uložit změny'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm text-text-secondary border border-border-color hover:border-border-hover transition-colors">
              Zrušit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
