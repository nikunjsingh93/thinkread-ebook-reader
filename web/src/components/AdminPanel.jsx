import React, { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog.jsx';

export default function AdminPanel({ onClose, onToast }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', isAdmin: false });
  const [editingUser, setEditingUser] = useState(null);
  const [editUser, setEditUser] = useState({ username: '', password: '', isAdmin: false });
  const [showPassword, setShowPassword] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users);
      } else {
        onToast(data.error || 'Failed to load users');
      }
    } catch (error) {
      console.error('Error loading users:', error);
      onToast('Network error loading users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.username.trim() || !newUser.password.trim()) {
      onToast('Please enter both username and password');
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });

      const data = await response.json();
      if (response.ok) {
        setUsers([...users, data.user]);
        setNewUser({ username: '', password: '', isAdmin: false });
        setShowCreateForm(false);
        onToast(`User "${data.user.username}" created successfully`);
      } else {
        onToast(data.error || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      onToast('Network error creating user');
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!editUser.username.trim()) {
      onToast('Please enter a username');
      return;
    }

    try {
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editUser),
      });

      const data = await response.json();
      if (response.ok) {
        setUsers(users.map(u => u.id === editingUser.id ? data.user : u));
        setEditingUser(null);
        setEditUser({ username: '', password: '', isAdmin: false });
        setShowPassword(false);
        onToast(`User "${data.user.username}" updated successfully`);
      } else {
        onToast(data.error || 'Failed to update user');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      onToast('Network error updating user');
    }
  };

  const startEditingUser = (user) => {
    setEditingUser(user);
    setEditUser({
      username: user.username,
      password: '',
      isAdmin: user.isAdmin
    });
    setShowPassword(false);
  };

  const cancelEditingUser = () => {
    setEditingUser(null);
    setEditUser({ username: '', password: '', isAdmin: false });
    setShowPassword(false);
  };

  const handleDeleteUser = async (user) => {
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (response.ok) {
        setUsers(users.filter(u => u.id !== user.id));
        onToast(`User "${user.username}" deleted successfully`);
      } else {
        onToast(data.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      onToast('Network error deleting user');
    }
    setConfirmDialog(null);
  };

  const confirmDeleteUser = (user) => {
    const adminCount = users.filter(u => u.isAdmin).length;
    if (user.isAdmin && adminCount <= 1) {
      onToast('Cannot delete the last admin user');
      return;
    }

    setConfirmDialog({
      open: true,
      title: 'Delete User',
      message: `Are you sure you want to delete user "${user.username}"? This action cannot be undone.`,
      onConfirm: () => handleDeleteUser(user),
    });
  };

  if (isLoading) {
    return (
      <div className="adminPanel">
        <div className="adminHeader">
          <h2>Admin Panel</h2>
          <button onClick={onClose} className="closeButton">×</button>
        </div>
        <div className="loading">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="adminPanel">
      <div className="adminHeader">
        <h2>Admin Panel</h2>
        <button onClick={onClose} className="closeButton">×</button>
      </div>

      <div className="adminContent">
        <div className="usersSection">
          <div className="sectionHeader">
            <h3>Users ({users.length})</h3>
            <button
              onClick={() => setShowCreateForm(true)}
              className="createButton"
            >
              + Add User
            </button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateUser} className="createUserForm">
              <div className="formRow">
                <input
                  type="text"
                  placeholder="Username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  required
                />
                <label className="checkboxLabel">
                  <input
                    type="checkbox"
                    checked={newUser.isAdmin}
                    onChange={(e) => setNewUser({...newUser, isAdmin: e.target.checked})}
                  />
                  Admin
                </label>
              </div>
              <div className="formActions">
                <button type="submit" className="submitButton">Create User</button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewUser({ username: '', password: '', isAdmin: false });
                  }}
                  className="cancelButton"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {editingUser && (
            <form onSubmit={handleEditUser} className="editUserForm">
              <div className="formRow">
                <input
                  type="text"
                  placeholder="Username"
                  value={editUser.username}
                  onChange={(e) => setEditUser({...editUser, username: e.target.value})}
                  required
                />
                <div className="passwordField">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="New Password (leave empty to keep current)"
                    value={editUser.password}
                    onChange={(e) => setEditUser({...editUser, password: e.target.value})}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="showPasswordButton"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "👁️" : "🙈"}
                  </button>
                </div>
                <label className="checkboxLabel">
                  <input
                    type="checkbox"
                    checked={editUser.isAdmin}
                    onChange={(e) => setEditUser({...editUser, isAdmin: e.target.checked})}
                  />
                  Admin
                </label>
              </div>
              <div className="formActions">
                <button type="submit" className="submitButton">Update User</button>
                <button
                  type="button"
                  onClick={cancelEditingUser}
                  className="cancelButton"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="usersList">
            {users.map(user => (
              <div key={user.id} className="userRow">
                <div className="userInfo">
                  <span className="username">{user.username}</span>
                  {user.isAdmin && <span className="adminBadge">Admin</span>}
                  <span className="createdDate">
                    Created: {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="userActions">
                  <button
                    onClick={() => startEditingUser(user)}
                    className="editButton"
                    title="Edit user"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => confirmDeleteUser(user)}
                    className="deleteButton"
                    disabled={users.filter(u => u.isAdmin).length <= 1 && user.isAdmin}
                    title={
                      users.filter(u => u.isAdmin).length <= 1 && user.isAdmin
                        ? 'Cannot delete the last admin user'
                        : 'Delete user'
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialog?.open || false}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        onConfirm={confirmDialog?.onConfirm}
        onCancel={() => setConfirmDialog(null)}
      />

      <style jsx>{`
        .adminPanel {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--bg);
          z-index: 1000;
          display: flex;
          flex-direction: column;
        }

        .adminHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 30px;
          border-bottom: 1px solid var(--border);
          background: var(--panel);
        }

        .adminHeader h2 {
          margin: 0;
          color: var(--text);
        }

        .closeButton {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: var(--muted);
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: background-color 0.2s ease;
        }

        .closeButton:hover {
          background: var(--row-bg);
          color: var(--text);
        }

        .adminContent {
          flex: 1;
          padding: 30px;
          overflow-y: auto;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: var(--muted);
        }

        .sectionHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .sectionHeader h3 {
          margin: 0;
          color: var(--text);
        }

        .createButton {
          background: var(--accent);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s ease;
        }

        .createButton:hover {
          background: #0056b3;
        }

        .createUserForm, .editUserForm {
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .formRow {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
          align-items: center;
        }

        .formRow input[type="text"],
        .formRow input[type="password"] {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid var(--input-border);
          border-radius: 4px;
          background: var(--input-bg);
          color: var(--text);
        }

        .checkboxLabel {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: var(--text);
          cursor: pointer;
        }

        .checkboxLabel input[type="checkbox"] {
          margin: 0;
        }

        .passwordField {
          position: relative;
          flex: 1;
        }

        .passwordField input {
          width: 100%;
          padding: 8px 40px 8px 12px;
          border: 1px solid var(--input-border);
          border-radius: 4px;
          background: var(--input-bg);
          color: var(--text);
        }

        .showPasswordButton {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          font-size: 14px;
          transition: background-color 0.2s ease;
        }

        .showPasswordButton:hover {
          background: var(--row-bg);
        }

        .editButton {
          background: var(--accent);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s ease;
        }

        .editButton:hover {
          background: #0056b3;
        }

        .formActions {
          display: flex;
          gap: 12px;
        }

        .submitButton {
          background: var(--accent);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .submitButton:hover {
          background: #0056b3;
        }

        .cancelButton {
          background: var(--row-bg);
          color: var(--text);
          border: 1px solid var(--border);
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .cancelButton:hover {
          background: var(--border);
        }

        .usersList {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .userRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .userActions {
          display: flex;
          gap: 8px;
        }

        .userInfo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .username {
          font-weight: 500;
          color: var(--text);
        }

        .adminBadge {
          background: var(--accent);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }

        .createdDate {
          color: var(--muted);
          font-size: 14px;
        }

        .deleteButton {
          background: #dc3545;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s ease;
        }

        .deleteButton:hover:not(:disabled) {
          background: #c82333;
        }

        .deleteButton:disabled {
          background: var(--muted);
          cursor: not-allowed;
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}
