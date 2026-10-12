CREATE TABLE `person_views` (
	`person_id` text PRIMARY KEY NOT NULL,
	`viewed_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `person_views_viewed_idx` ON `person_views` (`viewed_at`);--> statement-breakpoint
CREATE TABLE `search_documents` (
	`id` integer PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`space_id` text NOT NULL,
	`fields` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_documents_entity_unique` ON `search_documents` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `search_documents_space_idx` ON `search_documents` (`space_id`);--> statement-breakpoint
CREATE TABLE `search_queue` (
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	PRIMARY KEY(`kind`, `entity_id`)
);
