import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {Text} from 'react-native';

// Screens
import HomeScreen from '../screens/HomeScreen';
import BoardScreen from '../screens/BoardScreen';
import MailScreen from '../screens/MailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SettingsDetailScreen from '../screens/SettingsDetailScreen';
import AccountSwitchScreen from '../screens/AccountSwitchScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import BoardListScreen from '../screens/BoardListScreen';
import CacheManagementScreen from '../screens/CacheManagementScreen';
import LoginScreen from '../screens/LoginScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import MailDetailScreen from '../screens/MailDetailScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// 主Tab导航
const MainTabs = () => {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTintColor: '#000',
        headerTitleStyle: {
          fontWeight: '600',
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
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#fff',
          },
          headerTintColor: '#000',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}>
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="PostDetail"
          component={PostDetailScreen}
          options={{
            title: '',
            headerBackTitle: '返回',
          }}
        />
        <Stack.Screen
          name="BoardList"
          component={BoardListScreen}
          options={{
            title: '收藏版面',
            headerBackTitle: '返回',
          }}
        />
        <Stack.Screen
          name="Mail"
          component={MailScreen}
          options={{
            title: '站内邮箱',
            headerBackTitle: '返回',
          }}
        />
        <Stack.Screen
          name="SettingsDetail"
          component={SettingsDetailScreen}
          options={{
            title: '设置',
            headerBackTitle: '返回',
          }}
        />
        <Stack.Screen
          name="AccountSwitch"
          component={AccountSwitchScreen}
          options={{
            title: '切换帐号',
            headerBackTitle: '返回',
          }}
        />
        <Stack.Screen
          name="CacheManagement"
          component={CacheManagementScreen}
          options={{
            title: '缓存管理',
            headerBackTitle: '返回',
          }}
        />
        <Stack.Screen
          name="UserProfile"
          component={UserProfileScreen}
          options={{
            title: '个人资料',
            headerBackTitle: '返回',
          }}
        />
        <Stack.Screen
          name="MailDetail"
          component={MailDetailScreen}
          options={({route}) => ({
            title: (route.params as any)?.mail?.fromNickname || '私信详情',
            headerBackTitle: '返回',
          })}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            title: '登录',
            headerBackTitle: '返回',
            presentation: 'modal',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;

