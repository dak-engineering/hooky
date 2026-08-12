"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { authClient } from "@/lib/auth-client";

import { CloseIcon, CopyIcon, KeyIcon, PlusIcon, RotateIcon } from "./icons";

function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="copy-button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_500);
      }}
      type="button"
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          animate={{ opacity: 1, transform: "translateY(0)" }}
          className="copy-button-content"
          exit={{ opacity: 0, transform: "translateY(4px)" }}
          initial={{ opacity: 0, transform: "translateY(-4px)" }}
          key={copied ? "copied" : "copy"}
          transition={{ duration: 0.12 }}
        >
          <CopyIcon />
          {copied ? "Copied" : label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function Modal({
  children,
  close,
  title,
}: {
  children: React.ReactNode;
  close: () => void;
  title: string;
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [close]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="modal-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
      transition={{ duration: 0.16 }}
    >
      <motion.section
        animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
        aria-labelledby="modal-title"
        aria-modal="true"
        className="modal"
        exit={{ opacity: 0, transform: "translateY(6px) scale(0.985)" }}
        initial={{ opacity: 0, transform: "translateY(10px) scale(0.98)" }}
        role="dialog"
        transition={{ duration: 0.22, ease: [0.19, 1, 0.22, 1] }}
      >
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button
            aria-label="Close"
            className="icon-button"
            onClick={close}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </motion.section>
    </motion.div>
  );
}

export function HookActions({ hookId }: { hookId: string | undefined }) {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "rotate" | null>(null);
  const [secretUrl, setSecretUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function close() {
    setMode(null);
    setSecretUrl("");
    setError("");
  }

  async function create(formData: FormData) {
    setPending(true);
    setError("");
    const response = await fetch("/api/v1/hooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: String(formData.get("name") ?? "") }),
    });
    const payload = (await response.json()) as {
      ingressUrl?: string;
      error?: string;
    };
    setPending(false);
    if (!response.ok || !payload.ingressUrl) {
      setError(payload.error ?? "Hook could not be created");
      return;
    }
    setSecretUrl(payload.ingressUrl);
    router.refresh();
  }

  async function rotate() {
    if (!hookId) return;
    setMode("rotate");
    setPending(true);
    setError("");
    const response = await fetch(
      `/api/v1/hooks/${encodeURIComponent(hookId)}/rotate-ingress-secret`,
      { method: "POST" },
    );
    const payload = (await response.json()) as {
      ingressUrl?: string;
      error?: string;
    };
    setPending(false);
    if (!response.ok || !payload.ingressUrl) {
      setError(payload.error ?? "URL could not be rotated");
      return;
    }
    setSecretUrl(payload.ingressUrl);
  }

  return (
    <>
      <div className="header-actions">
        <button
          className="button button-primary-outline"
          onClick={() => setMode("create")}
          type="button"
        >
          <PlusIcon />
          New hook
        </button>
        <button
          className="button button-secondary"
          disabled={!hookId || pending}
          onClick={rotate}
          type="button"
        >
          <RotateIcon />
          Rotate URL
        </button>
      </div>
      <AnimatePresence initial={false}>
        {mode ? (
          <Modal
            close={close}
            title={
              secretUrl
                ? "Webhook URL created"
                : mode === "create"
                  ? "Create a hook"
                  : "Rotate webhook URL"
            }
          >
            {secretUrl ? (
              <div className="secret-result">
                <p>
                  Copy it now. For security, Hooky only shows this URL once.
                </p>
                <div className="secret-field">
                  <code>{secretUrl}</code>
                  <CopyButton label="Copy URL" value={secretUrl} />
                </div>
                <div className="modal-actions">
                  <button
                    className="button button-secondary"
                    onClick={close}
                    type="button"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : mode === "create" ? (
              <form action={create} className="modal-form">
                <p>Give this endpoint a name you’ll recognize locally.</p>
                <label>
                  Hook name
                  <input
                    autoFocus
                    maxLength={80}
                    name="name"
                    placeholder="stripe-staging"
                    required
                  />
                </label>
                {error ? <p className="form-error">{error}</p> : null}
                <div className="modal-actions">
                  <button
                    className="button button-secondary"
                    onClick={close}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className="button button-primary" disabled={pending}>
                    {pending ? "Creating…" : "Create hook"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="modal-form">
                <p>{error || "Creating a new URL and revoking the old one…"}</p>
              </div>
            )}
          </Modal>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function ApiKeysControl({
  tokens,
}: {
  tokens: Array<{
    tokenId: string;
    name: string;
    prefix: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function create(formData: FormData) {
    setPending(true);
    setError("");
    const response = await fetch("/api/v1/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: String(formData.get("name") ?? "") }),
    });
    const payload = (await response.json()) as {
      token?: string;
      error?: string;
    };
    setPending(false);
    if (!response.ok || !payload.token) {
      setError(payload.error ?? "API key could not be created");
      return;
    }
    setSecret(payload.token);
    router.refresh();
  }

  async function revoke(tokenId: string) {
    await fetch(`/api/v1/tokens/${tokenId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <button
        className="sidebar-link"
        onClick={() => setOpen(true)}
        type="button"
      >
        <KeyIcon />
        API keys
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <Modal
            close={() => {
              setOpen(false);
              setSecret("");
              setError("");
            }}
            title={secret ? "API key created" : "API keys"}
          >
            {secret ? (
              <div className="secret-result">
                <p>
                  Copy it now. For security, Hooky only shows this token once.
                </p>
                <div className="secret-field">
                  <code>{secret}</code>
                  <CopyButton value={secret} />
                </div>
                <div className="modal-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setSecret("");
                      setOpen(false);
                    }}
                    type="button"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <form action={create} className="modal-form compact-form">
                  <label>
                    Key name
                    <input
                      autoFocus
                      maxLength={80}
                      name="name"
                      placeholder="MacBook listener"
                      required
                    />
                  </label>
                  {error ? <p className="form-error">{error}</p> : null}
                  <button className="button button-primary" disabled={pending}>
                    {pending ? "Creating…" : "Create API key"}
                  </button>
                </form>
                <div className="token-list">
                  {tokens.length ? (
                    tokens.map((token) => (
                      <div className="token-row" key={token.tokenId}>
                        <span>
                          <strong>{token.name}</strong>
                          <code>{token.prefix}…</code>
                        </span>
                        {token.revokedAt ? (
                          <em>Revoked</em>
                        ) : (
                          <button
                            onClick={() => revoke(token.tokenId)}
                            type="button"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="empty-note">No API keys yet.</p>
                  )}
                </div>
              </>
            )}
          </Modal>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function CommandCopy({ command }: { command: string }) {
  return <CopyButton value={command} />;
}

export function AccountControl({ name }: { name: string }) {
  const router = useRouter();
  return (
    <button
      className="account-control"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
      type="button"
    >
      <span>{name.slice(0, 2).toUpperCase()}</span>
      {name}
      <small>Sign out</small>
    </button>
  );
}

export function EventInspector({
  body,
  headers,
  query,
}: {
  body: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
}) {
  const [tab, setTab] = useState<"body" | "headers" | "query">("body");
  const value =
    tab === "body"
      ? body
      : JSON.stringify(tab === "headers" ? headers : query, null, 2);
  return (
    <>
      <div className="inspector-tabs" role="tablist">
        {(["body", "headers", "query"] as const).map((item) => (
          <button
            aria-selected={tab === item}
            key={item}
            onClick={() => setTab(item)}
            role="tab"
            type="button"
          >
            {item[0]!.toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <AnimatePresence initial={false} mode="wait">
        <motion.pre
          animate={{ opacity: 1, transform: "translateX(0)" }}
          className="payload-view"
          exit={{ opacity: 0, transform: "translateX(-8px)" }}
          initial={{ opacity: 0, transform: "translateX(8px)" }}
          key={tab}
          transition={{ duration: 0.14, ease: [0.19, 1, 0.22, 1] }}
        >
          <code>{value}</code>
        </motion.pre>
      </AnimatePresence>
    </>
  );
}
