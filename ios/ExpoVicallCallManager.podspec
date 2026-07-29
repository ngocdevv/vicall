Pod::Spec.new do |s|
  s.name           = 'ExpoVicallCallManager'
  s.version        = '0.1.0'
  s.summary        = 'CallKit and PushKit bridge for Vicall'
  s.description    = 'An Expo Modules API bridge for native iOS VoIP call lifecycle.'
  s.author         = 'Vicall'
  s.homepage       = 'https://github.com/ngocdevv/vicall'
  s.license        = { :type => 'MIT', :file => '../LICENSE' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CallKit', 'PushKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION' => '5.9'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
