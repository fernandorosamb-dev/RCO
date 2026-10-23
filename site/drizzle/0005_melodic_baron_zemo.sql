ALTER TABLE `service_reports` ADD `origin` text DEFAULT 'sistema' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `activity_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `equipment` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `area` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `created_by_role` text DEFAULT '' NOT NULL;