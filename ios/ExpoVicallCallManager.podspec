Pod::Spec.new do |s|
  s.name           = 'ExpoVicallCallManager'
  s.version        = '0.3.0'
  s.summary        = 'Native VoIP lifecycle and hybrid video-call presentation for Expo'
  s.description    = 'An Expo Modules API bridge for CallKit, PushKit, Android Telecom, system Picture in Picture, and optional hybrid call UI.'
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
