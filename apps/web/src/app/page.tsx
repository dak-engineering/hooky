import Link from "next/link";

const repositoryUrl = "https://github.com/dak-engineering/hooky";

export default function HomePage() {
  return (
    <main>
      <nav aria-label="Primary navigation" className="navigation">
        <Link aria-label="Hooky home" className="brand" href="/">
          <span aria-hidden="true" className="brand-mark">
            H
          </span>
          <span>Hooky</span>
        </Link>
        <a className="repository-link" href={repositoryUrl}>
          GitHub
        </a>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <h1>Webhooks should wait for you.</h1>
          <p>
            Hooky stores incoming webhooks and delivers them when your local
            environment is ready.
          </p>
          <a className="primary-link" href={repositoryUrl}>
            Follow the build on GitHub
            <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div aria-label="Webhook delivery preview" className="delivery-preview">
          <div className="preview-header">
            <span className="window-controls" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>hooky listen</span>
          </div>
          <div className="terminal" role="presentation">
            <p>
              <span className="prompt">$</span> hooky listen stripe-dev
            </p>
            <p className="muted">Public URL ready</p>
            <p className="url">https://hooks.example/e/wh_7vK9...</p>
            <div className="event-row">
              <span className="method">POST</span>
              <span>/checkout</span>
              <span className="received">received</span>
            </div>
            <div className="event-row">
              <span className="status">200</span>
              <span>localhost:3000/webhooks</span>
              <span className="delivered">delivered</span>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <p>Durable ingress. Outbound local delivery. No public tunnel.</p>
        <span>Milestone 0</span>
      </footer>
    </main>
  );
}
