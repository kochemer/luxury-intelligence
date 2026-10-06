CREATE TABLE "article_clicks" (
	"day" date NOT NULL,
	"url" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"n" integer NOT NULL,
	CONSTRAINT "article_clicks_day_url_pk" PRIMARY KEY("day","url")
);
