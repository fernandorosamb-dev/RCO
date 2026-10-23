ALTER TABLE `service_reports` ADD `photo_approval_status` text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `photo_approved_at` integer;