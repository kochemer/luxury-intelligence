CREATE TABLE "analytics_salts" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_hits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"path" text NOT NULL,
	"entry" boolean DEFAULT false NOT NULL,
	"channel" text,
	"referrer" text,
	"country" text,
	"device" text,
	"visitor" text,
	"bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "page_hits_day_idx" ON "page_hits" USING btree ("day");