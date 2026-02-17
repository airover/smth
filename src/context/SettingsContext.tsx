// 全局配置上下文
import React, {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import {AppSettings} from '../types';
import {getAppSettings, saveAppSettings} from '../utils/storage';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{children: ReactNode}> = ({children}) => {
  const [settings, setSettings] = useState<AppSettings>({
    fontSize: 'medium',
    defaultBoardSort: 'post',
    themeMode: 'spring',
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await getAppSettings();
      setSettings(savedSettings);
    } catch (error) {
      console.error('Load settings error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      const updatedSettings = {...settings, ...newSettings};
      await saveAppSettings(updatedSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Update settings error:', error);
      throw error;
    }
  };

  return (
    <SettingsContext.Provider value={{settings, updateSettings, isLoading}}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
