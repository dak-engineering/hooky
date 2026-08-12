import Link from "next/link";

import { AuthForm } from "@/components/auth-form";

export default function SignUpPage() {
  return (
    <main className="auth-shell">
      <Link aria-label="Hooky home" className="auth-brand" href="/">
        <span className="brand-mark">H</span>
        Hooky
      </Link>
      <section className="auth-panel">
        <h1>Create your workspace.</h1>
        <p>Start with one durable endpoint. Add the CLI when you are ready.</p>
        <AuthForm mode="sign-up" />
      </section>
    </main>
  );
}
