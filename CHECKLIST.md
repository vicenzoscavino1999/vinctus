# Manual regression checklist

Use this for every block/PR. Keep results short and explicit.

## iOS native migration control docs

- `docs/ios-native-migration-plan-operativo.md`
- `docs/ios-contracts-v1.md`
- `docs/ios-parity-matrix.md`
- `docs/ios-risk-register.md`
- `docs/ios-weekly-status.md`
- `docs/ios-rollback-playbook.md`
- `docs/ios-contract-rfc-template.md`
- `docs/ios-contract-test-matrix.md`
- `docs/ios-week2-hardening-checklist.md`
- `docs/ios-payload-versioning-plan.md`
- `docs/ios-app-check-rollout-plan.md`

## Full baseline checklist (Phase 0)

Auth and onboarding

- Login/auth: user can sign in (email/phone/Google if enabled) and session persists after refresh.
- Logout: user returns to login screen without errors.
- Onboarding: complete flow and it does not repeat after refresh (if enabled).

Navigation and core pages

- Main navigation: discover, search, messages, projects, library, profile load.
- Settings pages: /settings, /settings/notifications, /settings/privacy load.
- Help page loads and Support modal opens.

Discover, feed, posts

- Discover: open category and open a group from discover.
- Feed: open feed and scroll one screen without errors.
- Post detail: open a post and view comments/likes.
- Create post: create a post (with media if enabled) and see it appear.
- Comment/like: add a comment and toggle like (if enabled).

Groups

- Group detail: open group and view members panel.
- Join/leave group (if enabled).
- Group edit: open edit page and save (if enabled).

Messages

- Messages list: open /messages without errors.
- Conversation detail: open a conversation and send a message.
- Group conversation details page loads.

Search and profiles

- User search: search and open a user profile.
- Follow/unfollow or friend request (if enabled).
- Profile: edit profile (bio/photo) and see it persist after refresh.

Projects, collaborations, events

- Projects page loads.
- Collaboration: create/edit, open detail, send request (if enabled).
- Events: create/edit, open detail, join/leave (if enabled).

Library and collections

- Library page loads.
- Create a collection and open its detail modal (if enabled).
- Add/remove item in a collection (if enabled).

Stories, contributions, support

- Stories: open viewer and create a story (if enabled).
- Contributions section loads (if enabled).
- Support: open support modal and submit (if enabled).

AI assistant

- Open AI assistant modal from header, send a message, close (if enabled).

Uploads

- Upload and view/download a file (if enabled).

## Per-PR short checklist

Pick 2-3 items from the list above plus 1 critical flow touched by the PR.

## Record

- Date:
- Build/commit:
- Notes:
