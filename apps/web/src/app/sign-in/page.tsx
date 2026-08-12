import Link from "next/link";

import { AuthForm } from "@/components/auth-form";

export default function SignInPage() {
  return (
    <main className="auth-shell">
      <Link aria-label="Hooky home" className="auth-brand" href="/">
        <span className="brand-mark">H</span>
        Hooky
      </Link>
      <section className="auth-panel">
        <h1>Welcome back.</h1>
        <p>Pick up every webhook your local environment missed.</p>
        <AuthForm mode="sign-in" />
      </section>
    </main>
  );
}
