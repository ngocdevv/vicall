Pod::Spec.new do |s|
  s.name           = 'ExpoVicallCallManager'
  s.version        = '0.2.0'
  s.summary        = 'CallKit, PushKit, and video-call Picture in Picture for Vicall'
  s.description    = 'An Expo Modules API bridge for native iOS VoIP lifecycle and system Picture in Picture.'
  s.author         = 'Vicall'
  s.homepage       = 'https://github.com/ngocdevv/expo-vicall-call-manager'
  s.license        = { :type => 'MIT', :file => '../LICENSE' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'react-native-webrtc'
  s.frameworks = 'AVFoundation', 'AVKit', 'CallKit', 'CoreImage', 'PushKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION' => '5.9'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
