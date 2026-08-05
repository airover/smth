import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {Text, TouchableOpacity, ImageBackground, StyleSheet} from 'react-native';
import {HomeIcon, BoardIcon, UserIcon, ArrowLeftIcon} from '../components/SvgIcons';

import {useTheme} from '../components/ThemedComponents';
import {FloatingHeaderProvider} from '../components/ThemeHeader';

// Screens
import HomeScreen from '../screens/HomeScreen';
import BoardScreen from '../screens/BoardScreen';
import MailScreen from '../screens/MailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SettingsDetailScreen from '../screens/SettingsDetailScreen';
import AccountSwitchScreen from '../screens/AccountSwitchScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import BoardListScreen from '../screens/BoardListScreen';
import CacheManagementScreen from '../screens/CacheManagementScreen';
import LoginScreen from '../screens/LoginScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import MailDetailScreen from '../screens/MailDetailScreen';
import BrowsingHistoryScreen from '../screens/BrowsingHistoryScreen';
import SearchScreen from '../screens/SearchScreen';
import SearchInputScreen from '../screens/SearchInputScreen';
import CreatePostScreen from '../screens/CreatePostScreen';
// WebViewPostScreen 已移除使用
import MyArticlesScreen from '../screens/MyArticlesScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import MyFollowingScreen from '../screens/MyFollowingScreen';
import MyFansScreen from '../screens/MyFansScreen';
import BlacklistScreen from '../screens/BlacklistScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();



