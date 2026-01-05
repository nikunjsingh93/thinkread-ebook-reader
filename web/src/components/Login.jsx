import React, { useState } from 'react';

export default function Login({ onLogin, onToast }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginError(''); // Clear any previous error

    if (!username.trim() || !password.trim()) {
      setLoginError('Please enter both username and password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await response.json();

      if (response.ok) {
        setLoginError(''); // Clear error on success
        onLogin(data.user);
        onToast(`Welcome back, ${data.user.username}!`);
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      setLoginError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (setter) => (e) => {
    setter(e.target.value);
    if (loginError) {
      setLoginError(''); // Clear error when user starts typing
    }
  };

  return (
    <div className="loginContainer">
      <div className="loginCard">
        <div className="loginHeader">
          <img src="/logo.svg" alt="ThinkRead" style={{
            height: '48px',
            width: '48px',
            objectFit: 'contain',
            marginBottom: '16px'
          }} onError={(e) => {
            if (e.target.src.endsWith('.svg')) {
              e.target.src = '/logo.png';
            } else {
              e.target.style.display = 'none';
            }
          }} />
          <h1>ThinkRead</h1>
          <p>Please sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="loginForm">
          <div className="formGroup">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={handleInputChange(setUsername)}
              placeholder="Enter your username"
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div className="formGroup">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={handleInputChange(setPassword)}
              placeholder="Enter your password"
              disabled={isLoading}
              autoComplete="current-password"
            />
            {loginError && (
              <div className="errorMessage">
                {loginError}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="loginButton"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      <style jsx>{`
        .loginContainer {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 20px;
        }

        .loginCard {
          background: var(--panel);
          border-radius: 12px;
          padding: 40px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 400px;
          border: 1px solid var(--border);
        }

        .loginHeader {
          text-align: center;
          margin-bottom: 32px;
        }

        .loginHeader h1 {
          margin: 0 0 8px 0;
          font-size: 28px;
          font-weight: 600;
          color: var(--text);
        }

        .loginHeader p {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
        }

        .loginForm {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .formGroup {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .formGroup label {
          font-size: 14px;
          font-weight: 500;
          color: var(--text);
        }

        .formGroup input {
          padding: 12px 16px;
          border: 1px solid var(--input-border);
          border-radius: 8px;
          background: var(--input-bg);
          color: var(--text);
          font-size: 16px;
          transition: border-color 0.2s ease;
        }

        .formGroup input:focus {
          outline: none;
          border-color: var(--accent);
        }

        .formGroup input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loginButton {
          padding: 12px 24px;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s ease;
          margin-top: 8px;
        }

        .loginButton:hover:not(:disabled) {
          background: #0056b3;
        }

        .loginButton:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .errorMessage {
          color: #dc3545;
          font-size: 14px;
          margin-top: 4px;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
