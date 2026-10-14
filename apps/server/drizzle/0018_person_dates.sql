CREATE TABLE `person_dates` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`date` text NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `person_dates_person_idx` ON `person_dates` (`person_id`);--> statement-breakpoint
ALTER TABLE `calendar_feeds` ADD `include_dates` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TRIGGER `person_dates_search_insert` AFTER INSERT ON `person_dates` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `person_dates_search_update` AFTER UPDATE ON `person_dates` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `person_dates_search_delete` AFTER DELETE ON `person_dates` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
END;
