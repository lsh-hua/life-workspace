ALTER TABLE `pomodoros` ADD `session_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `pomodoros_session_id_unique` ON `pomodoros` (`session_id`);