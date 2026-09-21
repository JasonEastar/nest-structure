CREATE TABLE "saved_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"point" geography(Point,4326) NOT NULL,
	"radius_m" integer DEFAULT 500 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_locations" ADD CONSTRAINT "saved_locations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_locations_user_created_idx" ON "saved_locations" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "saved_locations_point_gist" ON "saved_locations" USING gist ("point");