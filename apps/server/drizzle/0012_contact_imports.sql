CREATE TABLE `contact_import_items` (
	`import_id` text NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`fields` text,
	PRIMARY KEY(`import_id`, `table_name`, `row_id`),
	FOREIGN KEY (`import_id`) REFERENCES `contact_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_import_items_row_idx` ON `contact_import_items` (`table_name`,`row_id`);--> statement-breakpoint
CREATE TABLE `contact_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`format` text NOT NULL,
	`file_name` text,
	`space_id` text NOT NULL,
	`created_count` integer DEFAULT 0 NOT NULL,
	`merged_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_imports_format_check" CHECK("contact_imports"."format" in ('vcard', 'csv', 'monica'))
);
