# Notification shortcut

| Field | Value |
| --- | --- |
| Date created | 2026-11-10 |
| Date last updated | 2026-11-10 |
| Status | `built` |

## Why

Let users glance at their notices from any page and see when their inbox has been cleared.

## How it works

The bell previews the five most recent notices in the Student, Faculty, Staff and Librarian workspaces. Open a notice to follow its link, use the checkmark to mark it as read, or select **See all** for the full inbox. After **Delete all** succeeds, the preview shows **No notifications yet** and the unread badge clears. The preview uses the existing signed-in user's inbox API and deletion rules. This change requires no database migration.

## Implementation tracking

- [x] Add the preview and existing-inbox shortcut.
- [x] Refresh the inbox and badge after read or delete actions.
- [x] Cover preview navigation, marking read and bulk deletion with a browser-facing test.

## Change log

- **2026-11-10:** Added the header notification preview and synchronized it with the existing inbox.
