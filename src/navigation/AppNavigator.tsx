import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {Text, TouchableOpacity} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useTheme} from '../components/ThemedComponents';

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
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.tabBarBackground,
          borderTopColor: theme.tabBarBorder,
        },
        headerStyle: {
          backgroundColor: theme.headerBackground,
        },
        headerTintColor: theme.text,
        headerTitleStyle: {
          fontWeight: '600',
          color: theme.text,
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: '首页',
          tabBarIcon: ({color}) => (
            <Text style={{color, fontSize: 24}}>🏠</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Board"
        component={BoardScreen}
        options={{
          title: '版面',
          tabBarIcon: ({color}) => (
            <Text style={{color, fontSize: 24}}>📋</Text>
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
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: '我',
          tabBarIcon: ({color}) => (
            <Text style={{color, fontSize: 24}}>⚙️</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// 应用导航器
const AppNavigator = () => {
  const theme = useTheme();
  return (
    <Stack.Navigator
      screenOptions={({navigation}) => ({
        headerStyle: {
          backgroundColor: theme.headerBackground,
        },
        headerTintColor: theme.primary, // 统一使用主题蓝色（按钮颜色）
        headerTitleStyle: {
          fontWeight: '600',
          color: theme.text, // 标题颜色跟随主题
        },
        headerBackTitleVisible: false, // 隐藏返回文字
        headerBackTitle: '', // 不显示返回文字
        headerLeft: ({canGoBack}) =>
          canGoBack ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{marginLeft: -4, padding: 4, paddingRight: 12}}>
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M15 18L9 12L15 6"
                  stroke={theme.primary}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </TouchableOpacity>
          ) : null,
      })}>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{
          headerShown: false,
          title: '', // 设置空标题，避免返回时显示 "MainTabs"
          headerBackTitleVisible: false,
          headerBackTitle: '',
          headerBackTitleStyle: {
            display: 'none',
            opacity: 0,
          },
        }}
      />
      <Stack.Screen
        name="PostDetail"
        component={PostDetailScreen}
        options={{
          title: '',
          headerBackTitleVisible: false,
          headerBackTitle: '',
          headerBackTitleStyle: {
            display: 'none',
            opacity: 0,
          },
        }}
      />
      <Stack.Screen
        name="BoardList"
        component={BoardListScreen}
        options={{
          title: '收藏版面',
        }}
      />
      <Stack.Screen
        name="Mail"
        component={MailScreen}
        options={{
          title: '站内邮箱',
        }}
      />
      <Stack.Screen
        name="SettingsDetail"
        component={SettingsDetailScreen}
        options={{
          title: '设置',
        }}
      />
      <Stack.Screen
        name="AccountSwitch"
        component={AccountSwitchScreen}
        options={{
          title: '切换帐号',
        }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{
          title: '修改密码',
        }}
      />
      <Stack.Screen
        name="CacheManagement"
        component={CacheManagementScreen}
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
        component={MailDetailScreen}
        options={({route}) => ({
          title: (route.params as any)?.mail?.fromNickname || '私信详情',
        })}
      />
      <Stack.Screen
        name="BrowsingHistory"
        component={BrowsingHistoryScreen}
        options={{
          title: '浏览历史',
        }}
      />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
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
        component={LoginScreen}
        options={{
          title: '登录',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="CreatePost"
        component={CreatePostScreen}
        options={{
          title: '',
        }}
      />
      <Stack.Screen
        name="MyArticles"
        component={MyArticlesScreen}
        options={{
          title: '我的文章',
        }}
      />
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{
          title: '我的收藏',
        }}
      />
      <Stack.Screen
        name="MyFollowing"
        component={MyFollowingScreen}
        options={{
          title: '我的关注',
        }}
      />
      <Stack.Screen
        name="MyFans"
        component={MyFansScreen}
        options={{
          title: '我的粉丝',
        }}
      />
      <Stack.Screen
        name="Blacklist"
        component={BlacklistScreen}
        options={{
          title: '黑名单',
        }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
