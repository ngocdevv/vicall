Pod::Spec.new do |s|
  s.name           = 'ExpoVicallCallManager'
  s.version        = '0.5.1'
  s.summary        = 'System-call engine for Expo audio/video calls (host-owned UI)'
  s.description    = 'CallKit, PushKit, Android Telecom, VoIP/FCM contracts, and optional system PiP APIs. Integrating apps own in-call product UI and media.'
  s.author         = 'Vicall'
  s.homepage       = 'https://github.com/ngocdevv/expo-vicall-call-manager'
  s.license        = { :type => 'MIT', :file => '../LICENSE' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # @cloudflare/react-native-webrtc still publishes the CocoaPod name
  # "react-native-webrtc" and pulls RTKWebRTC (imported by PiP renderers).
  s.dependency 'react-native-webrtc'
  s.frameworks = 'AVFoundation', 'AVKit', 'CallKit', 'CoreImage', 'PushKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION' => '5.9'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
