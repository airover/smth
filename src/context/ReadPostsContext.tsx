/**
 * ReadPostsContext - 集中管理已读帖子状态
 * 
 * 解决的问题：
 * 1. 多个页面独立维护已读帖子状态，可能导致并发写入时数据覆盖丢失
 * 2. 使用"读-改-写"模式确保数据一致性
 * 3. 提供统一的已读状态管理接口
 */
import React, {createContext, useContext, useState, useEffect, useCallback, useRef} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const READ_POSTS_IDS_KEY = 'read_posts_ids';

interface ReadPostsContextType {
  readPosts: Set<string>;
  isRead: (postId: string) => boolean;
  markAsRead: (postId: string) => Promise<void>;
  refreshReadPosts: () => Promise<void>;
}

const ReadPostsContext = createContext<ReadPostsContextType | undefined>(undefined);

export const ReadPostsProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [readPosts, setReadPosts] = useState<Set<string>>(new Set());
  const isLoadingRef = useRef(false);

  // 加载已读帖子
  const loadReadPosts = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    
    try {
      const jsonValue = await AsyncStorage.getItem(READ_POSTS_IDS_KEY);
      if (jsonValue != null) {
        const ids: string[] = JSON.parse(jsonValue);
        setReadPosts(new Set(ids));
      }
    } catch (e) {
      console.error('[ReadPosts] Failed to load read posts:', e);
    } finally {
      isLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadReadPosts();
  }, [loadReadPosts]);

  // 检查帖子是否已读
  const isRead = useCallback((postId: string): boolean => {
    return readPosts.has(postId);
  }, [readPosts]);

  // 标记帖子为已读（使用读-改-写模式确保数据一致性）
  const markAsRead = useCallback(async (postId: string) => {
    // 先更新本地状态（即时UI反馈）
    setReadPosts(prev => {
      if (prev.has(postId)) return prev;
      const newSet = new Set(prev);
      newSet.add(postId);
      return newSet;
    });

    try {
      // 使用读-改-写模式确保不丢失其他页面的修改
      const existing = await AsyncStorage.getItem(READ_POSTS_IDS_KEY);
      const ids: string[] = existing ? JSON.parse(existing) : [];
      
      if (!ids.includes(postId)) {
        ids.push(postId);
        await AsyncStorage.setItem(READ_POSTS_IDS_KEY, JSON.stringify(ids));
      }
    } catch (e) {
      console.error('[ReadPosts] Failed to save read post:', e);
    }
  }, []);

  // 刷新已读帖子（用于页面获得焦点时同步状态）
  const refreshReadPosts = useCallback(async () => {
    await loadReadPosts();
  }, [loadReadPosts]);

  return (
    <ReadPostsContext.Provider value={{readPosts, isRead, markAsRead, refreshReadPosts}}>
      {children}
    </ReadPostsContext.Provider>
  );
};

export const useReadPosts = (): ReadPostsContextType => {
  const context = useContext(ReadPostsContext);
  if (context === undefined) {
    throw new Error('useReadPosts must be used within a ReadPostsProvider');
  }
  return context;
};

export default ReadPostsContext;
