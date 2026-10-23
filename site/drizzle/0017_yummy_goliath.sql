CREATE TABLE `role_responsible_history` (
	`public_id` text PRIMARY KEY NOT NULL,
	`area` text NOT NULL,
	`previous_name` text NOT NULL,
	`previous_imas_name` text NOT NULL,
	`name` text NOT NULL,
	`imas_name` text NOT NULL,
	`revision` integer NOT NULL,
	`changed_by_role` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `role_responsibles` (
	`area` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`imas_name` text DEFAULT '' NOT NULL,
	`revision` integer NOT NULL,
	`change_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
