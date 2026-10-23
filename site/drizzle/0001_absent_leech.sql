CREATE TABLE `meter_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`reading_date` text NOT NULL,
	`collaborator` text NOT NULL,
	`water_street` integer NOT NULL,
	`water_well` integer NOT NULL,
	`electric_1` integer NOT NULL,
	`electric_2` integer NOT NULL,
	`occurrence` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meter_readings_public_id_unique` ON `meter_readings` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `meter_readings_reading_date_unique` ON `meter_readings` (`reading_date`);--> statement-breakpoint
CREATE INDEX `idx_meter_readings_date` ON `meter_readings` (`reading_date`);