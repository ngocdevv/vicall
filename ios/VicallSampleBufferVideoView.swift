import AVFoundation
import AVKit
import CoreImage
import ImageIO
import RTKWebRTC
import UIKit

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
  private var firstFrameTimestampNs: Int64?
  private var lastPresentationTime = CMTime.invalid
  // Stored as AnyObject so this view can still deploy to iOS 16. The concrete
  // AVSampleBufferVideoRenderer type is guarded at every use by iOS 17 checks.
  private var videoRenderer: AnyObject?

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    sampleBufferDisplayLayer.backgroundColor = UIColor.black.cgColor
    sampleBufferDisplayLayer.videoGravity = .resizeAspectFill
    if #available(iOS 17.0, *) {
      videoRenderer = sampleBufferDisplayLayer.sampleBufferRenderer
    }
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
            let sampleBuffer = self.sampleBuffer(
              from: displayBuffer,
              timestampNs: frame.timeStampNs
            ) else {
        return
      }

      self.enqueue(sampleBuffer)
    }
  }

  func flush() {
    renderQueue.async { [weak self] in
      guard let self else {
        return
      }
      self.firstFrameTimestampNs = nil
      self.lastPresentationTime = .invalid
      if #available(iOS 17.0, *),
         let videoRenderer = self.videoRenderer as? AVSampleBufferVideoRenderer {
        videoRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
        return
      }
      DispatchQueue.main.async { [weak self] in
        self?.sampleBufferDisplayLayer.flushAndRemoveImage()
      }
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
    // Avoid an expensive Core Image conversion for the common case. Keeping
    // the WebRTC IOSurface-backed buffer also makes rendering considerably more
    // reliable while iOS grants the app only background PiP execution time.
    guard rotation.rawValue != 0 else {
      return source
    }

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

  private func sampleBuffer(
    from pixelBuffer: CVPixelBuffer,
    timestampNs: Int64
  ) -> CMSampleBuffer? {
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
      presentationTimeStamp: presentationTime(for: timestampNs),
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

  private func presentationTime(for timestampNs: Int64) -> CMTime {
    let origin = firstFrameTimestampNs ?? timestampNs
    firstFrameTimestampNs = origin
    let relativeTimestamp = max(0, timestampNs - origin)
    var presentationTime = CMTime(
      value: relativeTimestamp,
      timescale: 1_000_000_000
    )

    // Some WebRTC renegotiations can repeat one timestamp. AVFoundation may
    // drop buffers with a non-increasing PTS, so always move forward by 1 ns.
    if lastPresentationTime.isValid,
       CMTimeCompare(presentationTime, lastPresentationTime) <= 0 {
      presentationTime = CMTimeAdd(
        lastPresentationTime,
        CMTime(value: 1, timescale: 1_000_000_000)
      )
    }
    lastPresentationTime = presentationTime
    return presentationTime
  }

  private func enqueue(_ sampleBuffer: CMSampleBuffer) {
    if #available(iOS 17.0, *),
       let videoRenderer = videoRenderer as? AVSampleBufferVideoRenderer {
      if videoRenderer.status == .failed || videoRenderer.requiresFlushToResumeDecoding {
        videoRenderer.flush()
      }
      videoRenderer.enqueue(sampleBuffer)
      return
    }

    // On iOS 16 AVSampleBufferDisplayLayer is the only renderer available and
    // must be touched on the main queue. The iOS 17 renderer above is explicitly
    // safe for background-queue enqueuing.
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        return
      }
      if self.sampleBufferDisplayLayer.status == .failed ||
         self.sampleBufferDisplayLayer.requiresFlushToResumeDecoding {
        self.sampleBufferDisplayLayer.flush()
      }
      self.sampleBufferDisplayLayer.enqueue(sampleBuffer)
    }
  }
}
