import ExpoModulesCore
import UIKit

public final class VicallCallManagerAppDelegateSubscriber:
  ExpoAppDelegateSubscriber
{
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions:
      [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    _ = VicallCallKitManager.shared

    if VicallProviderConfiguration.load().enableVoipPush {
      VicallPushKitManager.shared.start()
    }

    return true
  }
}
