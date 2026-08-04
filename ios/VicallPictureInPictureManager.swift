import AVFoundation
import AVKit
import ExpoModulesCore
import RTKWebRTC
import UIKit

enum VicallPictureInPictureError: Error, LocalizedError {
  case notSupported
  case sourceViewNotFound
  case videoTrackNotReady
  case notPrepared
  case notPossible

  var errorDescription: String? {
    switch self {
    case .notSupported:
      return "Picture in Picture is not supported on this device."
    case .sourceViewNotFound:
      return "The React Native video view could not be found."
    case .videoTrackNotReady:
      return "The WebRTC video track is not ready yet."
    case .notPrepared:
      return "Call preparePictureInPicture() before starting Picture in Picture."
    case .notPossible:
      return "Picture in Picture is not currently possible."
    }
  }
}

final class VicallPictureInPictureManager: NSObject {
  static let shared = VicallPictureInPictureManager()

  private weak var sourceView: UIView?
  private var contentViewController: AVPictureInPictureVideoCallViewController?
  private var controller: AVPictureInPictureController?
  private var renderer: VicallSampleBufferVideoView?
  private var videoTrack: RTKRTCVideoTrack?
  private var localMuteBadge: UIView?
  private var remoteMuteBadge: UIView?
  private var cameraOffView: UIView?
  private var cameraOffLabel: UILabel?
  private var visualState: [String: Any] = [:]
  private var autoEnterEnabled = true
  private var restoreCompletionHandler: ((Bool) -> Void)?
  private var restoreTimeoutWorkItem: DispatchWorkItem?
  private var startCompletionHandler: ((Result<Void, Error>) -> Void)?
  private var startPossibleWorkItem: DispatchWorkItem?
  private var startTimeoutWorkItem: DispatchWorkItem?

  private override init() {
    super.init()
  }

  var isActive: Bool {
    controller?.isPictureInPictureActive ?? false
  }

  func prepare(
    sourceView: UIView,
    localVideoView: UIView?,
    options: [String: Any]?
  ) throws {
    guard AVPictureInPictureController.isPictureInPictureSupported() else {
      throw VicallPictureInPictureError.notSupported
    }
    guard let track = videoTrack(from: sourceView) else {
      throw VicallPictureInPictureError.videoTrackNotReady
    }

    dispose()

    let width = positiveNumber(options?["aspectRatioWidth"]) ?? 9
    let height = positiveNumber(options?["aspectRatioHeight"]) ?? 16
    autoEnterEnabled = (options?["autoEnterEnabled"] as? Bool) ?? true

    let renderer = VicallSampleBufferVideoView(frame: .zero)
    renderer.translatesAutoresizingMaskIntoConstraints = false

    let contentViewController = AVPictureInPictureVideoCallViewController()
    contentViewController.preferredContentSize = CGSize(width: width, height: height)
    contentViewController.view.backgroundColor = .black
    contentViewController.view.addSubview(renderer)

    let localMuteBadge = makeMuteBadge()
    let remoteMuteBadge = makeMuteBadge()
    let cameraOffView = UIView()
    cameraOffView.translatesAutoresizingMaskIntoConstraints = false
    cameraOffView.backgroundColor = .black

    let cameraOffLabel = UILabel()
    cameraOffLabel.translatesAutoresizingMaskIntoConstraints = false
    cameraOffLabel.textAlignment = .center
    cameraOffLabel.textColor = .white
    cameraOffLabel.font = .systemFont(ofSize: 17, weight: .semibold)
    cameraOffLabel.numberOfLines = 2
    cameraOffView.addSubview(cameraOffLabel)

    contentViewController.view.addSubview(cameraOffView)
    contentViewController.view.addSubview(localMuteBadge)
    contentViewController.view.addSubview(remoteMuteBadge)
    NSLayoutConstraint.activate([
      renderer.leadingAnchor.constraint(equalTo: contentViewController.view.leadingAnchor),
      renderer.trailingAnchor.constraint(equalTo: contentViewController.view.trailingAnchor),
      renderer.topAnchor.constraint(equalTo: contentViewController.view.topAnchor),
      renderer.bottomAnchor.constraint(equalTo: contentViewController.view.bottomAnchor),
      cameraOffView.leadingAnchor.constraint(equalTo: contentViewController.view.leadingAnchor),
      cameraOffView.trailingAnchor.constraint(equalTo: contentViewController.view.trailingAnchor),
      cameraOffView.topAnchor.constraint(equalTo: contentViewController.view.topAnchor),
      cameraOffView.bottomAnchor.constraint(equalTo: contentViewController.view.bottomAnchor),
      cameraOffLabel.leadingAnchor.constraint(equalTo: cameraOffView.leadingAnchor, constant: 12),
      cameraOffLabel.trailingAnchor.constraint(equalTo: cameraOffView.trailingAnchor, constant: -12),
      cameraOffLabel.centerYAnchor.constraint(equalTo: cameraOffView.centerYAnchor),
      localMuteBadge.leadingAnchor.constraint(
        equalTo: contentViewController.view.leadingAnchor,
        constant: 10
      ),
      localMuteBadge.bottomAnchor.constraint(
        equalTo: contentViewController.view.bottomAnchor,
        constant: -10
      ),
      remoteMuteBadge.trailingAnchor.constraint(
        equalTo: contentViewController.view.trailingAnchor,
        constant: -10
      ),
      remoteMuteBadge.bottomAnchor.constraint(
        equalTo: contentViewController.view.bottomAnchor,
        constant: -10
      )
    ])

    let contentSource = AVPictureInPictureController.ContentSource(
      activeVideoCallSourceView: sourceView,
      contentViewController: contentViewController
    )
    let controller = AVPictureInPictureController(contentSource: contentSource)
    controller.canStartPictureInPictureAutomaticallyFromInline = autoEnterEnabled
    controller.delegate = self

    track.add(renderer)
    enableMultitaskingCameraAccess(from: localVideoView)

    self.sourceView = sourceView
    self.videoTrack = track
    self.renderer = renderer
    self.localMuteBadge = localMuteBadge
    self.remoteMuteBadge = remoteMuteBadge
    self.cameraOffView = cameraOffView
    self.cameraOffLabel = cameraOffLabel
    self.contentViewController = contentViewController
    self.controller = controller
    applyVisualState()
  }

