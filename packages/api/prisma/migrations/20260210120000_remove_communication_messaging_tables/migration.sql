-- Remove communication & messaging module tables (keep only email_notification_configs).
-- Order: drop dependent tables first (conversation_participants references messages via last_read_message_id).

-- Messaging (conversation_participants must be dropped before messages)
DROP TABLE IF EXISTS "message_read_receipts";
DROP TABLE IF EXISTS "conversation_participants";
DROP TABLE IF EXISTS "messages";
DROP TABLE IF EXISTS "conversations";

-- In-app notifications (FK to communications)
DROP TABLE IF EXISTS "in_app_notifications";

-- Communication (templates, rules, history, preferences)
DROP TABLE IF EXISTS "communications";
DROP TABLE IF EXISTS "communication_preferences";
DROP TABLE IF EXISTS "notification_rules";
DROP TABLE IF EXISTS "communication_templates";

-- Drop enums only used by removed tables
DROP TYPE IF EXISTS "MessageStatus";
DROP TYPE IF EXISTS "ConversationStatus";
DROP TYPE IF EXISTS "ConversationType";
DROP TYPE IF EXISTS "InAppNotificationPriority";
DROP TYPE IF EXISTS "InAppNotificationStatus";
DROP TYPE IF EXISTS "CommunicationStatus";
DROP TYPE IF EXISTS "CommunicationChannel";
DROP TYPE IF EXISTS "CommunicationType";
DROP TYPE IF EXISTS "CommunicationRecipientType";
DROP TYPE IF EXISTS "EventTrigger";
