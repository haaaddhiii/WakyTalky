import Logo from './Logo';

export default function LoginView({
  username, setUsername, password, setPassword, onSubmit, onBack, onSwitchToRegister
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
        <h1>WakyTalky</h1>
        <p className="tagline">Private messaging, end-to-end encrypted</p>
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
          />
          <button type="submit">Sign In</button>
        </form>
        <p className="switch-view">
          Don't have an account?{' '}
          <span onClick={onSwitchToRegister}>Create one</span>
        </p>
      </div>
    </div>
  );
}
