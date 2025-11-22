-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Nov 22, 2025 at 06:29 PM
-- Server version: 8.0.44-0ubuntu0.24.04.1
-- PHP Version: 8.3.6

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `ssh_control_panel`
--

-- --------------------------------------------------------

--
-- Table structure for table `script_logs`
--

CREATE TABLE `script_logs` (
  `id` int NOT NULL,
  `scriptName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `command` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('RUNNING','SUCCESS','FAILED','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RUNNING',
  `output` longtext COLLATE utf8mb4_unicode_ci,
  `error` text COLLATE utf8mb4_unicode_ci,
  `startTime` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endTime` datetime(3) DEFAULT NULL,
  `duration` int DEFAULT NULL,
  `userId` int NOT NULL,
  `serverId` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `servers`
--

CREATE TABLE `servers` (
  `id` int NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `host` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `port` int NOT NULL DEFAULT '22',
  `username` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `status` enum('CONNECTED','DISCONNECTED','ERROR','CONNECTING') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DISCONNECTED',
  `lastChecked` datetime(3) DEFAULT NULL,
  `systemInfo` json DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `userId` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `server_logs`
--

CREATE TABLE `server_logs` (
  `id` int NOT NULL,
  `logType` enum('CONNECTION','COMMAND','ERROR','SYSTEM','AUTH') COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `data` json DEFAULT NULL,
  `timestamp` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `serverId` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('ADMIN','DEVELOPER') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DEVELOPER',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `email`, `password`, `name`, `role`, `isActive`, `createdAt`, `updatedAt`) VALUES
(1, '94faddy@gmail.com', '$2b$12$BNl8N2a2/rVb9dIuRjOfqO8vQXy7zDLaT9HOUsVBWRe5ZCDdpxDE6', 'Super Admin', 'ADMIN', 1, '2025-11-22 18:27:45.000', '2025-11-22 18:27:45.000');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `script_logs`
--
ALTER TABLE `script_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `script_logs_userId_fkey` (`userId`),
  ADD KEY `script_logs_serverId_fkey` (`serverId`);

--
-- Indexes for table `servers`
--
ALTER TABLE `servers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `servers_userId_fkey` (`userId`);

--
-- Indexes for table `server_logs`
--
ALTER TABLE `server_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `server_logs_serverId_fkey` (`serverId`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `users_email_key` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `script_logs`
--
ALTER TABLE `script_logs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `servers`
--
ALTER TABLE `servers`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `server_logs`
--
ALTER TABLE `server_logs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `script_logs`
--
ALTER TABLE `script_logs`
  ADD CONSTRAINT `script_logs_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `servers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `script_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

--
-- Constraints for table `servers`
--
ALTER TABLE `servers`
  ADD CONSTRAINT `servers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `server_logs`
--
ALTER TABLE `server_logs`
  ADD CONSTRAINT `server_logs_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `servers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
