import AVFoundation
import AVKit
import CoreImage
import ExpoModulesCore
import ImageIO
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

final class VicallSampleBufferVideoView: UIView, RTKRTCVideoRenderer {
  override class var layerClass: AnyClass {
    AVSampleBufferDisplayLayer.self
  }

  var sampleBufferDisplayLayer: AVSampleBufferDisplayLayer {
    layer as! AVSampleBufferDisplayLayer
  }

  private let renderQueue = DispatchQueue(
    label: "expo.modules.vicallcallmanager.pip.render",
    qos: .userInteractive
  )
  private let ciContext = CIContext(options: [.cacheIntermediates: false])
  private let stateLock = NSLock()
  private var renderingFrame = false
  private var pixelBufferPool: CVPixelBufferPool?
  private var poolSize = CGSize.zero

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    sampleBufferDisplayLayer.backgroundColor = UIColor.black.cgColor
    sampleBufferDisplayLayer.videoGravity = .resizeAspectFill
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setSize(_ size: CGSize) {}

  func renderFrame(_ frame: RTKRTCVideoFrame?) {
    guard let frame, beginFrame() else {
      return
    }

    renderQueue.async { [weak self] in
      defer { self?.finishFrame() }
      guard let self,
            let sourceBuffer = self.pixelBuffer(from: frame),
            let displayBuffer = self.orientedPixelBuffer(
              sourceBuffer,
              rotation: frame.rotation
            ),
            let sampleBuffer = self.sampleBuffer(from: displayBuffer) else {
        return
      }

      if self.sampleBufferDisplayLayer.status == .failed {
        self.sampleBufferDisplayLayer.flush()
      }
      self.sampleBufferDisplayLayer.enqueue(sampleBuffer)
    }
  }

  func flush() {
    renderQueue.async { [weak self] in
      self?.sampleBufferDisplayLayer.flushAndRemoveImage()
    }
  }

  private func beginFrame() -> Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    guard !renderingFrame else {
      return false
    }
    renderingFrame = true
    return true
  }

  private func finishFrame() {
    stateLock.lock()
    renderingFrame = false
    stateLock.unlock()
  }

  private func pixelBuffer(from frame: RTKRTCVideoFrame) -> CVPixelBuffer? {
    if let cvBuffer = frame.buffer as? RTKRTCCVPixelBuffer,
       !cvBuffer.requiresCropping() {
      return cvBuffer.pixelBuffer
    }

    let i420 = frame.buffer.toI420()
    let width = Int(i420.width)
    let height = Int(i420.height)
    var output: CVPixelBuffer?
    let attributes: [CFString: Any] = [
      kCVPixelBufferIOSurfacePropertiesKey: [:],
      kCVPixelBufferMetalCompatibilityKey: true
    ]
    let result = CVPixelBufferCreate(
      kCFAllocatorDefault,
      width,
      height,
      kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
      attributes as CFDictionary,
      &output
    )
    guard result == kCVReturnSuccess, let output else {
      return nil
    }

    CVPixelBufferLockBaseAddress(output, [])
    defer { CVPixelBufferUnlockBaseAddress(output, []) }

    guard let yDestination = CVPixelBufferGetBaseAddressOfPlane(output, 0),
          let uvDestination = CVPixelBufferGetBaseAddressOfPlane(output, 1) else {
      return nil
    }

    copyPlane(
      source: i420.dataY,
      sourceStride: Int(i420.strideY),
      destination: yDestination.assumingMemoryBound(to: UInt8.self),
      destinationStride: CVPixelBufferGetBytesPerRowOfPlane(output, 0),
      width: width,
      height: height
    )

    let chromaWidth = Int(i420.chromaWidth)
    let chromaHeight = Int(i420.chromaHeight)
    let uvStride = CVPixelBufferGetBytesPerRowOfPlane(output, 1)
    let uvBytes = uvDestination.assumingMemoryBound(to: UInt8.self)
    for row in 0..<chromaHeight {
      let uRow = i420.dataU.advanced(by: row * Int(i420.strideU))
      let vRow = i420.dataV.advanced(by: row * Int(i420.strideV))
      let destinationRow = uvBytes.advanced(by: row * uvStride)
      for column in 0..<chromaWidth {
        destinationRow[column * 2] = uRow[column]
        destinationRow[column * 2 + 1] = vRow[column]
      }
    }
    return output
  }

  private func copyPlane(
    source: UnsafePointer<UInt8>,
    sourceStride: Int,
    destination: UnsafeMutablePointer<UInt8>,
    destinationStride: Int,
    width: Int,
    height: Int
  ) {
    for row in 0..<height {
      memcpy(
        destination.advanced(by: row * destinationStride),
        source.advanced(by: row * sourceStride),
        width
      )
    }
  }

  private func orientedPixelBuffer(
    _ source: CVPixelBuffer,
    rotation: RTKRTCVideoRotation
  ) -> CVPixelBuffer? {
    var image = CIImage(cvPixelBuffer: source)
    switch rotation.rawValue {
    case 90:
      image = image.oriented(forExifOrientation: Int32(CGImagePropertyOrientation.right.rawValue))
    case 180:
      image = image.oriented(forExifOrientation: Int32(CGImagePropertyOrientation.down.rawValue))
    case 270:
      image = image.oriented(forExifOrientation: Int32(CGImagePropertyOrientation.left.rawValue))
    default:
      break
    }

    image = image.transformed(
      by: CGAffineTransform(
        translationX: -image.extent.origin.x,
        y: -image.extent.origin.y
      )
    )
    let width = max(1, Int(image.extent.width.rounded()))
    let height = max(1, Int(image.extent.height.rounded()))
    guard let output = makePixelBuffer(width: width, height: height) else {
      return nil
    }
    ciContext.render(
      image,
      to: output,
      bounds: CGRect(x: 0, y: 0, width: width, height: height),
      colorSpace: CGColorSpaceCreateDeviceRGB()
    )
    return output
  }

  private func makePixelBuffer(width: Int, height: Int) -> CVPixelBuffer? {
    let size = CGSize(width: width, height: height)
    if pixelBufferPool == nil || poolSize != size {
      var pool: CVPixelBufferPool?
      let attributes: [CFString: Any] = [
        kCVPixelBufferWidthKey: width,
        kCVPixelBufferHeightKey: height,
        kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA,
        kCVPixelBufferIOSurfacePropertiesKey: [:],
        kCVPixelBufferMetalCompatibilityKey: true
      ]
      guard CVPixelBufferPoolCreate(
        kCFAllocatorDefault,
        nil,
        attributes as CFDictionary,
        &pool
      ) == kCVReturnSuccess else {
        return nil
      }
      pixelBufferPool = pool
      poolSize = size
    }

    guard let pixelBufferPool else {
      return nil
    }
    var output: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(
      kCFAllocatorDefault,
      pixelBufferPool,
      &output
    ) == kCVReturnSuccess else {
      return nil
    }
    return output
  }

  private func sampleBuffer(from pixelBuffer: CVPixelBuffer) -> CMSampleBuffer? {
    var formatDescription: CMVideoFormatDescription?
    guard CMVideoFormatDescriptionCreateForImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: pixelBuffer,
      formatDescriptionOut: &formatDescription
    ) == noErr,
    let formatDescription else {
      return nil
    }

    var timing = CMSampleTimingInfo(
      duration: .invalid,
      presentationTimeStamp: .zero,
      decodeTimeStamp: .invalid
    )
    var sampleBuffer: CMSampleBuffer?
    guard CMSampleBufferCreateReadyWithImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: pixelBuffer,
      formatDescription: formatDescription,
      sampleTiming: &timing,
      sampleBufferOut: &sampleBuffer
    ) == noErr,
    let sampleBuffer else {
      return nil
    }

    CMSetAttachment(
      sampleBuffer,
      key: kCMSampleAttachmentKey_DisplayImmediately,
      value: kCFBooleanTrue,
      attachmentMode: kCMAttachmentMode_ShouldNotPropagate
    )
    return sampleBuffer
  }
}

