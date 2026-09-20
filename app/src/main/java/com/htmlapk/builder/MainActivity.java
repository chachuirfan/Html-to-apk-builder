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


        /*
         * ---------------------------------------------------------
         * LOCAL HTTPS ASSET LOADER
         * ---------------------------------------------------------
         *
         * Instead of:
         *
         * file:///android_asset/index.html
         *
         * the HTML application is loaded through:
         *
         * https://appassets.androidplatform.net/assets/index.html
         *
         * This gives the local HTML a secure HTTPS-style origin.
         * ---------------------------------------------------------
         */

        assetLoader =
            new WebViewAssetLoader.Builder()
                .addPathHandler(
                    "/assets/",
                    new WebViewAssetLoader.AssetsPathHandler(this)
                )
                .build();


        /*
         * ---------------------------------------------------------
         * WEBVIEW SETTINGS
         * ---------------------------------------------------------
         */

        WebSettings settings = webView.getSettings();


        settings.setJavaScriptEnabled(true);

        settings.setDomStorageEnabled(true);

        settings.setDatabaseEnabled(true);

        settings.setAllowFileAccess(true);

        settings.setAllowContentAccess(true);

        settings.setJavaScriptCanOpenWindowsAutomatically(true);


        /*
         * Keep new windows/popups inside the same WebView.
         *
         * We deliberately do not enable multiple WebView windows
         * because websites using window.open() can otherwise require
         * a separate onCreateWindow implementation.
         */

        settings.setSupportMultipleWindows(false);


        /*
         * Allow HTML audio/video playback.
         */

        settings.setMediaPlaybackRequiresUserGesture(false);


        /*
         * Display settings
         */

        settings.setBuiltInZoomControls(false);

        settings.setDisplayZoomControls(false);

        settings.setSupportZoom(false);

        settings.setLoadWithOverviewMode(false);

        settings.setUseWideViewPort(true);


        /*
         * ---------------------------------------------------------
         * MIXED CONTENT
         * ---------------------------------------------------------
         */

        if (android.os.Build.VERSION.SDK_INT >= 21) {

            settings.setMixedContentMode(
                WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            );
        }


        /*
         * ---------------------------------------------------------
         * COOKIES
         * ---------------------------------------------------------
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
         * ---------------------------------------------------------
         * WEBVIEW CLIENT
         * ---------------------------------------------------------
         *
         * Local app files are intercepted by WebViewAssetLoader.
         * Internet requests such as Firebase are allowed to continue
         * normally.
         * ---------------------------------------------------------
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

                    } catch (Throwable ignored) {

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

                    } catch (Throwable ignored) {

                    }


                    return super.shouldInterceptRequest(
                        view,
                        url
                    );
                }
            }
        );


        /*
         * ---------------------------------------------------------
         * WEB CHROME CLIENT
         * ---------------------------------------------------------
         *
         * Handles:
         *
         * microphone
         * camera
         * HTML file chooser
         *
         * ---------------------------------------------------------
         */

        webView.setWebChromeClient(

            new WebChromeClient() {


                /*
                 * -------------------------------------------------
                 * WEB PERMISSION REQUEST
                 * -------------------------------------------------
                 */

                @Override
                public void onPermissionRequest(
                    final PermissionRequest request
                ) {


                    if (request == null) {

                        return;
                    }


                    runOnUiThread(() -> {


                        try {


                            List<String> allowed =
                                new ArrayList<>();


                            ArrayList<String> androidPermissions =
                                new ArrayList<>();


                            for (
                                String resource :
                                request.getResources()
                            ) {


                                /*
                                 * MICROPHONE
                                 */

                                if (
                                    PermissionRequest
                                        .RESOURCE_AUDIO_CAPTURE
                                        .equals(resource)
                                ) {


                                    if (
                                        ContextCompat
                                            .checkSelfPermission(
                                                MainActivity.this,
                                                Manifest.permission.RECORD_AUDIO
                                            )
                                        ==
                                        PackageManager.PERMISSION_GRANTED
                                    ) {


                                        allowed.add(
                                            PermissionRequest
                                                .RESOURCE_AUDIO_CAPTURE
                                        );


                                    } else {


                                        if (
                                            !androidPermissions.contains(
                                                Manifest.permission.RECORD_AUDIO
                                            )
                                        ) {

                                            androidPermissions.add(
                                                Manifest.permission.RECORD_AUDIO
                                            );
                                        }
                                    }
                                }


                                /*
                                 * CAMERA
                                 */

                                if (
                                    PermissionRequest
                                        .RESOURCE_VIDEO_CAPTURE
                                        .equals(resource)
                                ) {


                                    if (
                                        ContextCompat
                                            .checkSelfPermission(
                                                MainActivity.this,
                                                Manifest.permission.CAMERA
                                            )
                                        ==
                                        PackageManager.PERMISSION_GRANTED
                                    ) {


                                        allowed.add(
                                            PermissionRequest
                                                .RESOURCE_VIDEO_CAPTURE
                                        );


                                    } else {


                                        if (
                                            !androidPermissions.contains(
                                                Manifest.permission.CAMERA
                                            )
                                        ) {

                                            androidPermissions.add(
                                                Manifest.permission.CAMERA
                                            );
                                        }
                                    }
                                }
                            }


                            /*
                             * Grant WebView permissions already
                             * approved by Android.
                             */

                            if (!allowed.isEmpty()) {


                                request.grant(
                                    allowed.toArray(
                                        new String[0]
                                    )
                                );


                            } else {


                                /*
                                 * WebView cannot wait forever while
                                 * Android permission dialog is open.
                                 *
                                 * Deny this request and request the
                                 * Android permission.
                                 *
                                 * When the user presses the HTML
                                 * microphone/camera button again,
                                 * WebView can then grant it.
                                 */

                                request.deny();


                                if (!androidPermissions.isEmpty()) {


                                    ActivityCompat.requestPermissions(
                                        MainActivity.this,
                                        androidPermissions.toArray(
                                            new String[0]
                                        ),
                                        PERMISSION_REQUEST_CODE
                                    );
                                }
                            }


                        } catch (Throwable error) {


                            try {

                                request.deny();

                            } catch (Throwable ignored) {

                            }
                        }
                    });
                }


                /*
                 * -------------------------------------------------
                 * FILE UPLOAD
                 * -------------------------------------------------
                 */

                @Override
                public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params
                ) {


                    try {


                        /*
                         * Cancel an old chooser if one is still open.
                         */

                        if (filePathCallback != null) {


                            filePathCallback.onReceiveValue(
                                null
                            );
                        }


                        filePathCallback = callback;


                        Intent intent;


                        try {


                            intent =
                                params.createIntent();


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


                            if (filePathCallback != null) {


                                filePathCallback.onReceiveValue(
                                    null
                                );


                                filePathCallback = null;
                            }


                            return false;
                        }


                    } catch (Throwable error) {


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
        );


        /*
         * ---------------------------------------------------------
         * REQUEST ANDROID CAMERA + MICROPHONE PERMISSIONS
         * ---------------------------------------------------------
         */

        requestRequiredPermissions();


        /*
         * ---------------------------------------------------------
         * LOAD HTML APPLICATION
         * ---------------------------------------------------------
         */

        webView.loadUrl(
            "https://appassets.androidplatform.net/assets/index.html"
        );
    }


    /*
     * =============================================================
     * ANDROID PERMISSIONS
     * =============================================================
     */

    private void requestRequiredPermissions() {


        try {


            ArrayList<String> permissions =
                new ArrayList<>();


            /*
             * Camera
             */

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


            /*
             * Microphone
             */

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


            /*
             * Show Android permission dialog.
             */

            if (!permissions.isEmpty()) {


                ActivityCompat.requestPermissions(
                    this,
                    permissions.toArray(
                        new String[0]
                    ),
                    PERMISSION_REQUEST_CODE
                );
            }


        } catch (Throwable ignored) {

        }
    }


    /*
     * =============================================================
     * FILE CHOOSER RESULT
     * =============================================================
     */

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


                /*
                 * Single selected file.
                 */

                if (data.getData() != null) {


                    results =
                        new Uri[] {
                            data.getData()
                        };


                /*
                 * Multiple selected files.
                 */

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


        } catch (Throwable ignored) {

        }


        if (filePathCallback != null) {


            filePathCallback.onReceiveValue(
                results
            );


            filePathCallback = null;
        }
    }


    /*
     * =============================================================
     * STARTUP ERROR SCREEN
     * =============================================================
     *
     * If WebView initialization throws an exception, display the
     * exception instead of immediately closing the application.
     * =============================================================
     */

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

                "\n\n"

                +

                "MESSAGE:\n"

                +

                String.valueOf(
                    error.getMessage()
                )

                +

                "\n\n"

                +

                "STACK TRACE:\n"

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


    /*
     * =============================================================
     * BACK BUTTON
     * =============================================================
     */

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


    /*
     * =============================================================
     * CLEANUP
     * =============================================================
     */

    @Override
    protected void onDestroy() {


        try {


            if (webView != null) {


                webView.stopLoading();


                webView.loadUrl(
                    "about:blank"
                );


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
