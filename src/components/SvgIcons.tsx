import React from 'react';
import Svg, {
  Path,
  Circle,
  Rect,
  Line,
  Polyline,
  Polygon,
  G,
} from 'react-native-svg';

/**
 * SVG 图标属性
 */
interface IconProps {
  size?: number;
  color?: string;
}

/**
 * 通用 SVG 图标容器（Lucide/Feather 风格：线性描边）
 */
const SvgIcon: React.FC<{
  children: React.ReactNode;
  size: number;
  color: string;
  fill?: string;
  strokeWidth?: number;
}> = ({children, size, color, fill = 'none', strokeWidth = 2}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round">
    {children}
  </Svg>
);

// ==================== Tab 导航栏图标 ====================

/** 首页 */
export const HomeIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <Polyline points="9 22 9 12 15 12 15 22" />
  </SvgIcon>
);

/** 版面/剪贴板 */
export const BoardIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <Rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <Line x1="8" y1="12" x2="16" y2="12" />
    <Line x1="8" y1="16" x2="16" y2="16" />
  </SvgIcon>
);

/** 用户/个人 */
export const UserIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <Circle cx="12" cy="7" r="4" />
  </SvgIcon>
);

// ==================== "我"页面菜单图标 ====================

/** 浏览历史/时钟 */
export const HistoryIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Circle cx="12" cy="12" r="10" />
    <Polyline points="12 6 12 12 16 14" />
  </SvgIcon>
);

/** 收藏/星星 */
export const StarIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </SvgIcon>
);

/** 文章/文件编辑 */
export const ArticleIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </SvgIcon>
);

/** 关注/多人 */
export const UsersIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <Circle cx="9" cy="7" r="4" />
    <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </SvgIcon>
);

/** 黑名单/禁止 */
export const BanIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Circle cx="12" cy="12" r="10" />
    <Line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </SvgIcon>
);

/** 邮箱/信封 */
export const MailIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <Polyline points="22,6 12,13 2,6" />
  </SvgIcon>
);

/** 设置/齿轮 */
export const SettingsIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </SvgIcon>
);

// ==================== 帖子操作图标 ====================

/** 点赞/大拇指 */
export const ThumbsUpIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </SvgIcon>
);

/** 鸡蛋 */
export const EggIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none">
    <Path
      d="M12 2C8.5 2 5 8.5 5 14a7 7 0 0 0 14 0c0-5.5-3.5-12-7-12z"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/** 消息/对话框 */
export const MessageIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </SvgIcon>
);

// ==================== 版面页图标 ====================

/** 发帖/编辑 */
export const EditIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M12 20h9" />
    <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </SvgIcon>
);

/** 日历 */
export const CalendarIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <Line x1="16" y1="2" x2="16" y2="6" />
    <Line x1="8" y1="2" x2="8" y2="6" />
    <Line x1="3" y1="10" x2="21" y2="10" />
  </SvgIcon>
);

/** 搜索/放大镜 */
export const SearchIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Circle cx="11" cy="11" r="8" />
    <Line x1="21" y1="21" x2="16.65" y2="16.65" />
  </SvgIcon>
);

/** 关闭/取消 */
export const XIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Line x1="6" y1="6" x2="18" y2="18" />
    <Line x1="18" y1="6" x2="6" y2="18" />
  </SvgIcon>
);

/** 密码可见 */
export const EyeIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
    <Circle cx="12" cy="12" r="3" />
  </SvgIcon>
);

/** 密码隐藏 */
export const EyeOffIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <Path d="M9.9 4.24A9.77 9.77 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <Path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <Line x1="1" y1="1" x2="23" y2="23" />
  </SvgIcon>
);

/** 喜欢/心形 */
export const HeartIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
  </SvgIcon>
);

/** 文件夹（展开） */
export const FolderOpenIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <Path d="M2 10h20" />
  </SvgIcon>
);

/** 文件夹（关闭） */
export const FolderIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </SvgIcon>
);

/** 文件/文档 */
export const FileIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <Polyline points="14 2 14 8 20 8" />
    <Line x1="16" y1="13" x2="8" y2="13" />
    <Line x1="16" y1="17" x2="8" y2="17" />
    <Polyline points="10 9 9 9 8 9" />
  </SvgIcon>
);

/** 回形针/附件 */
export const PaperclipIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </SvgIcon>
);

/** 爆炸效果（用星芒表示） */
export const BurstIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2l2.09 6.26L20.18 9l-5.09 3.74L17.18 19 12 15.27 6.82 19l2.09-6.26L3.82 9l6.09-.74L12 2z"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={color}
      fillOpacity={0.2}
    />
  </Svg>
);

