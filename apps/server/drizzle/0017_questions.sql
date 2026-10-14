CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`text` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`asked_at` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `questions_person_idx` ON `questions` (`person_id`);--> statement-breakpoint
CREATE TRIGGER `questions_search_insert` AFTER INSERT ON `questions` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `questions_search_update` AFTER UPDATE ON `questions` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `questions_search_delete` AFTER DELETE ON `questions` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
END;
