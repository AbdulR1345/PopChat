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
