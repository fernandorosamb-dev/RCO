CREATE TABLE `imas_automation_requests` (
	`report_public_id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`state` text NOT NULL,
	`requested_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imas_automation_requests_request_id_unique` ON `imas_automation_requests` (`request_id`);