CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sites` ADD `group_id` integer;--> statement-breakpoint
ALTER TABLE `sites` ADD `item_type` text DEFAULT 'url' NOT NULL;