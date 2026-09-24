-- Let users remove crowded inbox items without allowing the notification worker
-- to recreate the same deduplicated milestone.
ALTER TABLE `notifications`
  ADD COLUMN `deleted_at` DATETIME DEFAULT NULL AFTER `read_at`,
  ADD KEY `idx_notification_user_deleted` (`user_id`, `deleted_at`, `notification_timestamp`);
