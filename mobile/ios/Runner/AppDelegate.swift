import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, FlutterStreamHandler {
  private static let eventsChannel = "com.walletconnect.flutterdapp/events"
  private static let methodsChannel = "com.walletconnect.flutterdapp/methods"

  private var linkEventsChannel: FlutterEventChannel?
  private var linkMethodsChannel: FlutterMethodChannel?
  private var eventSink: FlutterEventSink?
  private var pendingLinks = [String]()
  private var initialLink: String?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if let url = launchOptions?[.url] as? URL {
      initialLink = url.absoluteString
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    let messenger = engineBridge.applicationRegistrar.messenger()
    linkEventsChannel = FlutterEventChannel(
      name: AppDelegate.eventsChannel,
      binaryMessenger: messenger
    )
    linkEventsChannel?.setStreamHandler(self)
    linkMethodsChannel = FlutterMethodChannel(
      name: AppDelegate.methodsChannel,
      binaryMessenger: messenger
    )
    linkMethodsChannel?.setMethodCallHandler { [weak self] call, result in
      guard call.method == "initialLink" else {
        result(FlutterMethodNotImplemented)
        return
      }
      result(self?.initialLink)
      self?.initialLink = nil
    }
  }

  func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
    eventSink = events
    pendingLinks.forEach { events($0) }
    pendingLinks.removeAll()
    return nil
  }

  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    eventSink = nil
    return nil
  }

  func setInitialLink(_ url: URL) {
    initialLink = url.absoluteString
  }

  func handleIncomingURL(_ url: URL) {
    if let eventSink {
      eventSink(url.absoluteString)
    } else {
      pendingLinks.append(url.absoluteString)
    }
  }

  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    handleIncomingURL(url)
    return true
  }

  override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard let url = userActivity.webpageURL else { return false }
    handleIncomingURL(url)
    return true
  }
}
