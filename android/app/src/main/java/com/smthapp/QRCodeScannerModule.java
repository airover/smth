package com.smthapp;

import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;

public class QRCodeScannerModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "QRCodeScanner";
    private static final String TAG = "QRCodeScanner";

    public QRCodeScannerModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void detectQRCode(String imagePath, Promise promise) {
        try {
            Log.d(TAG, "开始识别二维码: " + imagePath);
            
            Bitmap bitmap = loadBitmap(imagePath);
            if (bitmap == null) {
                promise.reject("IMAGE_LOAD_ERROR", "无法加载图片");
                return;
            }
            
            Log.d(TAG, "图片加载成功，尺寸: " + bitmap.getWidth() + "x" + bitmap.getHeight());
            
            // 尝试识别二维码
            String result = decodeQRCode(bitmap);
            
            // 如果失败，尝试旋转图片
            if (result == null) {
                Log.d(TAG, "原图未识别到，尝试旋转90度");
                Bitmap rotated90 = rotateBitmap(bitmap, 90);
                result = decodeQRCode(rotated90);
                rotated90.recycle();
            }
            
            if (result == null) {
                Log.d(TAG, "旋转90度未识别到，尝试旋转180度");
                Bitmap rotated180 = rotateBitmap(bitmap, 180);
                result = decodeQRCode(rotated180);
                rotated180.recycle();
            }
            
            if (result == null) {
                Log.d(TAG, "旋转180度未识别到，尝试旋转270度");
                Bitmap rotated270 = rotateBitmap(bitmap, 270);
                result = decodeQRCode(rotated270);
                rotated270.recycle();
            }
            
            // 释放资源
            bitmap.recycle();
            
            if (result != null) {
                Log.d(TAG, "成功识别二维码: " + result);
                promise.resolve(result);
            } else {
                Log.d(TAG, "未识别到二维码");
                promise.resolve(null);
            }

        } catch (Exception e) {
            Log.e(TAG, "识别二维码失败: " + e.getMessage(), e);
            promise.reject("QR_DETECT_ERROR", "识别二维码失败: " + e.getMessage());
        }
    }
    
    private Bitmap loadBitmap(String imagePath) {
        try {
            // 移除 file:// 前缀
            String cleanPath = imagePath;
            if (cleanPath.startsWith("file://")) {
                cleanPath = cleanPath.substring(7);
            }
            
            // 检查是否是 content:// URI
            if (imagePath.startsWith("content://")) {
                ContentResolver resolver = getReactApplicationContext().getContentResolver();
                InputStream inputStream = resolver.openInputStream(Uri.parse(imagePath));
                if (inputStream != null) {
                    Bitmap bitmap = BitmapFactory.decodeStream(inputStream);
                    inputStream.close();
                    return bitmap;
                }
            }
            
            // 尝试作为文件路径加载
            File imageFile = new File(cleanPath);
            if (imageFile.exists()) {
                // 先获取图片方向
                int orientation = getExifOrientation(cleanPath);
                
                // 解码图片
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inPreferredConfig = Bitmap.Config.ARGB_8888;
                Bitmap bitmap = BitmapFactory.decodeFile(cleanPath, options);
                
                // 根据EXIF信息旋转图片
                if (bitmap != null && orientation != 0) {
                    Bitmap rotated = rotateBitmap(bitmap, orientation);
                    if (rotated != bitmap) {
                        bitmap.recycle();
                    }
                    return rotated;
                }
                return bitmap;
            }
            
            return null;
        } catch (Exception e) {
            Log.e(TAG, "加载图片失败: " + e.getMessage(), e);
            return null;
        }
    }
    
    private int getExifOrientation(String imagePath) {
        try {
            ExifInterface exif = new ExifInterface(imagePath);
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            switch (orientation) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    return 90;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    return 180;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    return 270;
                default:
                    return 0;
            }
        } catch (Exception e) {
            return 0;
        }
    }
    
    private Bitmap rotateBitmap(Bitmap bitmap, int degrees) {
        if (degrees == 0 || bitmap == null) {
            return bitmap;
        }
        Matrix matrix = new Matrix();
        matrix.postRotate(degrees);
        try {
            return Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        } catch (OutOfMemoryError e) {
            return bitmap;
        }
    }
    
    private String decodeQRCode(Bitmap bitmap) {
        if (bitmap == null) {
            return null;
        }
        
        try {
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            int[] pixels = new int[width * height];
            bitmap.getPixels(pixels, 0, width, 0, 0, width, height);

            RGBLuminanceSource source = new RGBLuminanceSource(width, height, pixels);
            BinaryBitmap binaryBitmap = new BinaryBitmap(new HybridBinarizer(source));

            // 配置解码器，提高识别率
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.POSSIBLE_FORMATS, EnumSet.of(BarcodeFormat.QR_CODE));
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            hints.put(DecodeHintType.CHARACTER_SET, "UTF-8");

            MultiFormatReader reader = new MultiFormatReader();
            reader.setHints(hints);
            
            Result result = reader.decode(binaryBitmap);
            return result != null ? result.getText() : null;
            
        } catch (NotFoundException e) {
            // 未找到二维码
            return null;
        } catch (Exception e) {
            Log.e(TAG, "解码二维码异常: " + e.getMessage());
            return null;
        }
    }
}
