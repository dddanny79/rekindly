ALTER TABLE `person_dates` ADD `remind` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_feeds` ADD `birthdays` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
UPDATE `calendar_feeds` SET `birthdays` = 'all' WHERE `include_birthdays` = 1;--> statement-breakpoint
ALTER TABLE `calendar_feeds` DROP COLUMN `include_birthdays`;