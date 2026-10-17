// 消息未读计数的唯一来源。
// 首页铃铛、"我"页消息中心入口、消息中心 Tab 的红点都订阅这里，
// 已读操作在这里立即扣减，避免各页面各自缓存导致红点消不掉或数字对不上。
import {getMessages, getReplyNotifications} from './dataFetcher';
import {AccountCacheContext, getAccountCacheContext, isAccountCacheCurrent, subscribeAccountCacheChange} from './accountCache';
import {Mail} from '../types';

export type UnreadCounts = {mail: number; reply: number};

const REFRESH_INTERVAL = 30 * 1000;
const EMPTY: UnreadCounts = {mail: 0, reply: 0};

let counts: UnreadCounts = EMPTY;
let fetchedAt = 0;
// 本地扣减或账号切换都会递增；请求返回时版本已变，说明结果可能早于这次变更，直接丢弃。
let version = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(next: UnreadCounts) => void>();

const setCounts = (next: UnreadCounts): void => {
  if (next.mail === counts.mail && next.reply === counts.reply) return;
  counts = next;
  listeners.forEach(listener => listener(counts));
};

const sumMailUnread = (mails: Mail[]): number =>
  mails.reduce((sum, mail) => sum + Math.max(0, Number(mail.unread) || 0), 0);

export const getUnreadCounts = (): UnreadCounts => counts;

export const subscribeUnreadCounts = (listener: (next: UnreadCounts) => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const fetchCounts = async (): Promise<void> => {
  const startVersion = version;
  const context = await getAccountCacheContext();
  if (version !== startVersion) return;
  if (!context) {
    setCounts(EMPTY);
    fetchedAt = Date.now();
    return;
  }

  const [mailResult, replyResult] = await Promise.allSettled([
    getMessages(0),
    // 只取未读列表的总数，不受分页大小限制。
    getReplyNotifications(1, 1),
  ]);
  if (version !== startVersion || !isAccountCacheCurrent(context)) return;
  if (mailResult.status === 'rejected' && replyResult.status === 'rejected') {
    console.log('[Unread] 刷新未读计数失败:', mailResult.reason, replyResult.reason);
    return;
  }

  setCounts({
    mail: mailResult.status === 'fulfilled' ? sumMailUnread(mailResult.value) : counts.mail,
    reply: replyResult.status === 'fulfilled' ? Math.max(0, replyResult.value.total) : counts.reply,
  });
  fetchedAt = Date.now();
};

/**
 * 刷新未读计数。默认 30 秒内复用上次结果；force 会在进行中的请求结束后再拉一次，
 * 确保拿到的是本次调用之后的服务端状态。
 */
export const refreshUnreadCounts = (options: {force?: boolean} = {}): Promise<void> => {
  const {force = false} = options;
  if (inFlight) {
    return force ? inFlight.then(() => refreshUnreadCounts({force: true})) : inFlight;
  }
  if (!force && Date.now() - fetchedAt < REFRESH_INTERVAL) return Promise.resolve();

  const request: Promise<void> = fetchCounts()
    .catch(error => console.log('[Unread] 刷新未读计数异常:', error))
    .finally(() => {
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
  return request;
};

const adjust = (context: AccountCacheContext | null, update: (current: UnreadCounts) => UnreadCounts): void => {
  if (!context || !isAccountCacheCurrent(context)) return;
  version += 1;
  setCounts(update(counts));
};

/** 一条回复提醒被标记已读（乐观扣减，失败时调用方应 force 刷新对账）。 */
export const applyReplyNotificationRead = (context: AccountCacheContext | null): void =>
  adjust(context, current => ({...current, reply: Math.max(0, current.reply - 1)}));

/** 一个私信会话被标记已读。 */
export const applyMailConversationRead = (context: AccountCacheContext | null, unread: number): void =>
  adjust(context, current => ({...current, mail: Math.max(0, current.mail - Math.max(0, unread))}));

/** 消息中心拉到的会话列表就是最新数据，直接回写私信未读数。 */
export const syncMailUnreadFromList = (context: AccountCacheContext | null, mails: Mail[]): void =>
  adjust(context, current => ({...current, mail: sumMailUnread(mails)}));

subscribeAccountCacheChange(() => {
  version += 1;
  inFlight = null;
  fetchedAt = 0;
  setCounts(EMPTY);
  void refreshUnreadCounts({force: true});
});