final class VicallPictureInPictureManager: NSObject {
  static let shared = VicallPictureInPictureManager()

  private weak var sourceView: UIView?
  private var contentViewController: AVPictureInPictureVideoCallViewController?
  private var controller: AVPictureInPictureController?
  private var renderer: VicallSampleBufferVideoView?
  private var videoTrack: RTKRTCVideoTrack?
  private var autoEnterEnabled = true

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
    NSLayoutConstraint.activate([
      renderer.leadingAnchor.constraint(equalTo: contentViewController.view.leadingAnchor),
      renderer.trailingAnchor.constraint(equalTo: contentViewController.view.trailingAnchor),
      renderer.topAnchor.constraint(equalTo: contentViewController.view.topAnchor),
      renderer.bottomAnchor.constraint(equalTo: contentViewController.view.bottomAnchor)
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
    self.contentViewController = contentViewController
    self.controller = controller
  }

  func setAutoEnterEnabled(_ enabled: Bool) throws {
    autoEnterEnabled = enabled
    guard let controller else {
      throw VicallPictureInPictureError.notPrepared
    }
    controller.canStartPictureInPictureAutomaticallyFromInline = enabled
  }

  func start() throws {
    guard let controller else {
      throw VicallPictureInPictureError.notPrepared
    }
    guard controller.isPictureInPicturePossible else {
      throw VicallPictureInPictureError.notPossible
    }
    controller.startPictureInPicture()
  }

  func stop() {
    controller?.stopPictureInPicture()
  }

  func dispose() {
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
    sourceView = nil
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
    VicallPictureInPictureEventStore.shared.emit(type: "didStart", active: true)
    VicallPictureInPictureEventStore.shared.emit(type: "stateChanged", active: true)
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    failedToStartPictureInPictureWithError error: Error
  ) {
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
    VicallPictureInPictureEventStore.shared.emit(type: "restoreRequested", active: true)
    completionHandler(true)
  }
}
