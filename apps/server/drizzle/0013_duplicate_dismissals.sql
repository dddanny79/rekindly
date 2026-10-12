CREATE TABLE `duplicate_dismissals` (
	`person_a_id` text NOT NULL,
	`person_b_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`person_a_id`, `person_b_id`),
	FOREIGN KEY (`person_a_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_b_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "duplicate_dismissals_order_check" CHECK("duplicate_dismissals"."person_a_id" < "duplicate_dismissals"."person_b_id")
);
--> statement-breakpoint
CREATE INDEX `duplicate_dismissals_b_idx` ON `duplicate_dismissals` (`person_b_id`);