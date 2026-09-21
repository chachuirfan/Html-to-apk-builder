package com.htmlapk.builder;  
  
import android.Manifest;  
import android.app.Activity;  
import android.content.ActivityNotFoundException;  
import android.content.Intent;  
import android.content.pm.PackageManager;  
import android.net.Uri;  
import android.os.Bundle;  
import android.util.Log;  
import android.webkit.ConsoleMessage;  
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
import android.widget.Toast;  
  
import androidx.annotation.Nullable;  
import androidx.core.app.ActivityCompat;  
import androidx.core.content.ContextCompat;  
import androidx.webkit.WebViewAssetLoader;  
  
import java.io.PrintWriter;  
import java.io.StringWriter;  
import java.util.ArrayList;  
  
public class MainActivity extends Activity {  
  
    private static final String TAG = "HTML_APK";  
    private static final int PERMISSION_REQUEST_CODE = 2001;  
    private static final int FILE_CHOOSER_REQUEST_CODE = 3001;  
  
    private WebView webView;  
    private ValueCallback<Uri[]> filePathCallback;  
    private WebViewAssetLoader assetLoader;  
    private PermissionRequest pendingWebPermissionRequest;  
  
    @Override  
    protected void onCreate(Bundle savedInstanceState) {  
        super.onCreate(savedInstanceState);  
  
        try {  
            setContentView(R.layout.activity_main);  
  
            webView = findViewById(R.id.webView);  
  
            if (webView == null) {  
                throw new IllegalStateException("WebView missing");  
            }  
  
            WebView.setWebContentsDebuggingEnabled(true);  
  
            assetLoader =  
                    new WebViewAssetLoader.Builder()  
                            .addPathHandler(  
                                    "/assets/",  
                                    new WebViewAssetLoader.AssetsPathHandler(this)  
                            )  
                            .build();  
  
            configureWebView();  
  
             
  
            webView.loadUrl(  
                    "https://appassets.androidplatform.net/assets/index.html"  
            );  
  
        } catch (Throwable error) {  
  
            showFatalError(error);  
        }  
    }  
  
    private void configureWebView() {  
  
        WebSettings settings = webView.getSettings();  
  
        settings.setJavaScriptEnabled(true);  
        settings.setDomStorageEnabled(true);  
        settings.setDatabaseEnabled(true);  
  
        settings.setAllowFileAccess(true);  
        settings.setAllowContentAccess(true);  
  
        settings.setJavaScriptCanOpenWindowsAutomatically(true);  
        settings.setSupportMultipleWindows(false);  
  
        settings.setMediaPlaybackRequiresUserGesture(false);  
  
        settings.setUseWideViewPort(true);  
        settings.setLoadWithOverviewMode(false);  
  
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);  
  
        if (android.os.Build.VERSION.SDK_INT >= 21) {  
  
            settings.setMixedContentMode(  
                    WebSettings.MIXED_CONTENT_ALWAYS_ALLOW  
            );  
        }  
  
        CookieManager cookieManager =  
                CookieManager.getInstance();  
  
        cookieManager.setAcceptCookie(true);  
  
        if (android.os.Build.VERSION.SDK_INT >= 21) {  
  
            cookieManager.setAcceptThirdPartyCookies(  
                    webView,  
                    true  
            );  
        }  
  
