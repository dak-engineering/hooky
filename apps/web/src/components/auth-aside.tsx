export function AuthAside({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <aside aria-label="How Hooky works" className="auth-aside">
      <div className="auth-aside-copy">
        <span className="section-kicker">Public in. Local out.</span>
        <h2>
          Your machine stays private.
          <br /> Every event stays available.
        </h2>
        <p>
          {mode === "sign-up"
            ? "Create one durable endpoint, then let the CLI deliver when localhost is ready."
            : "Return to the events, payloads, and delivery history waiting in your workspace."}
        </p>
      </div>
      <div aria-hidden="true" className="auth-signal-map">
        <div className="auth-signal-node">
          <i />
          <span>Ingress</span>
          <small>Public HTTPS</small>
        </div>
        <div className="auth-signal-rail first">
          <i />
        </div>
        <div className="auth-signal-node emphasized">
          <i />
          <span>Inbox</span>
          <small>Durably stored</small>
        </div>
        <div className="auth-signal-rail second">
          <i />
        </div>
        <div className="auth-signal-node">
          <i />
          <span>Localhost</span>
          <small>When ready</small>
        </div>
      </div>
      <p className="auth-aside-note">
        No tunnel. No open port. No missed event.
      </p>
    </aside>
  );
}
