# Messaging contracts

## Receipt meaning

- **Sent:** the server persisted the message and linked it to a conversation before returning it from `POST /api/message/send/:receiver`.
- **Delivered:** at least one authenticated recipient socket acknowledged receiving the complete message payload. Emitting to a socket alone does not mark delivery.
- **Read:** an authenticated recipient marked that message ID after it appeared in the visible part of the active chat. The server accepts only messages addressed to that recipient from the specified sender. Read implies delivered.

`receiptVersion: 1`, `deliveredAt`, and `readAt` are additive fields on new messages. Historical messages have no receipt version, stay in the sent/unknown state, and are excluded from unread counts. No existing documents need a backfill. `clientMessageId` is optional; new clients reuse it on a retry. A unique index on `(sender, clientMessageId)` prevents duplicate persisted messages. The server waits for the message indexes before listening.

## HTTP

- `GET /api/message/inbox` returns one compact summary per contact with a last message and persisted unread count. Contacts without messages are supplied by the existing user list.
- `GET /api/message/get/:receiver` returns the authenticated two-person message history in creation order.
- `POST /api/message/send/:receiver` retains the existing text/image contract and accepts an optional `clientMessageId`. A retry with the same ID returns the original message.
- `POST /api/message/read/:sender` accepts up to 100 `messageIds` and updates only messages addressed to the authenticated caller from that sender.

## Socket.IO

- `newMessage`: complete incoming message for each recipient tab.
- `pendingMessages`: batches of undelivered messages on reconnect.
- `messageDelivered`: recipient acknowledgement with message IDs previously sent to that socket. The server verifies the socket identity and message ownership.
- `messageCreated`: new outgoing message for every sender tab.
- `messageStatus`: delivered/read timestamp change for both participants' tabs.
- `inboxUpdated`: refetch the compact inbox summary after a send or read.
- `typing:start` / `typing:stop`: client supplies only a recipient ID. The server supplies the authenticated sender ID, combines multiple sender tabs, and clears stale typing after four seconds or disconnect.

Read and delivery updates are idempotent. Inbox state is fetched again on connection; active message history is fetched again on reconnection. Socket events and old HTTP request bodies remain compatible with existing clients.

## Phase 9 message changes

All endpoints use the existing authenticated cookie and origin checks. Message IDs remain MongoDB `_id` values, and the existing send, history, inbox, receipt, and image-upload contracts remain valid. Responses add `reactions` (one `{ user, emoji }` entry per reacting user), `replyTo`, `replyPreview`, `editedAt`, `deletedAt`, and `revision`. Missing fields on historical messages are treated as empty or null. `revision` is the server-managed `__v` counter, incremented atomically by reaction, edit, and deletion updates; receipt changes do not affect it.

- `PUT /api/message/:messageId/reaction` accepts `{ "emoji": "👍" }` or `{ "emoji": null }` to remove the caller's reaction. Supported values are 👍 ❤️ 😂 😮 😢 🔥. The authenticated caller must be a participant. A conditional revision update retries conflicting writes, so concurrent participants cannot overwrite each other's reactions.
- `POST /api/message/send/:receiver` accepts optional `replyTo` in the existing form data or JSON body. The referenced message must belong to the same two-person conversation. A deleted original can be referenced, with a tombstone preview.
- `PATCH /api/message/:messageId` accepts `{ "message": "new text", "expectedEditedAt": null }` for an unedited message, or the last `editedAt` ISO timestamp for a previously edited message. Only the sender may edit a text-only, live message. The server advances `editedAt` monotonically and conditionally updates on that value. A concurrent reaction therefore does not cause a text-edit conflict; a concurrent text edit returns `409`.
- `DELETE /api/message/:messageId` deletes the sender's message for everyone. Repeating it returns the same tombstone. The document, `_id`, timestamps, reply references, and receipts remain. Text, image URL, and reactions are cleared. Cloudinary assets are not deleted.
- `GET /api/message/media/:otherUserId?limit=24&cursor=...` returns `{ items, nextCursor }`. Limit is 1–50. Items contain `_id`, `image`, `sender`, and `createdAt`. The cursor encodes the last `(createdAt, _id)` pair. Both directional queries are scoped to the authenticated caller and exclude deleted messages.

The new `messageUpdated` socket event sends the complete redacted message with its `revision` to every active tab of both participants after a reaction, edit, or deletion. Existing `messageCreated`, `newMessage`, and `pendingMessages` carry the additive reply metadata. Edits and deletions also trigger the existing `inboxUpdated` event. Clients apply only the newest revision, update loaded reply previews, and refetch history and inbox on reconnect.

Reply previews are assembled from a bounded batch of references, without recursive population. Deleted originals produce `This message was deleted`; missing originals produce `Message unavailable`. The history, inbox, pending socket payloads, and media API redact tombstones. A recipient who previously viewed, saved, or copied content or a Cloudinary URL may still retain it.

The media index is `{ sender: 1, receiver: 1, createdAt: -1, _id: -1 }` with partial filter `{ image: { $gt: "" } }`. Each directional media query has equality on the first two keys, the exact partial-filter predicate, and descending cursor order. It is additive; existing indexes are untouched. No historical-document backfill is needed.
