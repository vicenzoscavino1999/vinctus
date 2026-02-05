/**
 * @deprecated Legacy Firestore API surface.
 *
 * This module is frozen. Do not add new data access code here.
 * New data-access code must live under `src/features/<domain>/api`.
 *
 * Note: we keep re-exports here temporarily while extracting functions out of `firestore.legacy.ts`.
 */
export * from './firestore/reports';
export * from './firestore/blockedUsers';
export * from './firestore/users';
export * from './firestore/userSearch';
export * from './firestore/accountVisibility';
export * from './firestore/followIds';
export * from './firestore/friendIds';
export * from './firestore/publicUsers';
export * from './firestore/follows';
export * from './firestore/friendRequests';
export * from './firestore/collaborations';
export * from './firestore/savedItems';
export * from './firestore/collections';
export * from './firestore/supportTickets';
export * from './firestore/stories';
export * from './firestore.legacy';
