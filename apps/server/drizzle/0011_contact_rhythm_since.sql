ALTER TABLE `people` ADD `contact_rhythm_since` text;--> statement-breakpoint
-- Existing rhythms count from today.
UPDATE `people` SET `contact_rhythm_since` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `contact_every_days` IS NOT NULL;
