CREATE TABLE `service_documents` (
	`public_id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`created_by_role` text NOT NULL,
	`kind` text NOT NULL,
	`data_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_documents_reference_unique` ON `service_documents` (`reference`);--> statement-breakpoint
CREATE INDEX `idx_service_documents_role_created` ON `service_documents` (`created_by_role`,`created_at`);