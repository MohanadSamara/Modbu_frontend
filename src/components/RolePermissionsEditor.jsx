// ============================================================================
// RolePermissionsEditor.jsx — Modal for editing role permissions via checkboxes.
//
// A simple button that opens a modal with:
//   • Role dropdown selector
//   • Checkboxes for each permission
//   • Save button to persist changes
// ============================================================================

import { useEffect, useState } from 'react';
import { rolesApi, permissionsApi } from '../api/auth';

export default function RolePermissionsEditor({ onClose }) {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [rolePermissions, setRolePermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [initialPerms, setInitialPerms] = useState(new Set());

  // Fetch roles and permissions on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [r, p] = await Promise.all([rolesApi.list(), permissionsApi.list()]);
        setRoles(r);
        setPermissions(p);
        // Pre-select first non-system role if available
        const customRole = r.find(role => !role.isSystem);
        if (customRole) {
          setSelectedRoleId(customRole.id);
        } else if (r.length > 0) {
          setSelectedRoleId(r[0].id);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Fetch permissions for selected role
  useEffect(() => {
    if (!selectedRoleId) {
      setRolePermissions([]);
      setInitialPerms(new Set());
      return;
    }

    async function fetchRolePermissions() {
      try {
        const perms = await rolesApi.getPermissions(selectedRoleId);
        setRolePermissions(perms);
        // Store initial permissions to detect changes
        setInitialPerms(new Set(perms.map(p => p.id)));
      } catch (e) {
        setError(e.message);
      }
    }
    fetchRolePermissions();
  }, [selectedRoleId]);

  // Check if a permission is granted
  const hasPermission = (permId) => rolePermissions.some(p => p.id === permId);

  // Get selected role info
  const selectedRole = roles.find(r => r.id === selectedRoleId);

  // Toggle permission
  const togglePermission = async (perm) => {
    if (!selectedRoleId) return;

    const currentlyGranted = hasPermission(perm.id);
    setError(null);
    setSaving(true);

    try {
      if (currentlyGranted) {
        // Revoke permission
        await rolesApi.revokePermission(selectedRoleId, perm.id);
      } else {
        // Grant permission
        await rolesApi.grantPermission(selectedRoleId, perm.key);
      }
      
      // Reload permissions after change - like the original Roles.jsx does
      const updatedPerms = await rolesApi.getPermissions(selectedRoleId);
      setRolePermissions(updatedPerms);
      setError(null); // Clear any previous errors
    } catch (e) {
      console.error('Error toggling permission:', e);
      const errorMsg = e.detail || e.message || 'Failed to update permission';
      setError(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  // Save all changes
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Reload to confirm save
      await rolesApi.getPermissions(selectedRoleId);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
        <div className="bg-[#13151c] border border-white/10 rounded-2xl shadow-2xl p-8">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div 
        className="bg-[#13151c] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-white font-semibold text-lg">Edit Role Permissions</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Role Selector */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Role
            </label>
            <select
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0f1117] border border-white/10 text-gray-200 text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-colors"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name} {role.isSystem ? '(System)' : ''} — {role.key}
                </option>
              ))}
            </select>
          </div>

          {/* Role Info */}
          {selectedRole && (
            <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/5">
              <div className="text-sm">
                <span className="text-gray-400">Role: </span>
                <span className="text-white font-medium">{selectedRole.name}</span>
                {selectedRole.isSystem && (
                  <span className="ml-2 text-[10px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded">System</span>
                )}
              </div>
              {selectedRole.description && (
                <div className="text-xs text-gray-500 mt-1">{selectedRole.description}</div>
              )}
            </div>
          )}

          {/* Permissions Checkboxes */}
          {selectedRoleId ? (
            <div>
              <div className="text-sm font-medium text-gray-300 mb-3">
                Permissions ({rolePermissions.length} of {permissions.length} granted)
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                {permissions.map((perm) => {
                  const isGranted = hasPermission(perm.id);

                  return (
                    <label
                      key={perm.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                        ${isGranted 
                          ? 'bg-blue-500/10 border-blue-500/30' 
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                        }
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={isGranted}
                        onChange={() => togglePermission(perm)}
                        className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/10 text-blue-600 
                          focus:ring-blue-500 focus:ring-offset-0"
                      />
                      <div className="min-w-0">
                        <div className={`text-sm font-medium ${isGranted ? 'text-blue-300' : 'text-gray-300'}`}>
                          {perm.key}
                        </div>
                        {perm.description && (
                          <div className="text-xs text-gray-500 truncate">{perm.description}</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {permissions.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No permissions available.
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Select a role to view its permissions.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/5">
          <div className="text-xs text-gray-500">
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-300 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
