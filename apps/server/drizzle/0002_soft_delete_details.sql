DROP INDEX `tags_name_unique`;--> statement-breakpoint
ALTER TABLE `tags` ADD `deleted_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (lower("name")) WHERE "tags"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE `addresses` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `affiliations` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `contact_points` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `relationships` ADD `deleted_at` text;