  func setAutoEnterEnabled(_ enabled: Bool) throws {
    autoEnterEnabled = enabled
    guard let controller else {
      throw VicallPictureInPictureError.notPrepared
    }
    controller.canStartPictureInPictureAutomaticallyFromInline = enabled
  }

  func refreshVideoTracks(
    sourceView: UIView,
    localVideoView: UIView?
  ) throws {
    guard let controller, let contentViewController, let renderer else {
      throw VicallPictureInPictureError.notPrepared
    }
    guard let nextTrack = videoTrack(from: sourceView) else {
      throw VicallPictureInPictureError.videoTrackNotReady
    }

    if videoTrack !== nextTrack {
      if let videoTrack {
        videoTrack.remove(renderer)
      }
      renderer.flush()
      nextTrack.add(renderer)
      videoTrack = nextTrack
    }

    self.sourceView = sourceView
    controller.contentSource = AVPictureInPictureController.ContentSource(
      activeVideoCallSourceView: sourceView,
      contentViewController: contentViewController
    )
    enableMultitaskingCameraAccess(from: localVideoView)
  }

  func start(completion: @escaping (Result<Void, Error>) -> Void) {
    guard let controller else {
      completion(.failure(VicallPictureInPictureError.notPrepared))
      return
    }
    if controller.isPictureInPictureActive {
      completion(.success(()))
      return
    }

    completeStart(.failure(VicallPictureInPictureError.notPossible))
    startCompletionHandler = completion
    waitUntilPictureInPictureIsPossible(
      controller: controller,
      deadline: Date().timeIntervalSinceReferenceDate + 2.5
    )
  }

  func stop() {
    completeStart(.failure(VicallPictureInPictureError.notPossible))
    controller?.stopPictureInPicture()
  }

  func updateVisualState(_ state: [String: Any]) {
    visualState.merge(state) { _, new in new }
    applyVisualState()
  }

  func completeRestore(_ restored: Bool) {
    restoreTimeoutWorkItem?.cancel()
    restoreTimeoutWorkItem = nil
    let completionHandler = restoreCompletionHandler
    restoreCompletionHandler = nil
    completionHandler?(restored)
  }

  func dispose() {
    completeRestore(false)
    completeStart(.failure(VicallPictureInPictureError.notPrepared))
    controller?.delegate = nil
    controller?.contentSource = nil
    if let renderer, let videoTrack {
      videoTrack.remove(renderer)
    }
    renderer?.flush()
    renderer?.removeFromSuperview()
    controller = nil
    contentViewController = nil
    renderer = nil
    videoTrack = nil
    localMuteBadge = nil
    remoteMuteBadge = nil
    cameraOffView = nil
    cameraOffLabel = nil
    sourceView = nil
  }

  private func waitUntilPictureInPictureIsPossible(
    controller expectedController: AVPictureInPictureController,
    deadline: TimeInterval
  ) {
    guard controller === expectedController else {
      completeStart(.failure(VicallPictureInPictureError.notPrepared))
      return
    }
    guard !expectedController.isPictureInPictureActive else {
      completeStart(.success(()))
      return
    }

    if expectedController.isPictureInPicturePossible {
      startPossibleWorkItem = nil
      expectedController.startPictureInPicture()
      let timeout = DispatchWorkItem { [weak self, weak expectedController] in
        guard let self,
              let expectedController,
              !expectedController.isPictureInPictureActive else {
          return
        }
        self.completeStart(.failure(VicallPictureInPictureError.notPossible))
      }
      startTimeoutWorkItem = timeout
      DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: timeout)
      return
    }

    guard Date().timeIntervalSinceReferenceDate < deadline else {
      completeStart(.failure(VicallPictureInPictureError.notPossible))
      return
    }

