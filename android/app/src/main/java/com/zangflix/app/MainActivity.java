package com.zangflix.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
  private WebView web;
  private View customView;
  private WebChromeClient.CustomViewCallback customCallback;
  private static final String HOME = "https://zangflix.vercel.app/";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    web.setBackgroundColor(0xff090a10);
    web.getSettings().setJavaScriptEnabled(true);
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
        customView = view; customCallback = callback; setContentView(view);
      }
      @Override public void onHideCustomView() {
        customView = null; setContentView(web);
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
