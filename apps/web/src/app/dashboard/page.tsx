import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AccountControl,
  ApiKeysControl,
  CommandCopy,
  EventInspector,
  HookActions,
} from "@/components/dashboard-controls";
import { BrandMark } from "@/components/brand-mark";
import { ArrowIcon, CheckIcon, GridIcon, HookIcon } from "@/components/icons";
import { auth } from "@/lib/auth";
import {
  accountStore,
  apiTokenStore,
  eventStore,
  hookStore,
} from "@/lib/server-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function relativeTime(date: Date) {
  const seconds = Math.round((date.getTime() - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function readableBody(
  body: Buffer,
  headersValue: Record<string, string | string[]>,
) {
  const contentType = String(headersValue["content-type"] ?? "");
  const text = body.toString("utf8");
  if (contentType.includes("json")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return /^[\s\x20-\x7e]*$/.test(text) ? text : body.toString("base64");
}

function statusLabel(status: string) {
  if (status === "in_flight") return "In flight";
  return status[0]!.toUpperCase() + status.slice(1);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    hook?: string;
    event?: string;
    status?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const account = await accountStore.ensurePersonalAccount({
    userId: session.user.id,
    name: session.user.name,
  });
  const params = await searchParams;
  const [hooks, tokens] = await Promise.all([
    hookStore.listHooks({ accountId: account.accountId }),
    apiTokenStore.listTokens({ accountId: account.accountId }),
  ]);
  const selectedHook =
    hooks.find((hook) => hook.hookId === params.hook) ?? hooks[0];
  const allEvents = selectedHook
    ? await eventStore.listRecentEvents({
        accountId: account.accountId,
        hookId: selectedHook.hookId,
        limit: 50,
      })
    : [];
  const statusFilter = ["pending", "delivered"].includes(params.status ?? "")
    ? params.status
    : undefined;
  const events = statusFilter
    ? allEvents.filter((event) => event.status === statusFilter)
    : allEvents;
  const selectedEventId =
    events.find((event) => event.eventId === params.event)?.eventId ??
    events[0]?.eventId;
  const selectedEvent = selectedEventId
    ? await eventStore.getEvent({
        accountId: account.accountId,
        eventId: selectedEventId,
      })
    : null;
  const command = selectedHook
    ? `hooky listen --to http://localhost:3000/webhooks --hook ${selectedHook.name}`
    : "hooky listen --to http://localhost:3000/webhooks --new local";

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link aria-label="Hooky home" className="dashboard-brand" href="/">
          <BrandMark />
          <span>Hooky</span>
        </Link>
        <p className="sidebar-section-label">Workspace</p>
        <nav aria-label="Dashboard navigation" className="sidebar-navigation">
          <Link className="sidebar-link" href="/dashboard">
            <GridIcon /> Overview
          </Link>
          <a className="sidebar-link active" href="#hooks">
            <HookIcon /> Hooks
          </a>
          <ApiKeysControl
            tokens={tokens.map((token) => ({
              ...token,
              lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
              revokedAt: token.revokedAt?.toISOString() ?? null,
            }))}
          />
        </nav>
        <div className="sidebar-hooks" id="hooks">
          <p>Endpoints</p>
          {hooks.map((hook) => (
            <Link
              className={
                hook.hookId === selectedHook?.hookId
                  ? "hook-link selected"
                  : "hook-link"
              }
              href={`/dashboard?hook=${hook.hookId}`}
              key={hook.hookId}
            >
              <HookIcon />
              <span>
                {hook.name}
                <small>{hook.state}</small>
              </span>
            </Link>
          ))}
        </div>
        <AccountControl name={account.name} />
      </aside>

      <section className="dashboard-workspace">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">Hook endpoint</span>
            <h1>{selectedHook?.name ?? "Your hooks"}</h1>
            <p>
              {selectedHook ? (
                <>
                  Durable ingress <i /> <span>{selectedHook.state}</span>
                </>
              ) : (
                "Create an endpoint to begin."
              )}
            </p>
          </div>
          <HookActions hookId={selectedHook?.hookId} />
        </header>

        <div className="command-strip">
          <div>
            <span>Listener command</span>
            <code>
              <b>$</b> {command}
            </code>
          </div>
          <CommandCopy command={command} />
        </div>

        <div className="dashboard-content">
          <section className="events-region">
            <div className="events-heading">
              <div>
                <h2>Recent events</h2>
                <p>Requests captured by this endpoint.</p>
              </div>
              {selectedHook ? (
                <div className="status-filters">
                  {[
                    ["", "All"],
                    ["pending", "Pending"],
                    ["delivered", "Delivered"],
                  ].map(([value, label]) => (
                    <Link
                      aria-current={
                        (statusFilter ?? "") === value ? "page" : undefined
                      }
                      href={`/dashboard?hook=${selectedHook.hookId}${value ? `&status=${value}` : ""}`}
                      key={label}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            {selectedHook && events.length ? (
              <div className="events-table" role="table">
                <div className="events-table-head" role="row">
                  <span>Method / path</span>
                  <span>Received</span>
                  <span>Status</span>
                  <span>Attempts</span>
                </div>
                {events.map((event) => (
                  <Link
                    className={
                      event.eventId === selectedEventId
                        ? "event-row-link selected"
                        : "event-row-link"
                    }
                    href={`/dashboard?hook=${selectedHook.hookId}&event=${event.eventId}${statusFilter ? `&status=${statusFilter}` : ""}`}
                    key={event.eventId}
                    role="row"
                  >
                    <span className="event-path">
                      <ArrowIcon />
                      <b
                        className={`method-tag method-${event.requestMethod.toLowerCase()}`}
                      >
                        {event.requestMethod}
                      </b>
                      {event.requestPath}
                    </span>
                    <span>{relativeTime(event.receivedAt)}</span>
                    <span className={`delivery-state state-${event.status}`}>
                      <CheckIcon />
                      {statusLabel(event.status)}
                    </span>
                    <span>{event.attemptCount}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="events-empty">
                <HookIcon />
                <h3>
                  {selectedHook
                    ? "Waiting for the first event."
                    : "Create your first hook."}
                </h3>
                <p>
                  {selectedHook
                    ? "Send a webhook to this endpoint and it will appear here durably."
                    : "Hooky will create a public URL and keep every request until your CLI is ready."}
                </p>
              </div>
            )}

            <div className="cli-install">
              <span aria-hidden="true">›_</span>
              <p>
                <strong>Install the Hooky CLI</strong>
                <code>bunx github:dak-engineering/hooky</code>
              </p>
              <CommandCopy command="bunx github:dak-engineering/hooky" />
            </div>
          </section>

          <aside className="event-inspector">
            {selectedEvent ? (
              <>
                <span className="inspector-kicker">Event detail</span>
                <div className="inspector-heading">
                  <div>
                    <h2>
                      {selectedEvent.requestMethod} {selectedEvent.requestPath}
                    </h2>
                    <p>{formatTime(selectedEvent.receivedAt)}</p>
                  </div>
                  <span
                    className={`delivery-state state-${selectedEvent.status}`}
                  >
                    <CheckIcon />
                    {statusLabel(selectedEvent.status)}
                  </span>
                </div>
                <EventInspector
                  body={readableBody(selectedEvent.body, selectedEvent.headers)}
                  headers={selectedEvent.headers}
                  query={selectedEvent.query}
                />
                <section className="delivery-history">
                  <h3>Delivery history</h3>
                  <div className="history-item">
                    <CheckIcon />
                    <span>
                      <strong>Received</strong>
                      <small>{formatTime(selectedEvent.receivedAt)}</small>
                    </span>
                  </div>
                  {selectedEvent.attempts.map((attempt) => (
                    <div className="history-item" key={attempt.attemptNumber}>
                      <CheckIcon />
                      <span>
                        <strong>Leased to {attempt.listenerId}</strong>
                        <small>{formatTime(attempt.startedAt)}</small>
                        <em>
                          {attempt.outcome
                            ? statusLabel(attempt.outcome)
                            : "In flight"}
                        </em>
                      </span>
                    </div>
                  ))}
                </section>
              </>
            ) : (
              <div className="inspector-empty">
                <p>
                  Select an event to inspect its exact body, headers, query, and
                  delivery history.
                </p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