// 主Tab导航
const MainTabs = () => {
  const theme = useTheme();
  const hasBackgroundImage = !!theme.headerBackgroundImage;

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        // 有背景图时隐藏 React Navigation 的 header，由 FloatingHeaderProvider 渲染 ThemeHeader
        headerShown: !hasBackgroundImage,
        headerStyle: {
          backgroundColor: theme.headerBackground,
        },
        headerTintColor: theme.headerTint,
        headerTitleStyle: {
          fontWeight: '600' as const,
          color: theme.headerText,
        },
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.tabBarBackgroundImage ? 'transparent' : theme.tabBarBackground,
          borderTopColor: theme.tabBarBorder,
        },
        ...(theme.tabBarBackgroundImage ? {
          tabBarBackground: () => (
            <ImageBackground
              source={theme.tabBarBackgroundImage!}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ),
        } : {}),
      }}>
      <Tab.Screen
        name="Home"
        options={{
          title: '首页',
          headerShown: false,
          tabBarIcon: ({color}) => (
            <HomeIcon size={24} color={color} />
          ),
        }}
      >
        {(props: any) => hasBackgroundImage ? (
          <FloatingHeaderProvider defaultTitle="首页">
            <HomeScreen {...props} />
          </FloatingHeaderProvider>
        ) : <HomeScreen {...props} />}
      </Tab.Screen>
      <Tab.Screen
        name="Board"
        options={{
          title: '版面',
          headerShown: !hasBackgroundImage,
          tabBarIcon: ({color}) => (
            <BoardIcon size={24} color={color} />
          ),
        }}
        listeners={({navigation}) => ({
          tabPress: (e) => {
            // 获取当前导航状态
            const state = navigation.getState();
            const currentRoute = state.routes[state.index];
            
            // 如果当前已经在Board Tab中，则触发返回首页
            if (currentRoute.name === 'Board') {
              // 通过setParams触发状态重置，传递一个时间戳确保每次都能触发
              navigation.setParams({
                resetToHome: Date.now(),
              } as any);
            } else {
              // 如果是从其他Tab切换过来，标记为Tab点击进入
              navigation.setParams({
                source: 'tab',
              } as any);
            }
          },
        })}
      >
        {(props: any) => hasBackgroundImage ? (
          <FloatingHeaderProvider defaultTitle="版面">
            <BoardScreen {...props} />
          </FloatingHeaderProvider>
        ) : <BoardScreen {...props} />}
      </Tab.Screen>
      <Tab.Screen
        name="Settings"
        options={{
          title: '我',
          headerShown: !hasBackgroundImage,
          tabBarIcon: ({color}) => (
            <UserIcon size={24} color={color} />
          ),
        }}
      >
        {(props: any) => hasBackgroundImage ? (
          <FloatingHeaderProvider defaultTitle="我">
            <SettingsScreen {...props} />
          </FloatingHeaderProvider>
        ) : <SettingsScreen {...props} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

/**
 * 创建有背景图时的包裹组件
 * Stack 页面需要 canGoBack 和从 route options 获取标题
 */
const createFloatingHeaderScreen = (
  ScreenComponent: React.ComponentType<any>,
  defaultTitle: string,
  extraOptions?: {canGoBack?: boolean},
) => {
  return (props: any) => {
    const theme = useTheme();
    const hasBackgroundImage = !!theme.headerBackgroundImage;
    if (!hasBackgroundImage) {
      return <ScreenComponent {...props} />;
    }
    return (
      <FloatingHeaderProvider
        defaultTitle={defaultTitle}
        canGoBack={extraOptions?.canGoBack ?? true}
      >
        <ScreenComponent {...props} />
      </FloatingHeaderProvider>
    );
  };
};

// 应用导航器
const AppNavigator = () => {
  const theme = useTheme();
  const hasBackgroundImage = !!theme.headerBackgroundImage;
  return (
    <Stack.Navigator
      screenOptions={({navigation}) => ({
        // 有背景图时隐藏 React Navigation 的 header，由 FloatingHeaderProvider 渲染 ThemeHeader
        headerShown: !hasBackgroundImage,
        headerStyle: {
          backgroundColor: theme.headerBackground,
        },
        headerTintColor: theme.headerTint,
        headerTitleStyle: {
          fontWeight: '600' as const,
          color: theme.headerText,
        },
        headerBackTitleVisible: false,
        headerBackTitle: '',
        headerLeft: ({canGoBack}: {canGoBack?: boolean}) =>
          canGoBack ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{marginLeft: -4, padding: 4, paddingRight: 12}}>
              <ArrowLeftIcon size={28} color={theme.headerTint} />
            </TouchableOpacity>
          ) : null,
      })}>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{
          headerShown: false,
          title: '',
        }}
      />
      <Stack.Screen
        name="PostDetail"
        component={createFloatingHeaderScreen(PostDetailScreen, '')}
        options={{
          title: '',
        }}
      />
      <Stack.Screen
        name="BoardList"
        component={createFloatingHeaderScreen(BoardListScreen, '收藏版面')}
        options={{
          title: '收藏版面',
        }}
      />
      <Stack.Screen
        name="Mail"
        component={createFloatingHeaderScreen(MailScreen, '站内邮箱')}
        options={{
          title: '站内邮箱',
        }}
      />
      <Stack.Screen
        name="SettingsDetail"
        component={createFloatingHeaderScreen(SettingsDetailScreen, '设置')}
        options={{
          title: '设置',
        }}
      />
      <Stack.Screen
        name="AccountSwitch"
        component={createFloatingHeaderScreen(AccountSwitchScreen, '切换帐号')}
        options={{
          title: '切换帐号',
        }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={createFloatingHeaderScreen(ChangePasswordScreen, '修改密码')}
        options={{
          title: '修改密码',
        }}
      />
      <Stack.Screen
        name="CacheManagement"
        component={createFloatingHeaderScreen(CacheManagementScreen, '缓存管理')}
        options={{
          title: '缓存管理',
        }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{
          headerShown: false, // 隐藏顶部导航栏
        }}
      />
      <Stack.Screen
        name="MailDetail"
        component={createFloatingHeaderScreen(MailDetailScreen, '私信详情')}
        options={({route}) => ({
          title: (route.params as any)?.mail?.fromNickname || '私信详情',
        })}
      />
      <Stack.Screen
        name="BrowsingHistory"
        component={createFloatingHeaderScreen(BrowsingHistoryScreen, '浏览历史')}
        options={{
          title: '浏览历史',
        }}
      />
      <Stack.Screen
        name="Search"
        component={createFloatingHeaderScreen(SearchScreen, '搜索')}
        options={{
          title: '搜索',
        }}
      />
      <Stack.Screen
        name="SearchInput"
        component={SearchInputScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Login"
        component={createFloatingHeaderScreen(LoginScreen, '登录')}
        options={{
          title: '登录',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="CreatePost"
        component={createFloatingHeaderScreen(CreatePostScreen, '')}
        options={{
          title: '',
        }}
      />
      <Stack.Screen
        name="MyArticles"
        component={createFloatingHeaderScreen(MyArticlesScreen, '我的文章')}
        options={{
          title: '我的文章',
        }}
      />
      <Stack.Screen
        name="Favorites"
        component={createFloatingHeaderScreen(FavoritesScreen, '我的收藏')}
        options={{
          title: '我的收藏',
        }}
      />
      <Stack.Screen
        name="MyFollowing"
        component={createFloatingHeaderScreen(MyFollowingScreen, '我的关注')}
        options={{
          title: '我的关注',
        }}
      />
      <Stack.Screen
        name="MyFans"
        component={createFloatingHeaderScreen(MyFansScreen, '我的粉丝')}
        options={{
          title: '我的粉丝',
        }}
      />
      <Stack.Screen
        name="Blacklist"
        component={createFloatingHeaderScreen(BlacklistScreen, '黑名单')}
        options={{
          title: '黑名单',
        }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
