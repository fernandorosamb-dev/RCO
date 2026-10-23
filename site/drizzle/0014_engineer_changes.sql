CREATE TABLE `change_requests` (
	`public_id` text PRIMARY KEY NOT NULL,
	`report_public_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`action` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`before_json` text DEFAULT '{}' NOT NULL,
	`after_json` text DEFAULT '{}' NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_change_requests_state` ON `change_requests` (`state`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_change_requests_report` ON `change_requests` (`report_public_id`);
--> statement-breakpoint
CREATE TABLE `batch_requests` (
	`public_id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`requested_by` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`claimed_at` integer
);
