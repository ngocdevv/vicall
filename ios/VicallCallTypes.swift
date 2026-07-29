import CallKit
import Foundation

struct VicallProviderConfiguration {
  let appName: String
  let supportsVideo: Bool
  let includesCallsInRecents: Bool
  let maximumCallGroups: Int
  let maximumCallsPerCallGroup: Int
  let ringtoneSound: String?
  let enableVoipPush: Bool

  static func load() -> VicallProviderConfiguration {
    let raw = Bundle.main.object(forInfoDictionaryKey: "VicallCallManager")
      as? [String: Any] ?? [:]
    let fallbackName =
      Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
      ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String
      ?? "Vicall"

    return VicallProviderConfiguration(
      appName: raw["appName"] as? String ?? fallbackName,
      supportsVideo: raw["supportsVideo"] as? Bool ?? true,
      includesCallsInRecents: raw["includesCallsInRecents"] as? Bool ?? false,
      maximumCallGroups: raw["maximumCallGroups"] as? Int ?? 1,
      maximumCallsPerCallGroup: raw["maximumCallsPerCallGroup"] as? Int ?? 1,
      ringtoneSound: raw["ringtoneSound"] as? String,
      enableVoipPush: raw["enableVoipPush"] as? Bool ?? true
    )
  }

  func makeCallKitConfiguration() -> CXProviderConfiguration {
    let configuration = CXProviderConfiguration(localizedName: appName)
    configuration.supportsVideo = supportsVideo
    configuration.includesCallsInRecents = includesCallsInRecents
    configuration.maximumCallGroups = maximumCallGroups
    configuration.maximumCallsPerCallGroup = maximumCallsPerCallGroup
    configuration.supportedHandleTypes = [.generic, .phoneNumber, .emailAddress]
    if let ringtoneSound {
      configuration.ringtoneSound = ringtoneSound
    }
    return configuration
  }
}
enum VicallCallDirection: String {
  case incoming
  case outgoing
}

enum VicallCallEndReason: String {
  case failed
  case remoteEnded
  case unanswered
  case answeredElsewhere
  case declinedElsewhere
  case missed

  var callKitReason: CXCallEndedReason {
    switch self {
    case .failed:
      return .failed
    case .remoteEnded, .declinedElsewhere:
      return .remoteEnded
    case .unanswered:
      return .unanswered
    case .answeredElsewhere:
      return .answeredElsewhere
    case .missed:
      return .unanswered
    }
  }
}

struct VicallCallDescriptor {
  let callId: UUID
  let handle: String
  let displayName: String
  let handleType: CXHandle.HandleType
  let hasVideo: Bool
  let metadata: [String: Any]
  let direction: VicallCallDirection

  init(
    callId: UUID,
    handle: String,
    displayName: String,
    handleType: CXHandle.HandleType = .generic,
    hasVideo: Bool = false,
    metadata: [String: Any] = [:],
    direction: VicallCallDirection
  ) {
    self.callId = callId
    self.handle = handle
    self.displayName = displayName
    self.handleType = handleType
    self.hasVideo = hasVideo
    self.metadata = metadata
    self.direction = direction
  }

  static func from(
    dictionary: [String: Any],
    direction: VicallCallDirection
  ) throws -> VicallCallDescriptor {
    guard
      let callIdString = dictionary["callId"] as? String,
      let callId = UUID(uuidString: callIdString)
    else {
      throw VicallCallManagerError.invalidCallId
    }

    guard
      let handle = dictionary["handle"] as? String,
      !handle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      throw VicallCallManagerError.invalidHandle
    }

    let handleType: CXHandle.HandleType
    switch dictionary["handleType"] as? String {
    case "phoneNumber":
      handleType = .phoneNumber
    case "email":
      handleType = .emailAddress
    default:
      handleType = .generic
    }

    return VicallCallDescriptor(
      callId: callId,
      handle: handle,
      displayName: dictionary["displayName"] as? String
        ?? dictionary["callerName"] as? String
        ?? handle,
      handleType: handleType,
      hasVideo: dictionary["hasVideo"] as? Bool ?? false,
      metadata: dictionary["metadata"] as? [String: Any] ?? [:],
      direction: direction
    )
  }

  var eventFields: [String: Any] {
    [
      "callId": callId.uuidString.lowercased(),
      "direction": direction.rawValue,
      "handle": handle,
      "displayName": displayName,
      "hasVideo": hasVideo,
      "metadata": metadata
    ]
  }
}

enum VicallCallManagerError: Error, LocalizedError {
  case invalidCallId
  case invalidHandle
  case callNotFound
  case transactionFailed(String)

  var errorDescription: String? {
    switch self {
    case .invalidCallId:
      return "callId must be a valid RFC 4122 UUID"
    case .invalidHandle:
      return "handle must not be empty"
    case .callNotFound:
      return "No native call exists for this callId"
    case .transactionFailed(let message):
      return "The native call transaction failed: \(message)"
    }
  }
}
