CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TYPE "public"."delivery_attempt_outcome" AS ENUM('delivered', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'in_flight', 'delivered', 'dead');--> statement-breakpoint
CREATE TYPE "public"."hook_state" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"hook_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"leased_by" text,
	"lease_token_hash" text,
	"leased_until" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_account_id_id_unique" UNIQUE("account_id","id"),
	CONSTRAINT "deliveries_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"listener_id" text NOT NULL,
	"lease_token_hash" text NOT NULL,
	"outcome" "delivery_attempt_outcome",
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "delivery_attempts_delivery_number_unique" UNIQUE("delivery_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "hooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"state" "hook_state" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hooks_account_id_id_unique" UNIQUE("account_id","id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"hook_id" uuid NOT NULL,
	"request_method" text NOT NULL,
	"request_path" text NOT NULL,
	"query" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body" bytea NOT NULL,
	"body_sha256" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "webhook_events_account_id_id_unique" UNIQUE("account_id","id")
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_account_hook_fk" FOREIGN KEY ("account_id","hook_id") REFERENCES "public"."hooks"("account_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_account_event_fk" FOREIGN KEY ("account_id","event_id") REFERENCES "public"."webhook_events"("account_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_account_delivery_fk" FOREIGN KEY ("account_id","delivery_id") REFERENCES "public"."deliveries"("account_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hooks" ADD CONSTRAINT "hooks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_account_hook_fk" FOREIGN KEY ("account_id","hook_id") REFERENCES "public"."hooks"("account_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_claim_index" ON "deliveries" USING btree ("account_id","hook_id","status","available_at","leased_until");--> statement-breakpoint
CREATE INDEX "delivery_attempts_account_delivery_index" ON "delivery_attempts" USING btree ("account_id","delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hooks_account_id_name_unique" ON "hooks" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "webhook_events_hook_received_at_index" ON "webhook_events" USING btree ("account_id","hook_id","received_at");--> statement-breakpoint
CREATE FUNCTION reject_webhook_event_update() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'webhook events are immutable';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER webhook_events_immutable
	BEFORE UPDATE ON webhook_events
	FOR EACH ROW
	EXECUTE FUNCTION reject_webhook_event_update();
