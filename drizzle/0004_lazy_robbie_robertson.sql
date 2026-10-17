CREATE TABLE "analytics_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"tile" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"sources" text[] NOT NULL,
	"added_on" date DEFAULT now() NOT NULL,
	"added_by" text NOT NULL,
	"retired_on" date,
	"retired_by" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
