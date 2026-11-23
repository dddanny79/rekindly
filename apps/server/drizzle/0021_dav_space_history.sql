ALTER TABLE `dav_cards` ADD `space_history` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `dav_cards` SET `space_history` = json_array(`space_id`);