import AsyncStorage from '@react-native-async-storage/async-storage';
import {clearCache, flushPersistedSnapshotWrites, readPersistedSnapshot, writePersistedSnapshot} from './cacheManager';

const PRIVATE_MEMORY_CATEGORIES = [
  'userInfo', 'favoriteBoards', 'myArticles', 'myReplies', 'myLikes',
  'mailConversations', 'replyNotificationsFirstPage', 'blackList',
] as const;
const STORAGE_PREFIX = '@account_cache_v2:';
const LEGACY_BACKUP_PREFIX = '@account_cache_legacy_backup_v1:';
// NUL 不可能出现在站点用户名中，避免游客空间与真实账号同名。
const GUEST_USERNAME = '\u0000guest';
let activeAccount: string | null = null;
let generation = 0;
let initialized = false;
const listeners = new Set<() => void>();
const migratedKeys = new Set<string>();
const pendingMigrations = new Map<string, Promise<void>>();

export type AccountCacheContext = {username: string; generation: number};

const normalizeUsername = (username: string | null | undefined): string | null =>
  username?.trim() || null;

const accountIdentity = (username: string | null | undefined): string | null =>
  normalizeUsername(username)?.toLowerCase() || null;

/** 在账号边界立即失效当前内存快照及未完成请求的写入资格。 */
export const activateAccountCache = (username: string | null | undefined): void => {
  initialized = true;
  const nextAccount = normalizeUsername(username);
  if (accountIdentity(activeAccount) === accountIdentity(nextAccount)) return;
  activeAccount = nextAccount;
  generation += 1;
  PRIVATE_MEMORY_CATEGORIES.forEach(category => clearCache(category));
  listeners.forEach(listener => listener());
};

export const subscribeAccountCacheChange = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getAccountCacheContext = async (): Promise<AccountCacheContext | null> => {
  if (initialized) {
    return activeAccount ? {username: activeAccount, generation} : null;
  }
  const startedAt = generation;
  const entries = await AsyncStorage.multiGet(['username', 'isLoggedIn', 'cookies']);
  const username = entries[1][1] === 'true' && !!entries[2][1] ? normalizeUsername(entries[0][1]) : null;
  // 切换账号期间发起的旧读取不能把当前身份倒回去。
  if (generation !== startedAt && accountIdentity(username) !== accountIdentity(activeAccount)) {
    return activeAccount ? {username: activeAccount, generation} : null;
  }
  activateAccountCache(username);
  return username ? {username, generation} : null;
};

/** 本地记录在游客模式下仍可读写，且与任何登录账号分开。 */
export const getLocalCacheContext = async (): Promise<AccountCacheContext> => {
  const account = await getAccountCacheContext();
  return account || {username: GUEST_USERNAME, generation};
};

export const isAccountCacheCurrent = (context: AccountCacheContext | null): boolean =>
  !!context && context.generation === generation && (
    context.username === GUEST_USERNAME
      ? activeAccount === null
      : accountIdentity(context.username) === accountIdentity(activeAccount)
  );

export const accountSnapshotKey = (baseKey: string, username: string): string =>
  `${STORAGE_PREFIX}${encodeURIComponent(accountIdentity(username) || '')}:${baseKey}`;

const isLocalItem = (baseKey: string): boolean =>
  baseKey === 'read_posts_ids' || baseKey === 'read_posts_details'
  || baseKey === 'search_history' || baseKey === 'topic_reading_progress_v1'
  || baseKey.startsWith('draft_');

