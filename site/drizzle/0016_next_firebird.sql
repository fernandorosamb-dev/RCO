CREATE TABLE `work_order_schedule` (
	`work_order_public_id` text PRIMARY KEY NOT NULL,
	`original_date` text NOT NULL,
	`execution_date` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`changed_by_role` text NOT NULL,
	`change_id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_order_schedule_change_id_unique` ON `work_order_schedule` (`change_id`);--> statement-breakpoint
CREATE TABLE `work_order_schedule_history` (
	`public_id` text PRIMARY KEY NOT NULL,
	`work_order_public_id` text NOT NULL,
	`previous_date` text NOT NULL,
	`execution_date` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`changed_by_role` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_schedule_history_revision` ON `work_order_schedule_history` (`work_order_public_id`,`revision`);