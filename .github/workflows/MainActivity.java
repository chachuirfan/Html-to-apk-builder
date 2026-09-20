package com.htmlapk.builder;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final int PERMISSION_REQUEST_CODE = 2001;
    private static final int FILE_CHOOSER_REQUEST_CODE = 3001;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private WebViewAssetLoader assetLoader;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try { startApplication(); }
        catch (Throwable error) { showFatalError(error); }
    }

    private void startApplication() {
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webView);
        if (webView == null) throw new IllegalStateException("WebView not found in activity_main.xml");

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        if (android.os.Build.VERSION.SDK_INT >= 21) settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (android.os.Build.VERSION.SDK_INT >= 21) cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    WebResourceResponse r = assetLoader.shouldInterceptRequest(request.getUrl());
                    if (r != null) return r;
                } catch (Throwable ignored) {}
                return super.shouldInterceptRequest(view, request);
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                try {
                    WebResourceResponse r = assetLoader.shouldInterceptRequest(Uri.parse(url));
                    if (r != null) return r;
                } catch (Throwable ignored) {}
                return super.shouldInterceptRequest(view, url);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest request) {
                if (request == null) return;
                runOnUiThread(() -> {
                    try {
                        List<String> allowed = new ArrayList<>();
                        ArrayList<String> needed = new ArrayList<>();
                        for (String resource : request.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                                    allowed.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                                else needed.add(Manifest.permission.RECORD_AUDIO);
                            }
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
                                    allowed.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                                else needed.add(Manifest.permission.CAMERA);
                            }
                        }
                        if (!allowed.isEmpty()) request.grant(allowed.toArray(new String[0]));
                        else {
                            request.deny();
                            if (!needed.isEmpty()) ActivityCompat.requestPermissions(MainActivity.this, needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
                        }
                    } catch (Throwable e) { try { request.deny(); } catch (Throwable ignored) {} }
                });
            }

            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                try {
                    if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                    filePathCallback = callback;
                    Intent intent;
                    try { intent = params.createIntent(); }
                    catch (Throwable e) {
                        intent = new Intent(Intent.ACTION_GET_CONTENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType("*/*");
                    }
                    try { startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE); return true; }
                    catch (ActivityNotFoundException e) {
                        if (filePathCallback != null) { filePathCallback.onReceiveValue(null); filePathCallback = null; }
                        return false;
                    }
                } catch (Throwable e) { return false; }
            }
        });

        requestRequiredPermissions();
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private void requestRequiredPermissions() {
        try {
            ArrayList<String> p = new ArrayList<>();
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.CAMERA);
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.RECORD_AUDIO);
            if (!p.isEmpty()) ActivityCompat.requestPermissions(this, p.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        } catch (Throwable ignored) {}
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST_CODE) return;
        Uri[] results = null;
        try {
            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getData() != null) results = new Uri[]{data.getData()};
                else if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i=0; i<count; i++) results[i] = data.getClipData().getItemAt(i).getUri();
                }
            }
        } catch (Throwable ignored) {}
        if (filePathCallback != null) { filePathCallback.onReceiveValue(results); filePathCallback = null; }
    }

    private void showFatalError(Throwable error) {
        try {
            TextView v = new TextView(this);
            v.setPadding(30,50,30,50);
            v.setTextSize(15);
            v.setTextIsSelectable(true);
            StringWriter w = new StringWriter();
            error.printStackTrace(new PrintWriter(w));
            v.setText("HTML APK STARTUP ERROR\n\n" + error.getClass().getName() + "\n\n" + String.valueOf(error.getMessage()) + "\n\n" + w);
            setContentView(v);
        } catch (Throwable ignored) { finish(); }
    }

    @Override public void onBackPressed() {
        try { if (webView != null && webView.canGoBack()) { webView.goBack(); return; } }
        catch (Throwable ignored) {}
        super.onBackPressed();
    }

    @Override protected void onDestroy() {
        try {
            if (webView != null) {
                webView.stopLoading();
                webView.loadUrl("about:blank");
                webView.setWebChromeClient(null);
                webView.setWebViewClient(null);
                webView.destroy();
                webView = null;
            }
        } catch (Throwable ignored) {}
        super.onDestroy();
    }
}
