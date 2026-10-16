# Phase 10C manual browser verification

## Final browser verification

User-verified final browser run on 2026-10-16: **19/19 checks passed**. The backend logged `db connected` and `server started`, the port 8000 conflict was resolved, and no browser console errors remained. The approved MongoDB preference index was confirmed present during the pre-commit investigation. The detailed prompts below remain as a reference; the reported 19 checks were not mapped to these individual prompts.

Use Account A in a normal Chrome window, Account B in Incognito, and a second normal tab signed in as A. Start the backend and frontend with a database where the approved `conversationpreferences` unique index has built successfully. Do not mark a check complete until you observe it.

## Preferences and two-account behavior

- [ ] Log in as A and B; refresh both pages and confirm sessions persist.
- [ ] Pin an existing conversation as A; confirm it appears before unpinned rows.
- [ ] Send a newer message in an unpinned conversation; confirm pinned rows still stay first and activity order updates within each group.
- [ ] Unpin and confirm activity order returns, with stable ordering for ties.
- [ ] Archive an existing conversation as A; confirm it disappears from All and appears in Archived with its preview and unread badge.
- [ ] While A has it archived, send a new message from B. Confirm A's Archived row gets the new preview and unread count and stays in Archived, including after a refresh or socket reconnect.
- [ ] Open that archived conversation as A; confirm full history is present. Send a reply as A and confirm it stays Archived.
- [ ] Archive the currently selected conversation; confirm the chat stays open, shows Archived, and offers Unarchive without changing the loaded messages.
- [ ] Manually Unarchive as A; confirm the conversation returns to All.
- [ ] Mute and Unmute as A; confirm the icon changes while messages, typing, unread counts, presence, and receipts remain visible.
- [ ] Confirm A's pin, archive, and mute choices do not change B's sidebar or preferences.
- [ ] Confirm A's second tab reflects each change; refresh that tab and confirm persistence.
- [ ] Log A out and back in; confirm preference persistence and no preference leakage while logged out.
- [ ] Search for an existing conversation in All and Archived; confirm archive filtering follows the selected tab.
- [ ] Search for a person with no message history in All and confirm a new chat can still be started.

## Existing messaging and profile behavior

- [ ] Send and receive text and image messages in both directions.
- [ ] Verify reactions, replies, message editing, and delete for everyone.
- [ ] Verify typing, online/offline presence, delivery receipts, and read receipts.
- [ ] Verify unread counts while a conversation is archived and after manually unarchiving it.
- [ ] Open the shared image gallery and verify current images appear.
- [ ] Verify bio and availability display correctly and the other user cannot see private email.

## Interface and diagnostics

- [ ] Use Tab, Enter/Space, arrow keys on All/Archived tabs, and Escape on the conversation action menu. Confirm menu activation does not select the chat and focus returns to its trigger.
- [ ] Verify action feedback on a failed preference request and use Retry after a failed initial preference load.
- [ ] Check desktop, tablet, and mobile widths, including narrow phones. Confirm the menu is usable and there is no horizontal overflow.
- [ ] On mobile, archive the open chat, use Back, and confirm its row is absent from All but present in Archived.
- [ ] Check Chrome DevTools Console and Network for unexpected errors.

## Verify API responses in Chrome DevTools

1. Open **DevTools → Network**, enable **Preserve log**, and filter for `conversation/preferences`.
2. Refresh A's page. Inspect `GET /api/conversation/preferences`: it should return only A's stored rows and the safe fields `otherUserId`, `pinnedAt`, `archived`, `archivedAt`, `muted`, and `revision`.
3. Pin, archive, and mute one conversation separately. Inspect each `PUT /api/conversation/preferences/:otherUserId` request body: it should contain only the chosen boolean field. Confirm each response reflects the saved state and that `revision` rises on changes but stays the same for a repeated setting.
4. Repeat the GET in B's Incognito window. Confirm B does not receive A's preference row. Keep A's second tab open to check owner-only synchronization.
5. After B sends a message to an A-archived conversation, inspect A's next GET and the inbox response: `archived` must remain `true`, while preview and unread data can update.
