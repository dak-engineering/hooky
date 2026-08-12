export function AuthFooter({ note }: { note: string }) {
  return (
    <footer className="auth-footer">
      <span className="auth-footer-status">
        <i aria-hidden="true" /> Local ports stay private
      </span>
      <p>{note}</p>
    </footer>
  );
}
