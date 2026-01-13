// 类型定义

export interface User {
  username: string;
  nickname?: string;
  avatar?: string;
  signature?: string;
  location?: string;
  city?: string;
  email?: string;
  mobile?: string;
  gender?: number; // 0: 保密, 1: 男, 2: 女
  levelTitle?: string;
  title?: string; // 用户头衔，如"水木常青"
  score?: number;
  postCount?: number;
  loginTime?: number; // 最后登录时间戳
  createTime?: number; // 注册时间戳
  friendCount?: number; // 关注数
  fansCount?: number; // 粉丝数
  isLoggedIn?: boolean;
  recentPosts?: Array<{
    id: string;
    subject: string;
    body?: string;
    boardName?: string;
    boardTitle?: string;
    postTime?: number;
    replyCount?: number;
    topicId?: string;
    boardId?: string;
  }>;
}

export interface Board {
  id: string;
  name: string;
  chineseName?: string;
  description?: string;
  cover?: string;
  parentId?: string;
  children?: Board[];
  isFavorite?: boolean;
  isFolder?: boolean;
  type?: number;
}

export interface Post {
  id: string;
  articleId?: string; // 文章ID，用于删除等操作
  title: string;
  author: string;
  nick?: string;
  avatar?: string;
  city?: string;
  levelTitle?: string;
  board: string;
  boardName?: string;
  replyCount: number;
  postTime: string;
  lastReplyTime?: string;
  isTop?: boolean;
  content?: string;
  contentText?: string;
  attachments?: Attachment[];
  likes?: Like[];
  replies?: Reply[];
}

export interface Like {
  id: string;
  author: string;
  nick?: string;
  avatar?: string;
  city?: string;
  levelTitle?: string;
  body: string;
  postTime: string;
  score?: number;
}

export interface Attachment {
  id?: string;
  url: string;
  name?: string;
  type?: number;
  size?: number;
}

export interface Reply {
  id: string;
  author: string;
  nickname?: string;
  avatar?: string;
  signature?: string;
  location?: string;
  city?: string;
  levelTitle?: string;
  content: string;
  postTime: string;
  floor?: number;
  attachments?: Attachment[];
}

export interface TopTenItem {
  id: string;
  title: string;
  author: string;
  board: string;
  boardName?: string;
  replyCount: number;
  postTime: string;
  lastReplyTime: string;
}

export interface Mail {
  id: string;
  conversationId: string;
  from: string;
  fromId: string;
  fromNickname?: string;
  fromAvatar?: string;
  subject: string;
  body: string;
  sendTime: number;
  unread: number;
  items: number; // 对话中的消息数量
}

export interface LoginCredentials {
  username: string;
  password: string;
}

// 全局配置
export interface AppSettings {
  fontSize: 'small' | 'medium' | 'large'; // 帖子内容字体大小
  defaultBoardSort: 'post' | 'reply'; // 版面帖子默认排序方式: post-按发布时间, reply-按回复时间
  themeMode: 'light' | 'dark' | 'auto'; // 主题模式: light-日间, dark-夜间, auto-跟随系统
}
