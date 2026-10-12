CREATE TABLE `app_passwords` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`space_ids` text,
	`last_used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_passwords_token_unique` ON `app_passwords` (`token_hash`);--> statement-breakpoint
CREATE TABLE `dav_cards` (
	`person_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`uid` text NOT NULL,
	`space_id` text NOT NULL,
	`etag` text NOT NULL,
	`vcard` text NOT NULL,
	`photo_file_id` text,
	`seq` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dav_cards_seq_idx` ON `dav_cards` (`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `dav_cards_name_unique` ON `dav_cards` (`name`);--> statement-breakpoint
CREATE TABLE `dav_extras` (
	`person_id` text PRIMARY KEY NOT NULL,
	`lines` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
-- Build the vCard cache for everybody (the search flush also writes dav_cards).
INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', `id` FROM `people`;
