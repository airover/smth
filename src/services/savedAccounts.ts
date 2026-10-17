// 多账号列表的持久化读写。
// 所有写入都经过同一队列串行执行，避免登录页与切换页并发读改写互相覆盖。
import AsyncStorage from '@react-native-async-storage/async-storage';
import {fetchAuthenticatedUsername} from './auth';

export const SAVED_ACCOUNTS_KEY = 'savedAccounts';

export interface SavedAccount {
  username: string;
  nickname?: string;
  avatar?: string;
  cookies: string;
  isCurrent: boolean;
}

const accountIdentity = (value: string | null | undefined): string =>
  (value || '').trim().toLowerCase();

export const sameAccount = (
  left: string | null | undefined,
  right: string | null | undefined,
): boolean => !!left && !!right && accountIdentity(left) === accountIdentity(right);

const parseAccounts = (raw: string | null): SavedAccount[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedAccount =>
        !!item && typeof item.username === 'string' && item.username.trim().length > 0,
    );
  } catch (error) {
    console.error('Parse saved accounts error:', error);
    return [];
  }
};

let writeQueue: Promise<unknown> = Promise.resolve();

/** 串行执行一次“读取整表 → 修改 → 写回”，返回修改后的列表。 */
const updateAccounts = (
  mutator: (accounts: SavedAccount[]) => SavedAccount[],
): Promise<SavedAccount[]> => {
  const task = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const current = parseAccounts(await AsyncStorage.getItem(SAVED_ACCOUNTS_KEY));
      const next = mutator(current);
      await AsyncStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(next));
      return next;
    });
  writeQueue = task.catch(() => undefined);
  return task;
};

/** 按用户名忽略大小写去重，后出现的字段覆盖先出现的字段。 */
const dedupeAccounts = (accounts: SavedAccount[]): SavedAccount[] => {
  const merged: SavedAccount[] = [];
  for (const account of accounts) {
    const identity = accountIdentity(account.username);
    if (!identity) continue;
    const index = merged.findIndex(item => accountIdentity(item.username) === identity);
    if (index >= 0) {
      merged[index] = {...merged[index], ...account, username: merged[index].username};
    } else {
      merged.push({...account, username: account.username.trim()});
    }
  }
  return merged;
};

/** 头像可能是相对路径或 http 地址，统一成可直接加载的 https 地址。 */
export const resolveAccountAvatar = (avatar: string | null | undefined): string | undefined => {
  const value = avatar?.trim();
  if (!value) return undefined;
  const absolute = value.startsWith('http') ? value : `https://file.mysmth.net/${value.replace(/^\/+/, '')}`;
  return absolute.replace(/^http:/, 'https:');
};

/** 从服务端 account 对象提取列表展示用的昵称和头像（字段优先级与资料页一致）。 */
export const profileFromServerAccount = (account: any): {nickname?: string; avatar?: string} => ({
  nickname: account?.nick || account?.nickname || undefined,
  avatar: resolveAccountAvatar(account?.k3sUrl || account?.ks3Url || account?.avatarUrl || account?.avatar),
});


export const normalizeAccounts = (
  accounts: SavedAccount[],
  currentUsername: string | null,
): SavedAccount[] =>
  dedupeAccounts(accounts).map(account => ({
    ...account,
    avatar: resolveAccountAvatar(account.avatar),
    isCurrent: sameAccount(account.username, currentUsername),
  }));

export const loadSavedAccounts = async (): Promise<SavedAccount[]> =>
  parseAccounts(await AsyncStorage.getItem(SAVED_ACCOUNTS_KEY));

/**
 * 保存或更新一个账号，默认把它标记为当前账号（其余账号取消标记）。
 * 未传入 cookies 时保留原有凭证，避免仅资料更新时把登录态清空。
 */
