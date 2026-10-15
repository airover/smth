package com.smthapp;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;

import java.util.Collections;
import java.util.Map;

public class AppInfoModule extends ReactContextBaseJavaModule {
    public AppInfoModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "AppInfo";
    }

    @Override
    public Map<String, Object> getConstants() {
        String appVersion = "未知";
        ReactApplicationContext context = getReactApplicationContext();
        try {
            PackageInfo packageInfo = context.getPackageManager().getPackageInfo(
                    context.getPackageName(), 0);
            if (packageInfo.versionName != null) {
                appVersion = packageInfo.versionName;
            }
        } catch (PackageManager.NameNotFoundException ignored) {
            // Keep the fallback when package metadata cannot be read.
        }
        return Collections.<String, Object>singletonMap("appVersion", appVersion);
    }
}
