// HTML解析工具 - 用于解析 wap.newsmth.net 页面数据

// 解析帖子列表 (wap 页面格式)
export const parsePostList = (html: string): any[] => {
  const posts: any[] = [];
  
  // wap 页面帖子链接格式: /article/Board/PostId
  const postRegex = /<a[^>]*href="\/article\/([^\/]+)\/(\d+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  
  while ((match = postRegex.exec(html)) !== null) {
    const board = match[1];
    const postId = match[2];
    const title = match[3].trim();
    
    if (title && title.length > 0) {
      posts.push({
        id: postId,
        title: title,
        board: board,
        author: '',
        postTime: '',
        replyCount: 0,
      });
    }
  }
  
  return posts;
};

// 解析帖子详情 (wap 页面格式)
export const parsePostDetail = (html: string): any => {
  const post: any = {
    title: '',
    content: '',
    author: '',
    postTime: '',
  };
  
  // 提取标题
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i) ||
                     html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (titleMatch) {
    post.title = titleMatch[1]
      .replace(/水木社区|SMTH|newsmth/gi, '')
      .replace(/-/g, '')
      .trim();
  }
  
  // 提取作者
  const authorMatch = html.match(/发信人[：:]\s*([a-zA-Z0-9_]+)/i) ||
                      html.match(/<a[^>]*href="\/user\/([a-zA-Z0-9_]+)"[^>]*>/i);
  if (authorMatch) {
    post.author = authorMatch[1];
  }
  
  // 提取时间
  const timeMatch = html.match(/(\d{4}[-\/]\d{2}[-\/]\d{2}\s*\d{2}:\d{2}:\d{2})/);
  if (timeMatch) {
    post.postTime = timeMatch[1];
  }
  
  // 提取内容 - 尝试多种方式
  // 方式1: 查找 class 包含 content 的 div
  let contentMatch = html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  
  // 方式2: 查找发信站后的内容
  if (!contentMatch) {
    contentMatch = html.match(/发信站[\s\S]*?<br[^>]*>([\s\S]*?)(?:--\s*$|<\/div>|<hr)/i);
  }
  
  // 方式3: 查找 article 或 post 区域
  if (!contentMatch) {
    contentMatch = html.match(/<div[^>]*class="[^"]*(?:article|post)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  }
  
  if (contentMatch) {
    post.content = contentMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/发信人[：:][^\n]+/i, '')
      .replace(/发信站[：:][^\n]+/i, '')
      .trim();
  }
  
  return post;
};

// 解析回复列表 (wap 页面格式)
export const parseReplies = (html: string): any[] => {
  const replies: any[] = [];
  
  // wap 页面回复通常在独立的块中
  const replyBlockRegex = /<div[^>]*class="[^"]*(?:reply|post|article|floor)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let match;
  let floor = 1;
  
  while ((match = replyBlockRegex.exec(html)) !== null) {
    const block = match[1];
    
    // 提取作者
    const authorMatch = block.match(/发信人[：:]\s*([a-zA-Z0-9_]+)/i) ||
                        block.match(/<a[^>]*href="\/user\/([a-zA-Z0-9_]+)"[^>]*>/i);
    
    // 提取时间
    const timeMatch = block.match(/(\d{4}[-\/]\d{2}[-\/]\d{2}\s*\d{2}:\d{2}:\d{2})/);
    
    // 提取内容
    const content = block
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/发信人[：:][^\n]+/i, '')
      .replace(/发信站[：:][^\n]+/i, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
    
    if (authorMatch && content.length > 10) {
      replies.push({
        id: `reply-${floor}`,
        author: authorMatch[1],
        content: content,
        postTime: timeMatch ? timeMatch[1] : '',
        floor: floor,
      });
      floor++;
    }
  }
  
  return replies;
};

// 解析版面列表 (wap 页面格式)
export const parseBoards = (html: string): any[] => {
  const boards: any[] = [];
  const seen = new Set<string>();
  
  // wap 页面版面链接格式: /board/BoardName
  const boardRegex = /<a[^>]*href="\/board\/([^"\/]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  
  while ((match = boardRegex.exec(html)) !== null) {
    const boardId = match[1];
    const name = match[2].trim();
    
    if (name && !seen.has(boardId) && !name.includes('登录') && !name.includes('注册')) {
      seen.add(boardId);
      boards.push({
        id: boardId,
        name: boardId,
        chineseName: name,
      });
    }
  }
  
  return boards;
};

// 解析分区列表
export const parseSections = (html: string): any[] => {
  const sections: any[] = [];
  
  // wap 页面分区链接格式: /section/SectionId
  const sectionRegex = /<a[^>]*href="\/section\/(\d+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  
  while ((match = sectionRegex.exec(html)) !== null) {
    const sectionId = match[1];
    const name = match[2].trim();
    
    if (name) {
      sections.push({
        id: `section-${sectionId}`,
        name: name,
        chineseName: name,
        children: [],
      });
    }
  }
  
  return sections;
};

// 解析用户信息
export const parseUserInfo = (html: string): any => {
  const userInfo: any = {};
  
  // 提取用户名
  const usernameMatch = html.match(/用户名[：:]\s*([a-zA-Z0-9_]+)/i) ||
                        html.match(/ID[：:]\s*([a-zA-Z0-9_]+)/i);
  if (usernameMatch) {
    userInfo.username = usernameMatch[1];
  }
  
  // 提取昵称
  const nicknameMatch = html.match(/昵称[：:]\s*([^\n<]+)/i);
  if (nicknameMatch) {
    userInfo.nickname = nicknameMatch[1].trim();
  }
  
  // 提取签名
  const signatureMatch = html.match(/签名[：:]\s*([^\n<]+)/i);
  if (signatureMatch) {
    userInfo.signature = signatureMatch[1].trim();
  }
  
  // 提取登录状态
  const hasLogout = html.includes('logout') || html.includes('登出') || html.includes('退出');
  userInfo.isLoggedIn = hasLogout;
  
  return userInfo;
};

// 解析十大
export const parseTopTen = (html: string): any[] => {
  const items: any[] = [];
  
  // 尝试匹配十大区域
  const topTenSection = html.match(/十大[\s\S]*?(?=<\/div>|<\/section>|<hr|$)/i);
  const searchText = topTenSection ? topTenSection[0] : html;
  
  // 匹配文章链接
  const articleRegex = /<a[^>]*href="\/article\/([^\/]+)\/(\d+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  let count = 0;
  
  while ((match = articleRegex.exec(searchText)) !== null && count < 10) {
    const board = match[1];
    const postId = match[2];
    const title = match[3].trim();
    
    if (title && title.length > 0 && !title.includes('登录') && !title.includes('注册')) {
      items.push({
        id: postId,
        title: title,
        board: board,
        boardName: board,
        author: '',
        replyCount: 0,
        postTime: new Date().toISOString(),
        lastReplyTime: new Date().toISOString(),
      });
      count++;
    }
  }
  
  return items;
};
