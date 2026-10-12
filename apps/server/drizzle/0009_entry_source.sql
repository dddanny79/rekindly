ALTER TABLE `entries` ADD `source` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
-- Change logs written for CardDAV devices before this column existed.
UPDATE `entries` SET `source` = 'sync' WHERE `kind` = 'note' AND `title` IN ('Über Sync geändert', 'Über Sync angelegt', 'Changed via sync', 'Added via sync');
