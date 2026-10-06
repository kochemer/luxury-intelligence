CREATE TABLE "visit_history" (
	"day" date NOT NULL,
	"dim" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"n" integer NOT NULL,
	CONSTRAINT "visit_history_day_dim_value_pk" PRIMARY KEY("day","dim","value")
);
