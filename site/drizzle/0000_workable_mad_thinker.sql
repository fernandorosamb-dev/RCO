CREATE TABLE `report_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`report_public_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_photos_public_id_unique` ON `report_photos` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_photos_object_key_unique` ON `report_photos` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_report_photos_report` ON `report_photos` (`report_public_id`);--> statement-breakpoint
CREATE TABLE `service_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`os_number` text NOT NULL,
	`collaborator` text NOT NULL,
	`execution_started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`environment` text NOT NULL,
	`floor` text NOT NULL,
	`observations` text NOT NULL,
	`status` text DEFAULT 'Concluída' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_reports_public_id_unique` ON `service_reports` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_service_reports_os` ON `service_reports` (`os_number`);--> statement-breakpoint
CREATE INDEX `idx_service_reports_created_at` ON `service_reports` (`created_at`);