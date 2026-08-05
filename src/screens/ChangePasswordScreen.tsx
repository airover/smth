import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '../components/ThemedComponents';
import {EyeIcon, EyeOffIcon} from '../components/SvgIcons';
import {changePassword} from '../services/api';
import {useAuth} from '../context/AuthContext';
import {
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
} from '../utils/responsive';

const ChangePasswordScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const {logout} = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    // Validate input
    if (!oldPassword.trim()) {
      Alert.alert('提示', '请输入旧密码');
      return;
    }
    if (!newPassword.trim()) {
      Alert.alert('提示', '请输入新密码');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('提示', '新密码长度不能少于6位');
      return;
    }
    if (oldPassword === newPassword) {
      Alert.alert('提示', '新密码不能与旧密码相同');
      return;
    }

    setIsLoading(true);
    try {
      const result = await changePassword(oldPassword, newPassword);
      if (result.success) {
        Alert.alert('成功', '密码修改成功，请重新登录', [
          {
            text: '确定',
            onPress: async () => {
              // Logout - App.tsx will automatically switch to login screen
              // This ensures user returns to home page after re-login
              await logout();
              // No need to navigate manually, App.tsx will handle it
            },
          },
        ]);
      } else {
        Alert.alert('失败', result.message || '密码修改失败，请重试');
      }
    } catch (error) {
      console.error('Change password error:', error);
      Alert.alert('错误', '网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, {backgroundColor: theme.background}]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          {/* Old Password Input */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, {color: theme.text}]}>旧密码</Text>
            <View style={[styles.inputContainer, {backgroundColor: theme.cardBackground, borderColor: theme.border}]}>
              <TextInput
                style={[styles.input, {color: theme.text}]}
                placeholder="请输入旧密码"
                placeholderTextColor={theme.secondaryText}
                secureTextEntry={!showOldPassword}
                value={oldPassword}
                onChangeText={setOldPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowOldPassword(!showOldPassword)}
                accessibilityRole="button"
                accessibilityLabel={showOldPassword ? '隐藏旧密码' : '显示旧密码'}>
                {showOldPassword ? (
                  <EyeIcon size={22} color={theme.secondaryText} />
                ) : (
                  <EyeOffIcon size={22} color={theme.secondaryText} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* New Password Input */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, {color: theme.text}]}>新密码</Text>
            <View style={[styles.inputContainer, {backgroundColor: theme.cardBackground, borderColor: theme.border}]}>
              <TextInput
                style={[styles.input, {color: theme.text}]}
                placeholder="请输入新密码（至少6位）"
                placeholderTextColor={theme.secondaryText}
                secureTextEntry={!showNewPassword}
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowNewPassword(!showNewPassword)}
                accessibilityRole="button"
                accessibilityLabel={showNewPassword ? '隐藏新密码' : '显示新密码'}>
                {showNewPassword ? (
                  <EyeIcon size={22} color={theme.secondaryText} />
                ) : (
                  <EyeOffIcon size={22} color={theme.secondaryText} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              {backgroundColor: theme.primary},
              isLoading && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}>
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>确认修改</Text>
            )}
          </TouchableOpacity>

          {/* Tips */}
          <View style={styles.tipsContainer}>
            <Text style={[styles.tipsText, {color: theme.secondaryText}]}>
              提示：密码修改成功后需要重新登录
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  inputSection: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
    marginBottom: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.lg,
    paddingVertical: SPACING.md,
  },
  eyeButton: {
    padding: SPACING.sm,
  },
  submitButton: {
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    minHeight: 48,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
  },
  tipsContainer: {
    marginTop: SPACING.xl,
    alignItems: 'center',
  },
  tipsText: {
    fontSize: FONT_SIZE.sm,
  },
});

export default ChangePasswordScreen;
