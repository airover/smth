// 主站登录会话的一致性维护与过期判定。
// 系统 jar 是请求实际使用的凭证（服务端续期也写在这里），AsyncStorage 只是副本；
// 两者不一致时先向服务端确认归属，再决定以哪份为准，确保永远不会把别的账号的 Cookie 记到当前账号名下。
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  extractWapAuthCookies,
  invalidateMSiteLogin,
  isWapLoginHeld,
  probeAuthenticatedUsername,
  readWapAuthCookieJar,
  storeCookies,
  syncWapAuthCookieJar,
  withWapSessionLock,
} from './auth';
import {AccountCacheContext, activateAccountCache, getAccountCacheContext, isAccountCacheCurrent} from './accountCache';
import {sameAccount, saveAccount} from './savedAccounts';

export type WapSessionStatus = 'ok' | 'expired' | 'mismatch' | 'unknown';

const readStoredAuthCookies = async (): Promise<string | null> => {
  const [loginStatus, cookies] = await AsyncStorage.multiGet(['isLoggedIn', 'cookies'])
    .then(entries => entries.map(([, value]) => value));
  return loginStatus === 'true' ? extractWapAuthCookies(cookies) : null;
};

/**
 * 让 jar 与本地副本重新指向当前账号：
 * - jar 为空（进程回收、旧版本会话 Cookie）→ 用本地副本补回 jar
 * - jar 是当前账号的新凭证（服务端续期）→ 采用 jar，更新本地副本和多账号列表
 * - jar 属于别人或已失效 → 用本地副本覆盖 jar
 */
export const reconcileWapAuthCookies = async (): Promise<void> => {
  if (isWapLoginHeld()) return;
  const context = await getAccountCacheContext();
  if (!context) return;
  const stored = await readStoredAuthCookies();
  if (!stored) return;
  const jar = (await readWapAuthCookieJar()).cookies;
  if (jar === stored) return;

  // 网络确认放在锁外，避免阻塞登录/切换；写入前在锁内重新核对快照。
  const jarOwner = jar ? await probeAuthenticatedUsername(jar) : null;
  if (jarOwner?.status === 'error') return;
  const adoptJar = jarOwner?.status === 'ok' && sameAccount(jarOwner.name, context.username);

  let adopted: string | null = null;
  await withWapSessionLock(async () => {
    if (isWapLoginHeld() || !isAccountCacheCurrent(context)) return;
    if (await readStoredAuthCookies() !== stored) return;
    if ((await readWapAuthCookieJar()).cookies !== jar) return;
    if (adoptJar && jar) {
      // storeCookies 会保留本地的 set_identity。
      await storeCookies(jar);
      adopted = jar;
    } else {
      await syncWapAuthCookieJar(stored);
    }
  });
  if (adopted && isAccountCacheCurrent(context)) {
    await saveAccount({username: context.username, cookies: adopted}, {markCurrent: false})
      .catch(error => console.error('[WapSession] 更新多账号凭证失败:', error));
  }
};

/** 校正 jar 后，用与普通请求相同的凭证向服务端确认当前账号的会话状态。 */
const verifyWapSession = async (context: AccountCacheContext): Promise<WapSessionStatus> => {
  await reconcileWapAuthCookies();
  if (isWapLoginHeld() || !isAccountCacheCurrent(context)) return 'unknown';
  const stored = await readStoredAuthCookies();
  if (!stored) return 'unknown';
  const result = await probeAuthenticatedUsername(stored);
  if (!isAccountCacheCurrent(context)) return 'unknown';
  if (result.status === 'ok') return sameAccount(result.name, context.username) ? 'ok' : 'mismatch';
  return result.status === 'anonymous' ? 'expired' : 'unknown';
};

type ExpiredListener = (info: {username: string; reason: 'expired' | 'mismatch'}) => void;
const expiredListeners = new Set<ExpiredListener>();

export const subscribeLoginExpired = (listener: ExpiredListener): (() => void) => {
  expiredListeners.add(listener);
  return () => { expiredListeners.delete(listener); };
};

/**
 * 退出已失效的会话，但保留该账号的缓存分区、多账号条目和保存的密码，
 * 重新登录同一账号时可直接复用。
 */
const expireWapSession = (context: AccountCacheContext): Promise<boolean> => withWapSessionLock(async () => {
  if (!isAccountCacheCurrent(context)) return false;
  invalidateMSiteLogin();
  activateAccountCache(null);
  await AsyncStorage.multiRemove(['isLoggedIn', 'username', 'cookies']);
  await syncWapAuthCookieJar(null);
  return true;
});

const REQUEST_RECHECK_INTERVAL = 15 * 1000;
const RESUME_RECHECK_INTERVAL = 5 * 60 * 1000;
let lastHealthyAt = 0;
let pendingCheck: Promise<WapSessionStatus> | null = null;

/**
 * 检查会话，确认失效时退出并通知订阅方提示用户。
 * 接口返回"未登录"也可能只是无权限，因此必须经服务端确认后才判定过期。
 */
export const checkWapSession = (trigger: 'startup' | 'resume' | 'request'): Promise<WapSessionStatus> => {
  if (pendingCheck) return pendingCheck;
  const minInterval = trigger === 'resume' ? RESUME_RECHECK_INTERVAL
    : trigger === 'request' ? REQUEST_RECHECK_INTERVAL : 0;
  if (Date.now() - lastHealthyAt < minInterval) return Promise.resolve('ok');

  const pending = (async (): Promise<WapSessionStatus> => {
    const context = await getAccountCacheContext();
    if (!context) return 'unknown';
    const status = await verifyWapSession(context);
    if (status === 'ok') {
      lastHealthyAt = Date.now();
    } else if (status === 'expired' || status === 'mismatch') {
      lastHealthyAt = 0;
      if (await expireWapSession(context)) {
        expiredListeners.forEach(listener => listener({username: context.username, reason: status}));
      }
    }
    return status;
  })().catch(error => {
    console.error('[WapSession] 会话检查失败:', error);
    return 'unknown' as const;
  }).finally(() => {
    if (pendingCheck === pending) pendingCheck = null;
  });
  pendingCheck = pending;
  return pending;
};

/** 接口报告登录失效时调用；只触发后台确认，不阻塞调用方。 */
export const reportLoginExpired = (): void => {
  void checkWapSession('request');
};
