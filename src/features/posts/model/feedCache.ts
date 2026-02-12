export const FEED_CACHE_INVALIDATED_EVENT = 'vinctus:feed-cache-invalidated';

export const notifyFeedCacheInvalidated = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(FEED_CACHE_INVALIDATED_EVENT));
};
