CREATE TABLE `medical_documents` (
	`public_id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`submission_token` text NOT NULL,
	`created_by_role` text NOT NULL,
	`data_json` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`email_status` text DEFAULT 'pending_configuration' NOT NULL,
	`email_error` text DEFAULT '' NOT NULL,
	`gmail_message_id` text DEFAULT '' NOT NULL,
	`email_sent_at` integer,
	`supervisor_seen_at` integer,
	`engineer_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `medical_documents_reference_unique` ON `medical_documents` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `medical_documents_submission_token_unique` ON `medical_documents` (`submission_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `medical_documents_object_key_unique` ON `medical_documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_medical_documents_role_created` ON `medical_documents` (`created_by_role`,`created_at`);