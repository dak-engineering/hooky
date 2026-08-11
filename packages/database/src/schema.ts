import {
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const hookState = pgEnum("hook_state", ["active", "disabled"]);
export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "in_flight",
  "delivered",
  "dead",
]);
export const deliveryAttemptOutcome = pgEnum("delivery_attempt_outcome", [
  "delivered",
  "failed",
  "expired",
]);
export const accountMemberRole = pgEnum("account_member_role", [
  "owner",
  "member",
]);

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (table) => [index("auth_sessions_user_id_index").on(table.userId)],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("auth_accounts_user_id_index").on(table.userId)],
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("auth_verifications_identifier_index").on(table.identifier),
  ],
);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const accountMembers = pgTable(
  "account_members",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: accountMemberRole("role").default("member").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.userId] }),
    uniqueIndex("account_members_user_id_unique").on(table.userId),
  ],
);

export const hooks = pgTable(
  "hooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    state: hookState("state").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("hooks_account_id_id_unique").on(table.accountId, table.id),
    uniqueIndex("hooks_account_id_name_unique").on(table.accountId, table.name),
  ],
);

export const hookSecrets = pgTable(
  "hook_secrets",
  {
    hookId: uuid("hook_id")
      .primaryKey()
      .references(() => hooks.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    ingressSecretHash: text("ingress_secret_hash").notNull().unique(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.accountId, table.hookId],
      foreignColumns: [hooks.accountId, hooks.id],
      name: "hook_secrets_account_hook_fk",
    }).onDelete("cascade"),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id").notNull(),
    hookId: uuid("hook_id").notNull(),
    requestMethod: text("request_method").notNull(),
    requestPath: text("request_path").notNull(),
    query: jsonb("query")
      .$type<Record<string, string | string[]>>()
      .default({})
      .notNull(),
    headers: jsonb("headers")
      .$type<Record<string, string | string[]>>()
      .default({})
      .notNull(),
    body: bytea("body").notNull(),
    bodySha256: text("body_sha256").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("webhook_events_account_id_id_unique").on(table.accountId, table.id),
    foreignKey({
      columns: [table.accountId, table.hookId],
      foreignColumns: [hooks.accountId, hooks.id],
      name: "webhook_events_account_hook_fk",
    }).onDelete("cascade"),
    index("webhook_events_hook_received_at_index").on(
      table.accountId,
      table.hookId,
      table.receivedAt,
    ),
  ],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id").notNull(),
    hookId: uuid("hook_id").notNull(),
    eventId: uuid("event_id").notNull(),
    status: deliveryStatus("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    leasedBy: text("leased_by"),
    leaseTokenHash: text("lease_token_hash"),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("deliveries_account_id_id_unique").on(table.accountId, table.id),
    unique("deliveries_event_id_unique").on(table.eventId),
    foreignKey({
      columns: [table.accountId, table.hookId],
      foreignColumns: [hooks.accountId, hooks.id],
      name: "deliveries_account_hook_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.accountId, table.eventId],
      foreignColumns: [webhookEvents.accountId, webhookEvents.id],
      name: "deliveries_account_event_fk",
    }).onDelete("cascade"),
    index("deliveries_claim_index").on(
      table.accountId,
      table.hookId,
      table.status,
      table.availableAt,
      table.leasedUntil,
    ),
  ],
);

export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull(),
    deliveryId: uuid("delivery_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    listenerId: text("listener_id").notNull(),
    leaseTokenHash: text("lease_token_hash").notNull(),
    outcome: deliveryAttemptOutcome("outcome"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    unique("delivery_attempts_delivery_number_unique").on(
      table.deliveryId,
      table.attemptNumber,
    ),
    foreignKey({
      columns: [table.accountId, table.deliveryId],
      foreignColumns: [deliveries.accountId, deliveries.id],
      name: "delivery_attempts_account_delivery_fk",
    }).onDelete("cascade"),
    index("delivery_attempts_account_delivery_index").on(
      table.accountId,
      table.deliveryId,
    ),
  ],
);
