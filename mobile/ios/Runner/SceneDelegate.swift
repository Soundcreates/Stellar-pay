import Flutter
import UIKit

class SceneDelegate: FlutterSceneDelegate {
  override func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    super.scene(scene, willConnectTo: session, options: connectionOptions)

    if let url = connectionOptions.urlContexts.first?.url {
      (UIApplication.shared.delegate as? AppDelegate)?.setInitialLink(url)
    } else if let activity = connectionOptions.userActivities.first,
              let url = activity.webpageURL {
      (UIApplication.shared.delegate as? AppDelegate)?.setInitialLink(url)
    }
  }

  override func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    super.scene(scene, openURLContexts: URLContexts)
    let appDelegate = UIApplication.shared.delegate as? AppDelegate
    URLContexts.forEach { appDelegate?.handleIncomingURL($0.url) }
  }

  override func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    super.scene(scene, continue: userActivity)
    if let url = userActivity.webpageURL {
      (UIApplication.shared.delegate as? AppDelegate)?.handleIncomingURL(url)
    }
  }

}
