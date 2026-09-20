package com.htmlapk.builder;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final String TAG = "HTML_APK";
    private static final int PERMISSION_REQUEST_CODE = 2001;
    private static final int FILE_CHOOSER_REQUEST_CODE = 3001;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private WebViewAssetLoader assetLoader;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            startApplication();
        } catch (Throwable error) {
            showFatalError(error);
        }
    }

    private void startApplication() {

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);

        if (webView == null) {
            throw new IllegalStateException(
                    "WebView not found in activity_main.xml"
            );
        }

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler(
                        "/assets/",
                        new WebViewAssetLoader.AssetsPathHandler(this)
                )
                .build();

        configureWebView();

        requestRequiredPermissions();

        webView.loadUrl(
                "https://appassets.androidplatform.net/assets/index.html"
        );
    }

    private void configureWebView() {

        WebSettings settings = webView.getSettings();

        /*
         * IMPORTANT:
         * Full JavaScript support for the HTML application.
         */
        settings.setJavaScriptEnabled(true);

        /*
         * localStorage / DOM storage.
         */
        settings.setDomStorageEnabled(true);

        settings.setDatabaseEnabled(true);

        /*
         * Allow HTML file inputs and content URIs.
         */
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        /*
         * JavaScript window support.
         */
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        settings.setSupportMultipleWindows(false);

        /*
         * Required for audio/video features.
         */
        settings.setMediaPlaybackRequiresUserGesture(false);

        /*
         * Normal mobile layout.
         */
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);

        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);

        /*
         * Cache/network support.
         */
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        /*
         * HTTPS page may access HTTPS/HTTP resources.
         */
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            settings.setMixedContentMode(
                    WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            );
        }

        /*
         * Cookies for Firebase/web services.
         */
        CookieManager cookieManager =
                CookieManager.getInstance();

        cookieManager.setAcceptCookie(true);

        if (android.os.Build.VERSION.SDK_INT >= 21) {
            cookieManager.setAcceptThirdPartyCookies(
                    webView,
                    true
            );
        }

        /*
         * WebViewClient
         */
        webView.setWebViewClient(
                new WebViewClient() {

                    @Override
                    public WebResourceResponse shouldInterceptRequest(
                            WebView view,
                            WebResourceRequest request
                    ) {

                        try {

                            WebResourceResponse response =
                                    assetLoader.shouldInterceptRequest(
                                            request.getUrl()
                                    );

                            if (response != null) {
                                return response;
                            }

                        } catch (Throwable error) {

                            Log.e(
                                    TAG,
                                    "Asset request error",
                                    error
                            );
                        }

                        return super.shouldInterceptRequest(
                                view,
                                request
                        );
                    }

                    @Override
                    public WebResourceResponse shouldInterceptRequest(
                            WebView view,
                            String url
                    ) {

                        try {

                            WebResourceResponse response =
                                    assetLoader.shouldInterceptRequest(
                                            Uri.parse(url)
                                    );

                            if (response != null) {
                                return response;
                            }

                        } catch (Throwable error) {

                            Log.e(
                                    TAG,
                                    "Asset URL error",
                                    error
                            );
                        }

                        return super.shouldInterceptRequest(
                                view,
                                url
                        );
                    }

                    @Override
                    public void onPageStarted(
                            WebView view,
                            String url,
                            Bitmap favicon
                    ) {

                        Log.d(
                                TAG,
                                "PAGE STARTED: " + url
                        );

                        super.onPageStarted(
                                view,
                                url,
                                favicon
                        );
                    }

                    @Override
                    public void onPageFinished(
                            WebView view,
                            String url
                    ) {

                        super.onPageFinished(
                                view,
                                url
                        );

                        Log.d(
                                TAG,
                                "PAGE FINISHED: " + url
                        );

                        /*
                         * Verify JavaScript after page load.
                         */
                        try {

                            view.evaluateJavascript(
                                    "(function(){" +
                                            "try{" +
                                            "return JSON.stringify({" +
                                            "url:location.href," +
                                            "protocol:location.protocol," +
                                            "secure:window.isSecureContext," +
                                            "js:true," +
                                            "firebase:(typeof firebase !== 'undefined')" +
                                            "});" +
                                            "}catch(e){" +
                                            "return 'JS_TEST_ERROR:'+e.message;" +
                                            "}" +
                                            "})();",

                                    value -> Log.d(
                                            TAG,
                                            "JS TEST = " + value
                                    )
                            );

                        } catch (Throwable error) {

                            Log.e(
                                    TAG,
                                    "evaluateJavascript failed",
                                    error
                            );
                        }
                    }

                    @Override
                    public void onReceivedError(
                            WebView view,
                            WebResourceRequest request,
                            WebResourceError error
                    ) {

                        super.onReceivedError(
                                view,
                                request,
                                error
                        );

                        try {

                            String description =
                                    error != null
                                            ? String.valueOf(
                                                    error.getDescription()
                                            )
                                            : "Unknown";

                            String url =
                                    request != null
                                            ? String.valueOf(
                                                    request.getUrl()
                                            )
                                            : "Unknown";

                            Log.e(
                                    TAG,
                                    "WEB ERROR: "
                                            + description
                                            + " URL="
                                            + url
                            );

                        } catch (Throwable ignored) {
                        }
                    }
                }
        );

        /*
         * WebChromeClient
         *
         * Handles:
         * JavaScript console
         * permissions
         * file chooser
         */
        webView.setWebChromeClient(
                new WebChromeClient() {

                    @Override
                    public boolean onConsoleMessage(
                            ConsoleMessage consoleMessage
                    ) {

                        if (consoleMessage != null) {

                            String message =
                                    "JS "
                                    + consoleMessage.messageLevel()
                                    + ": "
                                    + consoleMessage.message()
                                    + " | LINE "
                                    + consoleMessage.lineNumber()
                                    + " | "
                                    + consoleMessage.sourceId();

                            Log.e(
                                    TAG,
                                    message
                            );

                            /*
                             * If JavaScript has an actual error,
                             * show it briefly on screen too.
                             */
                            if (
                                    consoleMessage.messageLevel()
                                            == ConsoleMessage.MessageLevel.ERROR
                            ) {

                                runOnUiThread(
                                        () -> Toast.makeText(
                                                MainActivity.this,
                                                "JavaScript Error:\n"
                                                        + consoleMessage.message()
                                                        + "\nLine: "
                                                        + consoleMessage.lineNumber(),
                                                Toast.LENGTH_LONG
                                        ).show()
                                );
                            }
                        }

                        return true;
                    }

                    @Override
                    public void onPermissionRequest(
                            final PermissionRequest request
                    ) {

                        if (request == null) {
                            return;
                        }

                        runOnUiThread(
                                () -> handleWebPermissionRequest(
                                        request
                                )
                        );
                    }

                    @Override
                    public boolean onShowFileChooser(
                            WebView webView,
                            ValueCallback<Uri[]> callback,
                            FileChooserParams fileChooserParams
                    ) {

                        try {

                            if (filePathCallback != null) {

                                filePathCallback.onReceiveValue(
                                        null
                                );
                            }

                            filePathCallback = callback;

                            Intent intent;

                            try {

                                intent =
                                        fileChooserParams.createIntent();

                            } catch (Throwable error) {

                                intent =
                                        new Intent(
                                                Intent.ACTION_GET_CONTENT
                                        );

                                intent.addCategory(
                                        Intent.CATEGORY_OPENABLE
                                );

                                intent.setType("*/*");
                            }

                            try {

                                startActivityForResult(
                                        intent,
                                        FILE_CHOOSER_REQUEST_CODE
                                );

                                return true;

                            } catch (
                                    ActivityNotFoundException error
                            ) {

                                if (
                                        filePathCallback != null
                                ) {

                                    filePathCallback.onReceiveValue(
                                            null
                                    );

                                    filePathCallback = null;
                                }

                                return false;
                            }

                        } catch (Throwable error) {

                            Log.e(
                                    TAG,
                                    "File chooser error",
                                    error
                            );

                            if (
                                    filePathCallback != null
                            ) {

                                filePathCallback.onReceiveValue(
                                        null
                                );

                                filePathCallback = null;
                            }

                            return false;
                        }
                    }
                }
        );

        /*
         * WebView debugging.
         * Useful while testing APK.
         */
        if (
                android.os.Build.VERSION.SDK_INT >=
                        android.os.Build.VERSION_CODES.KITKAT
        ) {

            WebView.setWebContentsDebuggingEnabled(
                    true
            );
        }
    }

    private void handleWebPermissionRequest(
            PermissionRequest request
    ) {

        try {

            List<String> allowedResources =
                    new ArrayList<>();

            ArrayList<String> androidPermissions =
                    new ArrayList<>();

            for (
                    String resource :
                    request.getResources()
            ) {

                if (
                        PermissionRequest
                                .RESOURCE_AUDIO_CAPTURE
                                .equals(resource)
                ) {

                    if (
                            ContextCompat.checkSelfPermission(
                                    this,
                                    Manifest.permission.RECORD_AUDIO
                            )
                                    ==
                            PackageManager.PERMISSION_GRANTED
                    ) {

                        allowedResources.add(
                                PermissionRequest
                                        .RESOURCE_AUDIO_CAPTURE
                        );

                    } else {

                        androidPermissions.add(
                                Manifest.permission.RECORD_AUDIO
                        );
                    }
                }

                if (
                        PermissionRequest
                                .RESOURCE_VIDEO_CAPTURE
                                .equals(resource)
                ) {

                    if (
                            ContextCompat.checkSelfPermission(
                                    this,
                                    Manifest.permission.CAMERA
                            )
                                    ==
                            PackageManager.PERMISSION_GRANTED
                    ) {

                        allowedResources.add(
                                PermissionRequest
                                        .RESOURCE_VIDEO_CAPTURE
                        );

                    } else {

                        androidPermissions.add(
                                Manifest.permission.CAMERA
                        );
                    }
                }
            }

            if (!allowedResources.isEmpty()) {

                request.grant(
                        allowedResources.toArray(
                                new String[0]
                        )
                );

            } else {

                request.deny();
            }

            if (!androidPermissions.isEmpty()) {

                ActivityCompat.requestPermissions(
                        this,
                        androidPermissions.toArray(
                                new String[0]
                        ),
                        PERMISSION_REQUEST_CODE
                );
            }

        } catch (Throwable error) {

            Log.e(
                    TAG,
                    "Web permission error",
                    error
            );

            try {
                request.deny();
            } catch (Throwable ignored) {
            }
        }
    }

    private void requestRequiredPermissions() {

        try {

            ArrayList<String> permissions =
                    new ArrayList<>();

            if (
                    ContextCompat.checkSelfPermission(
                            this,
                            Manifest.permission.CAMERA
                    )
                            !=
                    PackageManager.PERMISSION_GRANTED
            ) {

                permissions.add(
                        Manifest.permission.CAMERA
                );
            }

            if (
                    ContextCompat.checkSelfPermission(
                            this,
                            Manifest.permission.RECORD_AUDIO
                    )
                            !=
                    PackageManager.PERMISSION_GRANTED
            ) {

                permissions.add(
                        Manifest.permission.RECORD_AUDIO
                );
            }

            if (!permissions.isEmpty()) {

                ActivityCompat.requestPermissions(
                        this,
                        permissions.toArray(
                                new String[0]
                        ),
                        PERMISSION_REQUEST_CODE
                );
            }

        } catch (Throwable error) {

            Log.e(
                    TAG,
                    "Android permission error",
                    error
            );
        }
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            @Nullable Intent data
    ) {

        super.onActivityResult(
                requestCode,
                resultCode,
                data
        );

        if (
                requestCode !=
                        FILE_CHOOSER_REQUEST_CODE
        ) {

            return;
        }

        Uri[] results = null;

        try {

            if (
                    resultCode == Activity.RESULT_OK
                            &&
                    data != null
            ) {

                if (data.getData() != null) {

                    results =
                            new Uri[]{
                                    data.getData()
                            };

                } else if (
                        data.getClipData() != null
                ) {

                    int count =
                            data.getClipData()
                                    .getItemCount();

                    results =
                            new Uri[count];

                    for (
                            int i = 0;
                            i < count;
                            i++
                    ) {

                        results[i] =
                                data.getClipData()
                                        .getItemAt(i)
                                        .getUri();
                    }
                }
            }

        } catch (Throwable error) {

            Log.e(
                    TAG,
                    "File result error",
                    error
            );
        }

        if (filePathCallback != null) {

            filePathCallback.onReceiveValue(
                    results
            );

            filePathCallback = null;
        }
    }

    private void showFatalError(
            Throwable error
    ) {

        try {

            TextView errorView =
                    new TextView(this);

            errorView.setPadding(
                    30,
                    50,
                    30,
                    50
            );

            errorView.setTextSize(15);

            errorView.setTextIsSelectable(
                    true
            );

            StringWriter writer =
                    new StringWriter();

            PrintWriter printer =
                    new PrintWriter(
                            writer
                    );

            error.printStackTrace(
                    printer
            );

            String errorText =
                    "HTML APK STARTUP ERROR\n\n"
                            +
                    "ERROR TYPE:\n"
                            +
                    error.getClass().getName()
                            +
                    "\n\nMESSAGE:\n"
                            +
                    String.valueOf(
                            error.getMessage()
                    )
                            +
                    "\n\nSTACK TRACE:\n"
                            +
                    writer.toString();

            errorView.setText(
                    errorText
            );

            setContentView(
                    errorView
            );

        } catch (Throwable ignored) {

            finish();
        }
    }

    @Override
    public void onBackPressed() {

        try {

            if (
                    webView != null
                            &&
                    webView.canGoBack()
            ) {

                webView.goBack();

                return;
            }

        } catch (Throwable ignored) {
        }

        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {

        try {

            if (webView != null) {

                webView.stopLoading();

                webView.loadUrl(
                        "about:blank"
                );

                webView.clearHistory();

                webView.setWebChromeClient(
                        null
                );

                webView.setWebViewClient(
                        null
                );

                webView.destroy();

                webView = null;
            }

        } catch (Throwable ignored) {
        }

        super.onDestroy();
    }
}
