import Link from "next/link";

import { AuthAside } from "@/components/auth-aside";
import { AuthFooter } from "@/components/auth-footer";
import { AuthForm } from "@/components/auth-form";
import { BrandMark } from "@/components/brand-mark";

export default function SignInPage() {
  return (
    <main className="auth-shell">
      <div className="auth-main">
        <Link aria-label="Hooky home" className="brand auth-brand" href="/">
          <BrandMark /> <span>Hooky</span>
        </Link>
        <section className="auth-panel">
          <span className="section-kicker">Welcome back</span>
          <h1>Continue to Hooky.</h1>
          <p>Everything your local environment missed is waiting.</p>
          <AuthForm mode="sign-in" />
        </section>
        <AuthFooter note="By continuing, you agree to use Hooky responsibly." />
      </div>
      <AuthAside mode="sign-in" />
    </main>
  );
}
