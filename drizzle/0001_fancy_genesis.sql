CREATE TABLE `codeSnippets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`input` longtext NOT NULL,
	`code` longtext NOT NULL,
	`language` varchar(32) NOT NULL,
	`explanation` longtext,
	`type` enum('generated','debugged','optimized') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `codeSnippets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `executionResults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`queryHistoryId` int NOT NULL,
	`rowsAffected` int,
	`rowsReturned` int,
	`result` longtext,
	`error` text,
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `executionResults_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `queryHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('sql','code') NOT NULL,
	`language` varchar(32),
	`input` longtext NOT NULL,
	`query` longtext,
	`explanation` longtext,
	`schemaId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`executedAt` timestamp,
	CONSTRAINT `queryHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schemaDefinitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`schema` longtext NOT NULL,
	`format` enum('sql','json') NOT NULL DEFAULT 'sql',
	`description` text,
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schemaDefinitions_id` PRIMARY KEY(`id`)
);
