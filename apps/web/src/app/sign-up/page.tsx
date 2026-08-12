import Link from "next/link";

import { AuthAside } from "@/components/auth-aside";
import { AuthFooter } from "@/components/auth-footer";
import { AuthForm } from "@/components/auth-form";
import { BrandMark } from "@/components/brand-mark";

export default function SignUpPage() {
  return (
    <main className="auth-shell">
      <div className="auth-main">
        <Link aria-label="Hooky home" className="brand auth-brand" href="/">
          <BrandMark /> <span>Hooky</span>
        </Link>
        <section className="auth-panel">
          <span className="section-kicker">Create a workspace</span>
          <h1>Start with one endpoint.</h1>
          <p>Add the CLI when localhost is ready. Hooky will wait.</p>
          <AuthForm mode="sign-up" />
        </section>
        <AuthFooter note="No credit card. Public repository. Your data stays yours." />
      </div>
      <AuthAside mode="sign-up" />
    </main>
  );
}
