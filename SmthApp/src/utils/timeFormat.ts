/**
 * 时间格式化工具
 * 将时间转换为相对时间格式：几分钟前/几小时前/几天前/几月前
 */

/**
 * 格式化时间为相对时间
 * @param time 时间字符串或时间戳
 * @returns 格式化后的相对时间字符串
 */
export const formatRelativeTime = (time: string | number | Date): string => {
  if (!time) return '';

  try {
    const date = new Date(time);
    const now = new Date();
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) {
      return String(time).substring(0, 16);
    }

    const diff = now.getTime() - date.getTime();
    
    // 如果是未来时间，直接返回格式化日期
    if (diff < 0) {
      return formatDate(date);
    }

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 30) return '刚刚';
    if (seconds < 60) return `${seconds}秒前`;
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;
    if (months < 12) return `${months}个月前`;
    return `${years}年前`;
  } catch (error) {
    console.error('Format time error:', error);
    return String(time).substring(0, 16);
  }
};

/**
 * 格式化日期为 YYYY-MM-DD HH:mm 格式
 * @param date Date对象
 * @returns 格式化后的日期字符串
 */
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

/**
 * 格式化简短时间（用于列表等场景）
 * 今天显示时间，昨天显示"昨天"，更早显示日期
 */
export const formatShortTime = (time: string | number | Date): string => {
  if (!time) return '';

  try {
    const date = new Date(time);
    const now = new Date();
    
    if (isNaN(date.getTime())) {
      return String(time).substring(0, 10);
    }

    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 24 && now.getDate() === date.getDate()) {
      // 今天，显示时间
      const hour = String(date.getHours()).padStart(2, '0');
      const minute = String(date.getMinutes()).padStart(2, '0');
      return `${hour}:${minute}`;
    }
    
    if (days === 1 || (hours < 48 && now.getDate() - date.getDate() === 1)) {
      return '昨天';
    }
    
    if (days < 7) {
      return `${days}天前`;
    }

    // 超过7天，显示日期
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    if (now.getFullYear() === date.getFullYear()) {
      return `${month}-${day}`;
    }
    
    return `${date.getFullYear()}-${month}-${day}`;
  } catch (error) {
    console.error('Format short time error:', error);
    return String(time).substring(0, 10);
  }
};




