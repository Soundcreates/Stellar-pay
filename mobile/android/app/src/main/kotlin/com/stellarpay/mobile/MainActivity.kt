package com.stellarpay.mobile

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val eventsChannel = "com.walletconnect.flutterdapp/events"
    private val methodsChannel = "com.walletconnect.flutterdapp/methods"

    private var initialLink: String? = null
    private var eventSink: EventChannel.EventSink? = null
    private val pendingLinks = mutableListOf<String>()

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        initialLink = intent?.dataString
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        EventChannel(flutterEngine.dartExecutor.binaryMessenger, eventsChannel)
            .setStreamHandler(object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
                    eventSink = events
                    pendingLinks.forEach(events::success)
                    pendingLinks.clear()
                }

                override fun onCancel(arguments: Any?) {
                    eventSink = null
                }
            })

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, methodsChannel)
            .setMethodCallHandler { call, result ->
                if (call.method != "initialLink") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                result.success(initialLink)
                initialLink = null
            }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == Intent.ACTION_VIEW) {
            deliverLink(intent.dataString)
        }
    }

    private fun deliverLink(link: String?) {
        if (link == null) return
        val sink = eventSink
        if (sink != null) {
            sink.success(link)
        } else {
            pendingLinks.add(link)
        }
    }
}
