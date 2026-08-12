"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = isSignUp
      ? await authClient.signUp.email({
          email,
          password,
          name: String(formData.get("name") ?? ""),
          callbackURL: "/dashboard",
        })
      : await authClient.signIn.email({
          email,
          password,
          callbackURL: "/dashboard",
        });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Authentication failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form action={submit} className="auth-form">
      {isSignUp ? (
        <label>
          Name
          <input autoComplete="name" name="name" required />
        </label>
      ) : null}
      <label>
        Email
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        Password
        <input
          autoComplete={isSignUp ? "new-password" : "current-password"}
          minLength={10}
          name="password"
          required
          type="password"
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button button-primary auth-submit" disabled={pending}>
        {pending ? "Working…" : isSignUp ? "Create account" : "Sign in"}
      </button>
      <p className="auth-switch">
        {isSignUp ? "Already have an account?" : "New to Hooky?"}{" "}
        <Link href={isSignUp ? "/sign-in" : "/sign-up"}>
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