    let retry = DispatchWorkItem { [weak self, weak expectedController] in
      guard let self, let expectedController else {
        return
      }
      self.waitUntilPictureInPictureIsPossible(
        controller: expectedController,
        deadline: deadline
      )
    }
    startPossibleWorkItem = retry
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: retry)
  }

  private func completeStart(_ result: Result<Void, Error>) {
    startPossibleWorkItem?.cancel()
    startPossibleWorkItem = nil
    startTimeoutWorkItem?.cancel()
    startTimeoutWorkItem = nil
    let completion = startCompletionHandler
    startCompletionHandler = nil
    completion?(result)
  }

  private func makeMuteBadge() -> UIView {
    let badge = UIView()
    badge.translatesAutoresizingMaskIntoConstraints = false
    badge.backgroundColor = UIColor.black.withAlphaComponent(0.62)
    badge.layer.cornerCurve = .continuous
    badge.layer.cornerRadius = 14

    let imageView = UIImageView(image: UIImage(systemName: "mic.slash.fill"))
    imageView.translatesAutoresizingMaskIntoConstraints = false
    imageView.contentMode = .scaleAspectFit
    imageView.tintColor = .white
    badge.addSubview(imageView)

    NSLayoutConstraint.activate([
      badge.widthAnchor.constraint(equalToConstant: 28),
      badge.heightAnchor.constraint(equalToConstant: 28),
      imageView.widthAnchor.constraint(equalToConstant: 14),
      imageView.heightAnchor.constraint(equalToConstant: 14),
      imageView.centerXAnchor.constraint(equalTo: badge.centerXAnchor),
      imageView.centerYAnchor.constraint(equalTo: badge.centerYAnchor)
    ])
    return badge
  }

  private func applyVisualState() {
    localMuteBadge?.isHidden = !(visualState["localMuted"] as? Bool ?? false)
    remoteMuteBadge?.isHidden = !(visualState["remoteMuted"] as? Bool ?? false)

    let remoteCameraEnabled =
      visualState["remoteCameraEnabled"] as? Bool ?? true
    cameraOffView?.isHidden = remoteCameraEnabled
    if let displayName = visualState["displayName"] as? String,
       !displayName.isEmpty {
      cameraOffLabel?.text = "\(displayName)\nCamera off"
    } else {
      cameraOffLabel?.text = "Camera off"
    }
  }

  private func positiveNumber(_ value: Any?) -> CGFloat? {
    guard let number = value as? NSNumber, number.doubleValue > 0 else {
      return nil
    }
    return CGFloat(number.doubleValue)
  }

  private func videoTrack(from view: UIView) -> RTKRTCVideoTrack? {
    let selector = NSSelectorFromString("videoTrack")
    if view.responds(to: selector),
       let track = view.value(forKey: "videoTrack") as? RTKRTCVideoTrack {
      return track
    }
    for subview in view.subviews {
      if let track = videoTrack(from: subview) {
        return track
      }
    }
    return nil
  }

  private func enableMultitaskingCameraAccess(from view: UIView?) {
    guard let view,
          let localTrack = videoTrack(from: view),
          localTrack.responds(to: NSSelectorFromString("captureController")),
          let captureController = localTrack.value(forKey: "captureController") as? NSObject,
          captureController.responds(to: NSSelectorFromString("capturer")),
          let capturer = captureController.value(forKey: "capturer") as? NSObject,
          capturer.responds(to: NSSelectorFromString("captureSession")),
          let session = capturer.value(forKey: "captureSession") as? AVCaptureSession,
          session.isMultitaskingCameraAccessSupported else {
      return
    }
    session.isMultitaskingCameraAccessEnabled = true
  }
}

extension VicallPictureInPictureManager: AVPictureInPictureControllerDelegate {
  func pictureInPictureControllerWillStartPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    VicallPictureInPictureEventStore.shared.emit(type: "willStart", active: false)
  }

  func pictureInPictureControllerDidStartPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    completeStart(.success(()))
    VicallPictureInPictureEventStore.shared.emit(type: "didStart", active: true)
    VicallPictureInPictureEventStore.shared.emit(type: "stateChanged", active: true)
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    failedToStartPictureInPictureWithError error: Error
  ) {
    completeStart(.failure(error))
    VicallPictureInPictureEventStore.shared.emit(
      type: "failedToStart",
      active: false,
      error: error.localizedDescription
    )
  }

  func pictureInPictureControllerWillStopPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    VicallPictureInPictureEventStore.shared.emit(type: "willStop", active: true)
  }

  func pictureInPictureControllerDidStopPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    VicallPictureInPictureEventStore.shared.emit(type: "didStop", active: false)
    VicallPictureInPictureEventStore.shared.emit(type: "stateChanged", active: false)
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler:
      @escaping (Bool) -> Void
  ) {
    completeRestore(false)
    restoreCompletionHandler = completionHandler
    VicallPictureInPictureEventStore.shared.emit(type: "restoreRequested", active: true)

    let timeout = DispatchWorkItem { [weak self] in
      self?.completeRestore(false)
    }
    restoreTimeoutWorkItem = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: timeout)
  }
}
