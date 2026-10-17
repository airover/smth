import {AccountCacheContext, accountSnapshotKey, isAccountCacheCurrent} from './accountCache';
import {cacheManager, makePersistedSnapshotStale, markCacheStale, PUBLIC_CONTENT_FRESH_AGES, PUBLIC_CONTENT_SNAPSHOT_KEYS} from './cacheManager';

type PrivateList = 'myArticles' | 'myReplies' | 'myLikes';
type ContentTarget = {boardId?: string; topicId?: string};

const storageKeys: Record<PrivateList, string> = {
  myArticles: 'my_articles_cache',
  myReplies: 'my_replies_cache',
  myLikes: 'my_likes_cache',
};

const PRIVATE_LIST_FRESH_AGE = 2 * 60 * 1000;

/** 内容操作成功后立即让相关内容过期，保留快照供弱网兜底；持久层在后台处理。 */
export const invalidateContentCache = async (
  accountContext: AccountCacheContext | null,
  kind: 'article' | 'reply' | 'like',
  target: ContentTarget = {},
): Promise<void> => {
  const {boardId, topicId} = target;
  if (kind !== 'like') {
    markCacheStale('boardPosts', 60 * 1000, boardId ? key => key.startsWith(`${boardId}_`) : undefined);
    if (topicId) {
      markCacheStale('postDetail', 5 * 60 * 1000, key => key.endsWith(`-${topicId}`));
      markCacheStale('topicReplies', 60 * 1000, key => key.includes(`:${topicId}-`));
    } else if (kind === 'reply') {
      // 旧入口可能只有回复 articleId，无法推断主题；保留旧内容并使详情过期。
      markCacheStale('postDetail', 5 * 60 * 1000);
      markCacheStale('topicReplies', 60 * 1000);
    } else {
      cacheManager.invalidateWrites('postDetail');
      cacheManager.invalidateWrites('topicReplies');
    }

    // 频道和图览无法由版面 ID 反查归属，沿用短 TTL，阻止操作前的请求回填。
    cacheManager.invalidateWrites('channelPosts');
    cacheManager.invalidateWrites('albumPosts');
    markCacheStale('hotPosts', 2 * 60 * 1000);
    markCacheStale('topTen', PUBLIC_CONTENT_FRESH_AGES.topTen);
    markCacheStale('hotPostsFirstPage', PUBLIC_CONTENT_FRESH_AGES.hotPostsFirstPage);
    void Promise.all([
        makePersistedSnapshotStale(PUBLIC_CONTENT_SNAPSHOT_KEYS.topTen, PUBLIC_CONTENT_FRESH_AGES.topTen),
        makePersistedSnapshotStale(PUBLIC_CONTENT_SNAPSHOT_KEYS.hotPostsFirstPage, PUBLIC_CONTENT_FRESH_AGES.hotPostsFirstPage),
    ]).catch(error => console.error('[Cache] Failed to stale public content snapshots:', error));
  } else if (topicId) {
    markCacheStale('postDetail', 5 * 60 * 1000, key => key.endsWith(`-${topicId}`));
  } else {
    cacheManager.invalidateWrites('postDetail');
  }

  const privateLists: PrivateList[] = kind === 'like'
    ? ['myLikes']
    : ['myArticles', 'myReplies'];
  if (!accountContext) return;
  if (isAccountCacheCurrent(accountContext)) {
    privateLists.forEach(category => markCacheStale(category, PRIVATE_LIST_FRESH_AGE));
  }
  void Promise.all(privateLists.map(category =>
    makePersistedSnapshotStale(accountSnapshotKey(storageKeys[category], accountContext.username), PRIVATE_LIST_FRESH_AGE),
  )).catch(error => console.error('[Cache] Failed to stale private content snapshots:', error));
};