export const saveAccount = async (
  account: Omit<SavedAccount, 'isCurrent'> & {isCurrent?: boolean},
  options: {markCurrent?: boolean} = {},
): Promise<SavedAccount[]> => {
  const {markCurrent = true} = options;
  const username = (account.username || '').trim();
  if (!username) return loadSavedAccounts();

  return updateAccounts(accounts => {
    const identity = accountIdentity(username);
    const index = accounts.findIndex(item => accountIdentity(item.username) === identity);
    const previous = index >= 0 ? accounts[index] : undefined;
    // 未提供的资料字段（undefined/空串）不能覆盖已有的昵称和头像。
    const provided = Object.fromEntries(
      Object.entries(account).filter(([, value]) => value !== undefined && value !== ''),
    );
    const merged: SavedAccount = {
      ...previous,
      ...provided,
      username,
      cookies: account.cookies || previous?.cookies || '',
      isCurrent: markCurrent ? true : previous?.isCurrent ?? false,
    };

    const next = [...accounts];
    if (index >= 0) {
      next[index] = merged;
    } else {
      next.push(merged);
    }

    const deduped = dedupeAccounts(next);
    return markCurrent
      ? deduped.map(item => ({...item, isCurrent: sameAccount(item.username, username)}))
      : deduped;
  });
};

/** 账号仅在尚未保存时初始化；已有凭证由已确认的登录或切换路径更新。 */
export const saveAccountIfMissing = async (
  account: Omit<SavedAccount, 'isCurrent'> & {isCurrent?: boolean},
  options: {markCurrent?: boolean} = {},
): Promise<SavedAccount[]> => {
  const {markCurrent = false} = options;
  const username = (account.username || '').trim();
  if (!username) return loadSavedAccounts();

  return updateAccounts(accounts => {
    const next = dedupeAccounts(accounts);
    const exists = next.some(item => accountIdentity(item.username) === accountIdentity(username));
    if (!exists) {
      next.push({
        ...account,
        username,
        cookies: account.cookies || '',
        isCurrent: account.isCurrent ?? markCurrent,
      });
    }

    return markCurrent
      ? next.map(item => ({...item, isCurrent: sameAccount(item.username, username)}))
      : next;
  });
};

/** 只更新已在列表中的账号资料，不会凭空新增账号，也不触碰凭证。 */
export const updateSavedAccountProfile = async (
  username: string,
  profile: {nickname?: string; avatar?: string},
): Promise<void> => {
  const nickname = profile.nickname?.trim();
  const avatar = resolveAccountAvatar(profile.avatar);
  if (!username.trim() || (!nickname && !avatar)) return;
  const current = (await loadSavedAccounts()).find(account => sameAccount(account.username, username));
  if (!current || ((!nickname || current.nickname === nickname) && (!avatar || current.avatar === avatar))) return;
  await updateAccounts(accounts => accounts.map(account => (
    sameAccount(account.username, username)
      ? {...account, ...(nickname ? {nickname} : {}), ...(avatar ? {avatar} : {})}
      : account
  )));
};

export const removeSavedAccount = async (username: string): Promise<SavedAccount[]> =>
  updateAccounts(accounts =>
    dedupeAccounts(accounts).filter(account => !sameAccount(account.username, username)),
  );

export const findSavedAccount = async (username: string): Promise<SavedAccount | undefined> => {
  const accounts = await loadSavedAccounts();
  return accounts.find(account => sameAccount(account.username, username));
};

/**
 * 登录/切换前先备份当前会话。
 * 旧版本用户可能只在全局 username/cookies 里有账号，备份后才能继续保留。
 */
export const preserveCurrentSession = async (): Promise<void> => {
  try {
    const entries = await AsyncStorage.multiGet(['username', 'cookies']);
    const username = entries[0][1];
    const cookies = entries[1][1];
    if (!username?.trim() || !cookies) return;

    // 已保存的条目不需要从全局状态覆盖；缺少条目时，先确认 Cookie 的真实归属。
    if (await findSavedAccount(username)) return;
    const authenticatedUsername = await fetchAuthenticatedUsername(cookies);
    if (!sameAccount(authenticatedUsername, username)) {
      console.warn('Skip preserving current session because its Cookie owner does not match the username');
      return;
    }

    // 验证期间如果全局会话已改变，不要再把刚才读取的凭证加入列表。
    const current = await AsyncStorage.multiGet(['username', 'cookies']);
    if (current[0][1] !== username || current[1][1] !== cookies) return;
    await saveAccountIfMissing({username, cookies}, {markCurrent: false});
  } catch (error) {
    console.error('Preserve current session error:', error);
  }
};