        webView.setWebViewClient(  
                new WebViewClient() {  
  
                    @Override  
                    public WebResourceResponse shouldInterceptRequest(  
                            WebView view,  
                            WebResourceRequest request  
                    ) {  
  
                        WebResourceResponse response =  
                                assetLoader.shouldInterceptRequest(  
                                        request.getUrl()  
                                );  
  
                        if (response != null) {  
                            return response;  
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
  
                        WebResourceResponse response =  
                                assetLoader.shouldInterceptRequest(  
                                        Uri.parse(url)  
                                );  
  
                        if (response != null) {  
                            return response;  
                        }  
  
                        return super.shouldInterceptRequest(  
                                view,  
                                url  
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
  
                        String probe =  
                                "(function(){" +  
                                "var missing=[];" +  
  
                                "['populateDropdowns'," +  
                                "'triggerFileInput'," +  
                                "'checkScorerAuthBeforeAction'," +  
                                "'openSavedMatches'," +  
                                "'openPlayerStatsModal'," +  
                                "'openTeamLeaderboardModal'," +  
                                "'openGetLiveScoreModal'," +  
                                "'unlockScorerMode'," +  
                                "'loginAdminInline']" +  
  
                                ".forEach(function(n){" +  
                                "if(typeof window[n]!=='function')" +  
                                "missing.push(n);" +  
                                "});" +  
  
                                "return JSON.stringify({" +  
                                "ready:missing.length===0," +  
                                "missing:missing," +  
                                "href:location.href," +  
                                "secure:isSecureContext" +  
                                "});" +  
  
                                "})()";  
  
                        view.evaluateJavascript(  
                                probe,  
                                value -> {  
  
                                    Log.e(  
                                            TAG,  
                                            "HTML_JS_PROBE=" + value  
                                    );  
  
                                    if (  
                                            value != null &&  
                                            value.contains(  
                                                    "\\\"ready\\\":false"  
                                            )  
                                    ) {  
  
                                        Toast.makeText(  
                                                MainActivity.this,  
                                                "HTML JavaScript did not initialize.",  
                                                Toast.LENGTH_LONG  
                                        ).show();  
                                    }  
                                }  
                        );  
                    }  
                }  
        );  
  
        webView.setWebChromeClient(  
                new WebChromeClient() {  
  
                    @Override  
                    public boolean onConsoleMessage(  
                            ConsoleMessage consoleMessage  
                    ) {  
  
                        if (consoleMessage != null) {  
  
                            Log.e(  
                                    TAG,  
                                    "JS "  
                                            + consoleMessage.messageLevel()  
                                            + ": "  
                                            + consoleMessage.message()  
                                            + " | line "  
                                            + consoleMessage.lineNumber()  
                                            + " | "  
                                            + consoleMessage.sourceId()  
                            );  
                        }  
  
                        return true;  
                    }  
  
                    @Override  
                    public void onPermissionRequest(  
                            PermissionRequest request  
                    ) {  
  
                        if (request == null) {  
                            return;  
                        }  
  
                        runOnUiThread(  
                                () -> grantOrRequestWebPermissions(  
                                        request  
                                )  
                        );  
                    }  
  
                    @Override  
                    public boolean onShowFileChooser(  
                            WebView view,  
                            ValueCallback<Uri[]> callback,  
                            FileChooserParams params  
                    ) {  
  
                        if (filePathCallback != null) {  
  
                            filePathCallback.onReceiveValue(  
                                    null  
                            );  
                        }  
  
                        filePathCallback = callback;  
  
                        try {  
  
                            Intent intent =  
                                    params.createIntent();  
  
                            startActivityForResult(  
                                    intent,  
                                    FILE_CHOOSER_REQUEST_CODE  
                            );  
  
                            return true;  
  
                        } catch (Throwable firstError) {  
  
                            try {  
  
                                Intent intent =  
                                        new Intent(  
                                                Intent.ACTION_GET_CONTENT  
                                        );  
  
                                intent.addCategory(  
                                        Intent.CATEGORY_OPENABLE  
                                );  
  
                                intent.setType("*/*");  
  
                                startActivityForResult(  
                                        intent,  
                                        FILE_CHOOSER_REQUEST_CODE  
                                );  
  
                                return true;  
  
                            } catch (  
                                    ActivityNotFoundException secondError  
                            ) {  
  
                                if (filePathCallback != null) {  
  
                                    filePathCallback.onReceiveValue(  
                                            null  
                                    );  
  
                                    filePathCallback = null;  
                                }  
  
                                return false;  
                            }  
                        }  
                    }  
                }  
        );  
    }  
  
    private void grantOrRequestWebPermissions(  
            PermissionRequest request  
    ) {  
  
        ArrayList<String> permissions =  
                new ArrayList<>();  
  
        boolean audioRequested = false;  
        boolean videoRequested = false;  
  
        for (  
                String resource :  
                request.getResources()  
        ) {  
  
            if (  
                    PermissionRequest  
                            .RESOURCE_AUDIO_CAPTURE  
                            .equals(resource)  
            ) {  
  
                audioRequested = true;  
            }  
  
            if (  
                    PermissionRequest  
                            .RESOURCE_VIDEO_CAPTURE  
                            .equals(resource)  
            ) {  
  
                videoRequested = true;  
            }  
        }  
  
        if (  
                audioRequested &&  
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
  
        if (  
                videoRequested &&  
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
  
        if (permissions.isEmpty()) {  
  
            request.grant(  
                    request.getResources()  
            );  
  
        } else {  
  
            pendingWebPermissionRequest =  
                    request;  
  
            ActivityCompat.requestPermissions(  
                    this,  
                    permissions.toArray(  
                            new String[0]  
                    ),  
                    PERMISSION_REQUEST_CODE  
            );  
        }  
    }  
  
    private void requestRequiredPermissions() {  
  
        ArrayList<String> permissions =  
                new ArrayList<>();  
  
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
  
        if (!permissions.isEmpty()) {  
  
            ActivityCompat.requestPermissions(  
                    this,  
                    permissions.toArray(  
                            new String[0]  
                    ),  
                    PERMISSION_REQUEST_CODE  
            );  
        }  
    }  
  
    @Override  
    public void onRequestPermissionsResult(  
            int requestCode,  
            String[] permissions,  
            int[] grantResults  
    ) {  
  
        super.onRequestPermissionsResult(  
                requestCode,  
                permissions,  
                grantResults  
        );  
  
        if (  
                requestCode !=  
                PERMISSION_REQUEST_CODE  
        ) {  
  
            return;  
        }  
  
        if (  
                pendingWebPermissionRequest != null  
        ) {  
  
            boolean allGranted = true;  
  
            for (  
                    int result :  
                    grantResults  
            ) {  
  
                if (  
                        result !=  
                        PackageManager.PERMISSION_GRANTED  
                ) {  
  
                    allGranted = false;  
  
                    break;  
                }  
            }  
  
            try {  
  
                if (allGranted) {  
  
                    pendingWebPermissionRequest.grant(  
                            pendingWebPermissionRequest  
                                    .getResources()  
                    );  
  
                } else {  
  
                    pendingWebPermissionRequest.deny();  
                }  
  
            } catch (Throwable ignored) {  
            }  
  
            pendingWebPermissionRequest =  
                    null;  
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
  
        if (  
                resultCode ==  
                Activity.RESULT_OK  
                &&  
                data != null  
        ) {  
  
            if (  
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
  
            } else if (  
                    data.getData() != null  
            ) {  
  
                results =  
                        new Uri[]{  
                                data.getData()  
                        };  
            }  
        }  
  
        if (  
                filePathCallback != null  
        ) {  
  
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
  
            error.printStackTrace(  
                    new PrintWriter(  
                            writer  
                    )  
            );  
  
            errorView.setText(  
                    "HTML APK STARTUP ERROR\n\n"  
                            +  
                    error  
                            +  
                    "\n\n"  
                            +  
                    writer  
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
  
        if (  
                webView != null &&  
                webView.canGoBack()  
        ) {  
  
            webView.goBack();  
  
        } else {  
  
            super.onBackPressed();  
        }  
    }  
  
    @Override  
    protected void onDestroy() {  
  
        if (webView != null) {  
  
            try {  
  
                webView.stopLoading();  
  
                webView.loadUrl(  
                        "about:blank"  
                );  
  
                webView.destroy();  
  
            } catch (Throwable ignored) {  
            }  
  
            webView = null;  
        }  
  
        super.onDestroy();  
    }  
}  
