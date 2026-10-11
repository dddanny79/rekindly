CREATE TABLE `account` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "account_single_row_check" CHECK("account"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`public_key` blob NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_type` text,
	`backed_up` integer DEFAULT false NOT NULL,
	`last_used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text,
	`organization_id` text,
	`label` text,
	`street` text,
	`zip` text,
	`city` text,
	`region` text,
	`country` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "addresses_owner_check" CHECK(("addresses"."person_id" is null) != ("addresses"."organization_id" is null))
);
--> statement-breakpoint
CREATE INDEX `addresses_person_idx` ON `addresses` (`person_id`);--> statement-breakpoint
CREATE INDEX `addresses_organization_idx` ON `addresses` (`organization_id`);--> statement-breakpoint
CREATE TABLE `affiliations` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text,
	`started_on` text,
	`ended_on` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `affiliations_person_idx` ON `affiliations` (`person_id`);--> statement-breakpoint
CREATE INDEX `affiliations_organization_idx` ON `affiliations` (`organization_id`);--> statement-breakpoint
CREATE TABLE `contact_points` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`value` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "contact_points_kind_check" CHECK("contact_points"."kind" in ('phone', 'email', 'url', 'messenger', 'social'))
);
--> statement-breakpoint
CREATE INDEX `contact_points_person_idx` ON `contact_points` (`person_id`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`kind` text NOT NULL,
	`direction` text,
	`occurred_at` text NOT NULL,
	`title` text,
	`body_md` text DEFAULT '' NOT NULL,
	`organization_id` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "entries_kind_check" CHECK("entries"."kind" in ('note', 'call', 'meeting', 'message', 'event')),
	CONSTRAINT "entries_direction_check" CHECK("entries"."direction" is null or "entries"."direction" in ('in', 'out'))
);
--> statement-breakpoint
CREATE INDEX `entries_space_occurred_idx` ON `entries` (`space_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `entries_organization_idx` ON `entries` (`organization_id`);--> statement-breakpoint
CREATE TABLE `entry_people` (
	`entry_id` text NOT NULL,
	`person_id` text NOT NULL,
	PRIMARY KEY(`entry_id`, `person_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_people_person_idx` ON `entry_people` (`person_id`);--> statement-breakpoint
CREATE TABLE `facts` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`text` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `facts_person_idx` ON `facts` (`person_id`);--> statement-breakpoint
CREATE TABLE `field_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`target` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`options` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "field_definitions_target_check" CHECK("field_definitions"."target" in ('person', 'organization')),
	CONSTRAINT "field_definitions_type_check" CHECK("field_definitions"."type" in ('text', 'number', 'date', 'select', 'boolean', 'url'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `field_definitions_target_key_unique` ON `field_definitions` (`target`,`key`);--> statement-breakpoint
CREATE TABLE `field_values` (
	`definition_id` text NOT NULL,
	`target_id` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`definition_id`, `target_id`),
	FOREIGN KEY (`definition_id`) REFERENCES `field_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `field_values_target_idx` ON `field_values` (`target_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`parent_id` text,
	`kind` text,
	`name` text NOT NULL,
	`website` text,
	`notes` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `organizations_space_idx` ON `organizations` (`space_id`);--> statement-breakpoint
CREATE INDEX `organizations_parent_idx` ON `organizations` (`parent_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`first_name` text,
	`middle_name` text,
	`last_name` text,
	`nickname` text,
	`maiden_name` text,
	`prefix` text,
	`suffix` text,
	`pronouns` text,
	`birthday` text,
	`summary` text,
	`met_where` text,
	`met_when` text,
	`met_through_person_id` text,
	`photo_file_id` text,
	`favorite` integer DEFAULT false NOT NULL,
	`contact_every_days` integer,
	`archived_at` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`met_through_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`photo_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "people_birthday_check" CHECK("people"."birthday" is null or "people"."birthday" glob '--[0-1][0-9]-[0-3][0-9]' or "people"."birthday" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE INDEX `people_space_idx` ON `people` (`space_id`);--> statement-breakpoint
CREATE TABLE `person_tags` (
	`person_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`person_id`, `tag_id`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `person_tags_tag_idx` ON `person_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `relationship_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`reverse_name` text,
	`name_key` text,
	`reverse_name_key` text,
	`symmetric` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "relationship_types_name_check" CHECK("relationship_types"."name" is not null or "relationship_types"."name_key" is not null)
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`from_person_id` text NOT NULL,
	`to_person_id` text NOT NULL,
	`type_id` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`from_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `relationship_types`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "relationships_not_self_check" CHECK("relationships"."from_person_id" != "relationships"."to_person_id")
);
--> statement-breakpoint
CREATE INDEX `relationships_from_idx` ON `relationships` (`from_person_id`);--> statement-breakpoint
CREATE INDEX `relationships_to_idx` ON `relationships` (`to_person_id`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text,
	`entry_id` text,
	`title` text NOT NULL,
	`due_at` text NOT NULL,
	`done_at` text,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reminders_recurrence_check" CHECK("reminders"."recurrence" in ('none', 'yearly'))
);
--> statement-breakpoint
CREATE INDEX `reminders_due_idx` ON `reminders` (`due_at`);--> statement-breakpoint
CREATE INDEX `reminders_person_idx` ON `reminders` (`person_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`name_key` text,
	`color` text,
	`ai_allowed` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	CONSTRAINT "spaces_name_check" CHECK("spaces"."name" is not null or "spaces"."name_key" is not null)
);
--> statement-breakpoint
CREATE TABLE `sync_states` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`uid` text NOT NULL,
	`etag` text NOT NULL,
	`href` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_states_uid_unique` ON `sync_states` (`uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_states_person_unique` ON `sync_states` (`person_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (lower("name"));