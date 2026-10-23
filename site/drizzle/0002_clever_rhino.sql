CREATE TABLE `os_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`competence` text NOT NULL,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`os_count` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `os_imports_public_id_unique` ON `os_imports` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `os_imports_object_key_unique` ON `os_imports` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_os_imports_competence` ON `os_imports` (`competence`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`import_public_id` text,
	`competence` text NOT NULL,
	`os_number` text NOT NULL,
	`client` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`environment` text DEFAULT '' NOT NULL,
	`floor` text DEFAULT '' NOT NULL,
	`opened_at` text DEFAULT '' NOT NULL,
	`due_at` text DEFAULT '' NOT NULL,
	`original_status` text DEFAULT 'Aberta' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`equipment` text DEFAULT '' NOT NULL,
	`assigned_area` text DEFAULT '' NOT NULL,
	`assigned_responsible` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Atribuir' NOT NULL,
	`imported_text` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_orders_public_id_unique` ON `work_orders` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_work_orders_competence_os` ON `work_orders` (`competence`,`os_number`);--> statement-breakpoint
CREATE INDEX `idx_work_orders_area_status` ON `work_orders` (`assigned_area`,`status`);--> statement-breakpoint
ALTER TABLE `service_reports` ADD `work_order_public_id` text;