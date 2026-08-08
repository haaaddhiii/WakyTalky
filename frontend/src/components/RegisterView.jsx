import Logo from './Logo';

export default function RegisterView({
  username, setUsername, password, setPassword,
  confirmPassword, setConfirmPassword, onSubmit, onBack, onSwitchToLogin
}) {
  return (
    <div className="auth-container">
      <div className="auth-box">
        <button className="auth-back" onClick={onBack} aria-label="Back to home">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="auth-logo"><Logo /></div>
        <h1>Create Account</h1>
        <p className="tagline">Your keys, your privacy</p>
        <form onSubmit={onSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength="8"
          />
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength="8"
          />
          <button type="submit">Create Account</button>
        </form>
        <p className="switch-view">
          Already have an account?{' '}
          <span onClick={onSwitchToLogin}>Sign in</span>
        </p>
      </div>
    </div>
  );
}
