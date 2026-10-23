CREATE TABLE `imas_automation_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`report_public_id` text NOT NULL,
	`version` text NOT NULL,
	`state` text NOT NULL,
	`step` text NOT NULL,
	`trace_json` text NOT NULL,
	`diagnostics_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_imas_runs_report_updated` ON `imas_automation_runs` (`report_public_id`,`updated_at`);