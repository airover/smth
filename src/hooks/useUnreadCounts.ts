import {useEffect, useState} from 'react';
import {getUnreadCounts, subscribeUnreadCounts, UnreadCounts} from '../services/unreadCounts';

/** 订阅全局未读计数；刷新由调用方在合适时机触发 refreshUnreadCounts。 */
export const useUnreadCounts = (): UnreadCounts => {
  const [counts, setCounts] = useState<UnreadCounts>(getUnreadCounts);
  useEffect(() => {
    setCounts(getUnreadCounts());
    return subscribeUnreadCounts(setCounts);
  }, []);
  return counts;
};
