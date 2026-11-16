ALTER TABLE `tasks` ADD `planned_date` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeat_rule` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeat_parent_id` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `origin_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_repeat_parent_unique` ON `tasks` (`repeat_parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_origin_key_unique` ON `tasks` (`origin_key`);