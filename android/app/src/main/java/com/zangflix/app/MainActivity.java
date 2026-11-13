package com.zangflix.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
  private WebView web;
  private View customView;
  private int previousOrientation;
  private int previousSystemUi;
  private int previousWindowFlags;
  private WebChromeClient.CustomViewCallback customCallback;
  private static final String HOME = "https://zangflix.vercel.app/";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    web.setBackgroundColor(0xff090a10);
    web.getSettings().setJavaScriptEnabled(true);
    // Identify the actual installed Android APK, not a Chrome PWA shortcut.
    web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " ZangFlixAndroid/1.0");
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setMediaPlaybackRequiresUserGesture(false);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if ("https".equals(uri.getScheme()) && "zangflix.vercel.app".equals(uri.getHost())) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public void onShowCustomView(View view, CustomViewCallback callback) {
        if (customView != null) { callback.onCustomViewHidden(); return; }
        previousOrientation = getRequestedOrientation();
        previousSystemUi = getWindow().getDecorView().getSystemUiVisibility();
        previousWindowFlags = getWindow().getAttributes().flags;
        customView = view; customCallback = callback;
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        setContentView(view);
      }
      @Override public void onHideCustomView() {
        if (customView == null) return;
        customView = null; setContentView(web);
        setRequestedOrientation(previousOrientation);
        getWindow().setFlags(previousWindowFlags, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(previousSystemUi);
        if (customCallback != null) customCallback.onCustomViewHidden();
        customCallback = null;
      }
    });
    setContentView(web);
    web.loadUrl(HOME);
  }
  @Override public void onBackPressed() {
    if (customView != null) { web.getWebChromeClient().onHideCustomView(); return; }
    if (web.canGoBack()) { web.goBack(); return; }
    super.onBackPressed();
  }
  @Override protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}