const mergeLocalValues = (baseKey: string, current: string, legacy: string): string | null => {
  try {
    const newer = JSON.parse(current);
    const older = JSON.parse(legacy);
    if (baseKey === 'read_posts_ids' || baseKey === 'search_history') {
      if (!Array.isArray(newer) || !Array.isArray(older)) return null;
      return JSON.stringify([...new Set([...newer, ...older])]);
    }
    if (baseKey === 'read_posts_details') {
      if (!Array.isArray(newer) || !Array.isArray(older)) return null;
      const byId = new Map<string, any>();
      for (const item of [...older, ...newer]) {
        if (!item?.postId) continue;
        const previous = byId.get(String(item.postId));
        if (!previous || Number(item.timestamp || 0) >= Number(previous.timestamp || 0)) {
          byId.set(String(item.postId), item);
        }
      }
      return JSON.stringify([...byId.values()].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)));
    }
    if (baseKey === 'topic_reading_progress_v1') {
      if (!newer || !older || typeof newer !== 'object' || typeof older !== 'object'
        || Array.isArray(newer) || Array.isArray(older)) return null;
      const merged: Record<string, any> = {...older};
      for (const [topicId, progress] of Object.entries(newer)) {
        if (!merged[topicId] || Number((progress as any)?.updatedAt || 0) >= Number(merged[topicId]?.updatedAt || 0)) {
          merged[topicId] = progress;
        }
      }
      return JSON.stringify(merged);
    }
  } catch {
    return null;
  }
  return null;
};

/** 先复制再删除旧值；目标已有数据时保留旧值，避免覆盖或丢失。 */
const migrateStorageKey = async (baseKey: string, context: AccountCacheContext, includeUnscoped: boolean): Promise<void> => {
  const target = accountSnapshotKey(baseKey, context.username);
  if (migratedKeys.has(target)) return;
  const pending = pendingMigrations.get(target);
  if (pending) return pending;

  const migration = (async () => {
    const keys = await AsyncStorage.getAllKeys();
    const variants = keys.filter(key => {
      if (!key.startsWith(STORAGE_PREFIX) || !key.endsWith(`:${baseKey}`) || key === target) return false;
      const encodedName = key.slice(STORAGE_PREFIX.length, key.length - baseKey.length - 1);
      try {
        return accountIdentity(decodeURIComponent(encodedName)) === accountIdentity(context.username);
      } catch {
        return false;
      }
    });
    const sources = includeUnscoped && keys.includes(baseKey) ? [...variants, baseKey] : variants;
    for (const source of sources) {
      const value = await AsyncStorage.getItem(source);
      if (value === null) continue;
      const existing = await AsyncStorage.getItem(target);
      if (!isAccountCacheCurrent(context)) return;
      if (existing === null) {
        await AsyncStorage.setItem(target, value);
      } else if (includeUnscoped && isLocalItem(baseKey)) {
        const merged = mergeLocalValues(baseKey, existing, value);
        if (merged !== null) {
          await AsyncStorage.setItem(target, merged);
        } else {
          // 两份草稿或损坏的数据都保留；避免旧共享 key 被其他账号接管。
          await AsyncStorage.setItem(
            `${LEGACY_BACKUP_PREFIX}${encodeURIComponent(accountIdentity(context.username) || '')}:${encodeURIComponent(source)}`,
            value,
          );
        }
      }
      await AsyncStorage.removeItem(source);
    }
    migratedKeys.add(target);
  })().finally(() => pendingMigrations.delete(target));
  pendingMigrations.set(target, migration);
  await migration;
};

/** 本地私有数据使用与快照相同的账号命名空间，旧共享值无法确认归属。 */
export const readAccountItem = async (baseKey: string, accountContext?: AccountCacheContext | null): Promise<string | null> => {
  const context = accountContext === undefined ? await getLocalCacheContext() : accountContext;
  if (!context) return null;
  await migrateStorageKey(baseKey, context, context.username !== GUEST_USERNAME && isLocalItem(baseKey));
  const value = await AsyncStorage.getItem(accountSnapshotKey(baseKey, context.username));
  return isAccountCacheCurrent(context) ? value : null;
};

export const writeAccountItem = async (baseKey: string, value: string, accountContext?: AccountCacheContext | null): Promise<void> => {
  const context = accountContext === undefined ? await getLocalCacheContext() : accountContext;
  if (!context || !isAccountCacheCurrent(context)) return;
  await migrateStorageKey(baseKey, context, context.username !== GUEST_USERNAME && isLocalItem(baseKey));
  if (isAccountCacheCurrent(context)) {
    await AsyncStorage.setItem(accountSnapshotKey(baseKey, context.username), value);
  }
};

