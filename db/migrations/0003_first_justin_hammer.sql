CREATE TABLE `course_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`week` integer NOT NULL,
	`action` text NOT NULL,
	`day_of_week` integer,
	`start_period` integer,
	`end_period` integer,
	`location` text,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_overrides_unique` ON `course_overrides` (`course_id`,`week`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`teacher` text,
	`location` text,
	`color` text,
	`day_of_week` integer NOT NULL,
	`start_period` integer NOT NULL,
	`end_period` integer NOT NULL,
	`start_week` integer DEFAULT 1 NOT NULL,
	`end_week` integer DEFAULT 16 NOT NULL,
	`week_type` text DEFAULT 'all' NOT NULL,
	`created_at` text NOT NULL
);