/** 热度/热门 */
export const FlameIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M12 22c4.42 0 8-3.13 8-7 0-4.5-3-7.5-5-11-2 2-4 4.5-4 7 0 1.2.4 2.2 1 3-2-.5-3.5-2-3.5-4.5C5.5 11 4 13 4 15c0 3.87 3.58 7 8 7z" />
  </SvgIcon>
);

/** 调色板（替代 🎨） */
export const PaletteIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Circle cx="13.5" cy="6.5" r="0.5" fill={color} />
    <Circle cx="17.5" cy="10.5" r="0.5" fill={color} />
    <Circle cx="8.5" cy="7.5" r="0.5" fill={color} />
    <Circle cx="6.5" cy="12" r="0.5" fill={color} />
    <Path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
  </SvgIcon>
);

// ==================== 发帖页图标 ====================

/** 相机/拍照 */
export const CameraIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <Circle cx="12" cy="13" r="4" />
  </SvgIcon>
);

/** 图片/相册（长方形风格） */
export const ImageIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
    <Circle cx="7.5" cy="10" r="1.5" />
    <Polyline points="22 16 17 11 6 19" />
  </SvgIcon>
);

/** 对勾圆圈（验证通过） */
export const CheckCircleIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <Polyline points="22 4 12 14.01 9 11.01" />
  </SvgIcon>
);

/** 对勾（简单） */
export const CheckIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Polyline points="20 6 9 17 4 12" />
  </SvgIcon>
);

/** 灯泡/提示 */
export const LightbulbIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Line x1="9" y1="18" x2="15" y2="18" />
    <Line x1="10" y1="22" x2="14" y2="22" />
    <Path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </SvgIcon>
);

// ==================== 用户主页图标 ====================

/** 地图标记/位置 */
export const MapPinIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <Circle cx="12" cy="10" r="3" />
  </SvgIcon>
);

/** 垃圾桶/删除 */
export const TrashIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Polyline points="3 6 5 6 21 6" />
    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <Line x1="10" y1="11" x2="10" y2="17" />
    <Line x1="14" y1="11" x2="14" y2="17" />
  </SvgIcon>
);

/** 手电筒/闪光灯 */
export const FlashlightIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </SvgIcon>
);

/** 加号/添加 */
export const PlusIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Line x1="12" y1="5" x2="12" y2="19" />
    <Line x1="5" y1="12" x2="19" y2="12" />
  </SvgIcon>
);

// ==================== 通用导航图标 ====================

/** 返回箭头（左箭头） */
export const ArrowLeftIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Line x1="19" y1="12" x2="5" y2="12" />
    <Polyline points="12 19 5 12 12 5" />
  </SvgIcon>
);

/** 竖三点/更多（MoreVertical） */
export const MoreVerticalIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color} strokeWidth={0}>
    <Circle cx="12" cy="12" r="1.5" fill={color} />
    <Circle cx="12" cy="5.5" r="1.5" fill={color} />
    <Circle cx="12" cy="18.5" r="1.5" fill={color} />
  </SvgIcon>
);

/** 菜单（三横线汉堡按钮） */
export const MenuIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#333',
}) => (
  <SvgIcon size={size} color={color}>
    <Line x1="3" y1="12" x2="21" y2="12" />
    <Line x1="3" y1="6" x2="21" y2="6" />
    <Line x1="3" y1="18" x2="21" y2="18" />
  </SvgIcon>
);

/** 右向箭头（列表「可进入」指示，替代 unicode ›） */
export const ChevronRightIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#C7C7CC',
}) => (
  <SvgIcon size={size} color={color}>
    <Polyline points="9 18 15 12 9 6" />
  </SvgIcon>
);

/** 下向箭头（展开/收起指示，替代 unicode ▼，可旋转） */
export const ChevronDownIcon: React.FC<IconProps> = ({
  size = 24,
  color = '#C7C7CC',
}) => (
  <SvgIcon size={size} color={color}>
    <Polyline points="6 9 12 15 18 9" />
  </SvgIcon>
);

/** 排序（上下方向） */
export const SortIcon: React.FC<IconProps> = ({size = 24, color = '#333'}) => (
  <SvgIcon size={size} color={color}>
    <Line x1="8" y1="4" x2="8" y2="20" />
    <Polyline points="4 8 8 4 12 8" />
    <Line x1="16" y1="20" x2="16" y2="4" />
    <Polyline points="12 16 16 20 20 16" />
  </SvgIcon>
);