export const removeAccountItem = async (baseKey: string, accountContext?: AccountCacheContext | null): Promise<void> => {
  const context = accountContext === undefined ? await getLocalCacheContext() : accountContext;
  if (!context || !isAccountCacheCurrent(context)) return;
  await migrateStorageKey(baseKey, context, context.username !== GUEST_USERNAME && isLocalItem(baseKey));
  await AsyncStorage.removeItem(accountSnapshotKey(baseKey, context.username));
};

export const readAccountSnapshot = async <T>(
  baseKey: string,
  context: AccountCacheContext,
  maxAge: number,
  cacheStillValid: () => boolean = () => true,
) => {
  await migrateStorageKey(baseKey, context, false);
  const snapshot = await readPersistedSnapshot<T>(accountSnapshotKey(baseKey, context.username), maxAge);
  return isAccountCacheCurrent(context) && cacheStillValid() ? snapshot : null;
};

export const writeAccountSnapshot = async <T>(
  baseKey: string,
  context: AccountCacheContext,
  data: T,
  cacheStillValid: () => boolean = () => true,
): Promise<void> => {
  if (isAccountCacheCurrent(context) && cacheStillValid()) {
    await migrateStorageKey(baseKey, context, false);
    if (isAccountCacheCurrent(context) && cacheStillValid()) {
      await writePersistedSnapshot(accountSnapshotKey(baseKey, context.username), data);
    }
  }
};

/** 清理指定私有分类的所有账号快照，以及旧版未分账号的快照。 */
export const removeAccountSnapshots = async (baseKeys: string[]): Promise<void> => {
  await flushPersistedSnapshotWrites();
  const keys = await AsyncStorage.getAllKeys();
  const scoped = keys.filter(key =>
    key.startsWith(STORAGE_PREFIX) && baseKeys.some(base => key.endsWith(`:${base}`)),
  );
  await AsyncStorage.multiRemove([...baseKeys, ...scoped]);
};

export const removeAccountSnapshotsForUser = async (username: string, baseKeys: string[]): Promise<void> => {
  await flushPersistedSnapshotWrites();
  const keys = await AsyncStorage.getAllKeys();
  const scoped = keys.filter(key => {
    if (!key.startsWith(STORAGE_PREFIX)) return false;
    const baseKey = baseKeys.find(base => key.endsWith(`:${base}`));
    if (!baseKey) return false;
    const encodedName = key.slice(STORAGE_PREFIX.length, key.length - baseKey.length - 1);
    try {
      return accountIdentity(decodeURIComponent(encodedName)) === accountIdentity(username);
    } catch {
      return false;
    }
  });
  await AsyncStorage.multiRemove([...new Set([...baseKeys.map(base => accountSnapshotKey(base, username)), ...scoped])]);
};

/** 从多账号列表移除账号时，清除该账号的所有本地命名空间。 */
export const removeAllAccountData = async (username: string): Promise<void> => {
  await flushPersistedSnapshotWrites();
  const keys = await AsyncStorage.getAllKeys();
  const identity = accountIdentity(username);
  const scoped = keys.filter(key => {
    const prefix = key.startsWith(STORAGE_PREFIX) ? STORAGE_PREFIX
      : key.startsWith(LEGACY_BACKUP_PREFIX) ? LEGACY_BACKUP_PREFIX : null;
    if (!prefix) return false;
    const separator = key.indexOf(':', prefix.length);
    if (separator < 0) return false;
    try {
      return accountIdentity(decodeURIComponent(key.slice(prefix.length, separator))) === identity;
    } catch {
      return false;
    }
  });
  if (scoped.length > 0) await AsyncStorage.multiRemove(scoped);
  for (const key of migratedKeys) {
    if (scoped.includes(key)) migratedKeys.delete(key);
  }
};
