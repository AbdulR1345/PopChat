# Phase 10A manual browser verification

The user reports that Phase 10A browser verification passed (15/15 checks), including existing messaging and real-time features. The expanded checklist below remains available for repeat verification; its individual boxes were not recorded during that run.

Use two real accounts: A in normal Chrome and B in an Incognito window. Keep DevTools open in both windows, with **Network** recording and **Preserve log** enabled.

- [ ] 1. Log in to both accounts and confirm existing sessions restore after reload.
- [ ] 2. Open each profile editor; confirm name, username, own email, bio, avatar, and availability initialize correctly.
- [ ] 3. Change A's display name, save, and confirm the sidebar and B's contact list/header show it after B's window regains focus.
- [ ] 4. Enter exactly 160 bio characters, save, and confirm B sees the bio in contact details.
- [ ] 5. Try a 161st bio character: the editor must stop at 160. In DevTools, send a 161-character `bio` to `PUT /api/user/profile` using A's session and confirm HTTP 400 with no saved change.
- [ ] 6. Clear A's bio, save, and confirm B sees the empty state.
- [ ] 7. Set A to Busy and confirm B sees Busy in contact details and the conversation header.
- [ ] 8. While A is connected, confirm the green online indicator stays on for Busy; disconnect A and confirm the indicator turns off while Busy remains saved.
- [ ] 9. Set A to Away, then Available, and confirm each value persists across refresh.
- [ ] 10. Upload a valid profile image and confirm it appears for A and B; try an invalid format or image over 5 MB and confirm a useful error.
- [ ] 11. Confirm B's contact panel shows A's avatar, display name, username, bio, availability, and independent online/offline status; shared image gallery, viewer, and pagination still work.
- [ ] 12. In B's Network response bodies, inspect `GET /api/user/others` and `GET /api/user/search?query=...`; A's entries must have no `email`, `password`, `token`, or internal security fields. Confirm B's contact UI has no email.
- [ ] 13. In A's Network response bodies, inspect signup/login if applicable, `GET /api/user/current`, and `PUT /api/user/profile`; A's own email must be present, and password/token fields absent. Email and username inputs must be read-only.
- [ ] 14. Send and receive text and image messages in both directions.
- [ ] 15. Test reactions, replies, editing, and delete for everyone in both windows.
- [ ] 16. Confirm typing, unread badges, delivery receipts, and read receipts still work.
- [ ] 17. Refresh both sessions; confirm saved profile data, selected conversation behavior, and message history.
- [ ] 18. Log out and back in; confirm session and Socket.IO reconnect behavior.
- [ ] 19. Check layouts at 1440, 1200, 768, and 390 px: no horizontal overflow, hidden controls, or inaccessible profile fields.
- [ ] 20. Review Console and Network for unexpected errors or private fields in any public user response.

To verify privacy, select each request in **DevTools → Network → Response** and inspect the JSON itself. A hidden email label in the UI does not establish API privacy. Repeat user search with each account's username, including a search that returns the signed-in account, to confirm search always uses the public response shape.
