import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

const repositoryUrl = "https://github.com/dak-engineering/hooky";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <nav aria-label="Primary navigation" className="landing-navigation">
        <Link aria-label="Hooky home" className="brand" href="/">
          <BrandMark />
          <span>Hooky</span>
        </Link>
        <div className="landing-nav-links">
          <a href="#how-it-works">How it works</a>
          <a href={repositoryUrl}>GitHub</a>
        </div>
        <div className="landing-nav-actions">
          <Link className="sign-in-link" href="/sign-in">
            Sign in
          </Link>
          <Link className="button button-primary landing-start" href="/sign-up">
            Get started
          </Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy landing-enter-copy">
          <span className="eyebrow">
            <i /> Durable webhooks for local development
          </span>
          <h1>
            Webhooks,
            <br /> on your time.
          </h1>
          <p>
            Hooky receives and stores every event in the cloud, then delivers it
            to localhost the moment your environment is ready.
          </p>
          <div className="hero-actions">
            <Link
              className="button button-primary hero-primary"
              href="/sign-up"
            >
              Create an endpoint
            </Link>
            <a className="text-link" href={repositoryUrl}>
              View source <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <div
          aria-label="Webhook moving from the internet to a local environment through Hooky"
          className="relay-stage landing-enter-stage"
          id="how-it-works"
        >
          <div className="relay-stage-header">
            <span>Live delivery</span>
            <span className="relay-live">
              <i /> Listening
            </span>
          </div>
          <div className="relay-path">
            <div className="relay-node">
              <span className="relay-node-icon">↗</span>
              <strong>Public endpoint</strong>
              <code>/e/hk_7vK9</code>
            </div>
            <div className="relay-rail first">
              <i />
            </div>
            <div className="relay-node relay-node-core">
              <span className="relay-node-icon">
                <BrandMark />
              </span>
              <strong>Durable inbox</strong>
              <code>event stored</code>
            </div>
            <div className="relay-rail second">
              <i />
            </div>
            <div className="relay-node">
              <span className="relay-node-icon">⌁</span>
              <strong>Localhost</strong>
              <code>:3000/webhooks</code>
            </div>
          </div>
          <div className="relay-event">
            <span className="relay-method">POST</span>
            <code>/checkout.completed</code>
            <span className="relay-state">
              <i /> Delivered
            </span>
            <span>142 ms</span>
          </div>
        </div>
      </section>

      <section aria-label="Hooky principles" className="landing-principles">
        <article>
          <span>01</span>
          <h2>Never expose localhost.</h2>
          <p>
            Only the outbound CLI connects to Hooky. Your machine keeps every
            port private.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Receive before you relay.</h2>
          <p>
            Every request is durably committed before the sender receives a
            successful response.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>Replay without the wait.</h2>
          <p>
            Payloads, headers, query parameters, and delivery history stay
            together in one quiet inbox.
          </p>
        </article>
      </section>

      <section className="landing-closer">
        <span className="section-kicker">Ready when you are</span>
        <h2>
          Keep the webhook.
          <br />
          Close the tunnel.
        </h2>
        <div>
          <Link className="button button-inverse" href="/sign-up">
            Start with one endpoint
          </Link>
          <code>bunx github:dak-engineering/hooky</code>
        </div>
      </section>

      <footer className="landing-footer">
        <Link aria-label="Hooky home" className="brand" href="/">
          <BrandMark />
          <span>Hooky</span>
        </Link>
        <p>Durable ingress. Outbound local delivery.</p>
        <a href={repositoryUrl}>Public on GitHub ↗</a>
      </footer>
    </main>
  );
}
