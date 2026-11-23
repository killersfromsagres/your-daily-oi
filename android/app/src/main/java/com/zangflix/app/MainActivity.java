package com.zangflix.app;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.res.Configuration;
import android.media.AudioManager;
import android.view.KeyEvent;
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
import android.webkit.WebSettings;

public final class MainActivity extends Activity {
  private WebView web;
  private boolean tvEdition;
  private static final String TV_RUNTIME_VERSION = "2.7.0";
  private View customView;
  private int previousOrientation;
  private int previousSystemUi;
  private int previousWindowFlags;
  private WebChromeClient.CustomViewCallback customCallback;
  private static final String HOME = "https://zangflix.lovable.app/";
  private static final String TV_HOME = "https://zangflix.lovable.app/tv-home?zf-tv-app=androidtv&tvVersion=270";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    UiModeManager mode=(UiModeManager)getSystemService(UI_MODE_SERVICE);
    boolean television=BuildConfig.TV_EDITION || (mode!=null && mode.getCurrentModeType()==Configuration.UI_MODE_TYPE_TELEVISION);
    setVolumeControlStream(AudioManager.STREAM_MUSIC);
    tvEdition=television;
    if(television){
      setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
      // Immersive system chrome is only enabled for the television flavor.
      // CSS theater mode can now use the TV's entire physical display area.
      getWindow().getDecorView().setSystemUiVisibility(
          View.SYSTEM_UI_FLAG_FULLSCREEN
          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
          | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
          | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
          | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
          | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    web = new WebView(this);
    web.setFocusable(true);web.setFocusableInTouchMode(true);web.requestFocus();
    web.setBackgroundColor(0xff090a10);
    web.getSettings().setJavaScriptEnabled(true);
    // Clear cached HTML only when the TV APK upgrades. Keep viewing progress.
    if(television && !TV_RUNTIME_VERSION.equals(getPreferences(0).getString("tvRuntimeCacheVersion",""))){
      web.clearCache(true);
      getPreferences(0).edit().putString("tvRuntimeCacheVersion",TV_RUNTIME_VERSION).apply();
    }
    web.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
    web.getSettings().setSupportZoom(false);
    web.getSettings().setBuiltInZoomControls(false);
    web.getSettings().setLoadWithOverviewMode(true);
    web.getSettings().setUseWideViewPort(true);
    // Identify the actual installed Android APK, not a Chrome PWA shortcut.
    web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " ZangFlixAndroid/2.0" + (television?" ZangFlixTV/2.7":""));
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setMediaPlaybackRequiresUserGesture(false);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.setWebViewClient(new WebViewClient() {
      @Override public void onPageFinished(WebView view,String url){
        super.onPageFinished(view,url);
        if(tvEdition && url!=null && url.startsWith("https://zangflix.lovable.app/")){
          view.postDelayed(()->checkPublishedTvVersion(view),7000);
        }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if ("https".equals(uri.getScheme()) && "zangflix.lovable.app".equals(uri.getHost())) return false;
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
    web.loadUrl(television ? TV_HOME : HOME);
  }
  /** The APK is a WebView shell and does not contain the hosted web bundles. */
  private void checkPublishedTvVersion(WebView view){
    if(web!=view || isFinishing())return;
    String js="(function(){"
      +"var ok=document.querySelector('[data-tv-build=\\\"2.7.0\\\"]');"
      +"if(ok){var old=document.getElementById('zf-host-version-warning');if(old)old.remove();return 'ready';}"
      +"if(!document.body)return 'no-body';"
      +"if(document.getElementById('zf-host-version-warning'))return 'already';"
      +"var w=document.createElement('div');w.id='zf-host-version-warning';"
      +"w.textContent='ATENÇÃO: esta TV está abrindo uma versão antiga do site. Publique a atualização 2.7.0 no Lovable para acessar o catálogo completo e o novo player de TV.';"
      +"w.style.cssText='position:fixed;z-index:2147483647;left:8%;right:8%;bottom:3%;padding:16px 20px;border-radius:12px;background:#251a32;color:#fff;border:2px solid #cfb1ff;font:600 16px system-ui;line-height:1.4;box-shadow:0 10px 30px #0009';"
      +"document.body.appendChild(w);return 'old';"
      +"})()";
    try{view.evaluateJavascript(js,null);}catch(Exception ignored){}
  }
  @Override public void onBackPressed() {
    if (customView != null) { web.getWebChromeClient().onHideCustomView(); return; }
    if(web==null){super.onBackPressed();return;}
    // Let the visible dialog/player consume Back before leaving its page.
    web.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'BrowserBack',bubbles:true,cancelable:true}))", result -> {
      if("false".equals(result))return;
      if(web!=null && web.canGoBack())web.goBack();else finish();
    });
  }
  @Override public boolean dispatchKeyEvent(KeyEvent event){
    String key=null;
    if(event.getKeyCode()==KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)key="MediaPlayPause";
    else if(event.getKeyCode()==KeyEvent.KEYCODE_MEDIA_PLAY)key="MediaPlay";
    else if(event.getKeyCode()==KeyEvent.KEYCODE_MEDIA_PAUSE || event.getKeyCode()==KeyEvent.KEYCODE_MEDIA_STOP)key="MediaPause";
    if(key!=null && web!=null){
      if(event.getAction()==KeyEvent.ACTION_DOWN && event.getRepeatCount()==0)
        web.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'"+key+"',bubbles:true,cancelable:true}))",null);
      return true;
    }
    return super.dispatchKeyEvent(event);
  }
  @Override protected void onPause(){
    if(web!=null){web.evaluateJavascript("document.querySelectorAll('video').forEach(v=>v.pause())",null);web.onPause();}
    super.onPause();
  }
  @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
  @Override protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}
