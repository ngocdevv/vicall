const path = require("path");
const { createRequire } = require("module");

function loadConfigPlugins() {
  const attempts = [];

  const tryRequire = (label, req, id) => {
    try {
      return req(id);
    } catch (error) {
      attempts.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  // 1) Normal resolution (published package / monorepo with hoisted deps).
  let plugins =
    tryRequire("default:@expo/config-plugins", require, "@expo/config-plugins") ||
    tryRequire("default:expo/config-plugins", require, "expo/config-plugins");
  if (plugins) return plugins;

  // 2) Host app node_modules when this package is file:-linked and its own
  //    node_modules only contain thin symlinks (or are empty).
  const hostCandidates = [
    // VicallApp/node_modules when package lives at Documents/Vicall
    path.resolve(__dirname, "../VicallApp/package.json"),
    // node_modules/expo-vicall-call-manager -> ../../Vicall  ⇒ app package.json
    path.resolve(__dirname, "../../package.json"),
    path.resolve(__dirname, "../../../package.json"),
  ];

  for (const pkgJson of hostCandidates) {
    try {
      const hostRequire = createRequire(pkgJson);
      plugins =
        tryRequire(`host:${pkgJson}:@expo/config-plugins`, hostRequire, "@expo/config-plugins") ||
        tryRequire(`host:${pkgJson}:expo/config-plugins`, hostRequire, "expo/config-plugins");
      if (plugins) return plugins;
    } catch {
      // package.json may not exist for this candidate
    }
  }

  throw new Error(
    [
      "expo-vicall-call-manager config plugin could not load @expo/config-plugins.",
      "Install it in the host app (comes with expo) and re-run scripts/link-vicall-module.sh.",
      ...attempts.map((line) => `  - ${line}`),
    ].join("\n"),
  );
}

const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withInfoPlist,
  withMainActivity,
} = loadConfigPlugins();

const pkg = require("./package.json");

const META_PREFIX = "expo.modules.vicallcallmanager";
const EXPO_FCM_SERVICE =
  "expo.modules.notifications.service.ExpoFirebaseMessagingService";
const VICALL_FCM_SERVICE =
  "expo.modules.vicallcallmanager.VicallFirebaseMessagingService";

function appendUnique(values, additions) {
  return Array.from(new Set([...(values || []), ...additions]));
}

function upsertMetaData(application, name, value) {
  application["meta-data"] = application["meta-data"] || [];
  const existing = application["meta-data"].find(
    (item) => item.$?.["android:name"] === name,
  );

  if (existing) {
    existing.$["android:value"] = String(value);
    return;
  }

  application["meta-data"].push({
    $: {
      "android:name": name,
      "android:value": String(value),
    },
  });
}

function configureFirebaseMessagingService(manifest, application) {
  manifest.$ = manifest.$ || {};
  manifest.$["xmlns:tools"] =
    manifest.$["xmlns:tools"] || "http://schemas.android.com/tools";
  application.service = application.service || [];
  application.service = application.service.filter((service) => {
    const name = service.$?.["android:name"];
    return name !== EXPO_FCM_SERVICE && name !== VICALL_FCM_SERVICE;
  });

  application.service.push(
    {
      $: {
        "android:name": EXPO_FCM_SERVICE,
        "tools:node": "remove",
      },
    },
    {
      $: {
        "android:name": VICALL_FCM_SERVICE,
        "android:exported": "false",
      },
      "intent-filter": [
        {
          $: {
            "android:priority": "100",
          },
          action: [
            {
              $: {
                "android:name": "com.google.firebase.MESSAGING_EVENT",
              },
            },
          ],
        },
      ],
    },
  );
}

function configurePictureInPictureManifest(manifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  activity.$ = activity.$ || {};
  activity.$["android:supportsPictureInPicture"] = "true";

  const requiredChanges = [
    "keyboard",
    "keyboardHidden",
    "orientation",
    "screenLayout",
    "screenSize",
    "smallestScreenSize",
    "uiMode",
  ];
  const existingChanges = String(activity.$["android:configChanges"] || "")
    .split("|")
    .filter(Boolean);
  activity.$["android:configChanges"] = appendUnique(
    existingChanges,
    requiredChanges,
  ).join("|");
}

function addPictureInPictureCallback(contents, language) {
  const callbackMarker = "expo-vicall-call-manager: PiP callback";
  const handoffMarker = "expo-vicall-call-manager: PiP handoff";
  const pauseHandoffMarker = "expo-vicall-call-manager: PiP pause handoff";
  let methods = "";

  if (!contents.includes(callbackMarker)) {
    methods += language === "java" ? `
  // ${callbackMarker}
  @Override
  public void onPictureInPictureModeChanged(
      boolean isInPictureInPictureMode,
      android.content.res.Configuration newConfig) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
    expo.modules.vicallcallmanager.VicallPictureInPictureManager
        .onPictureInPictureModeChanged(isInPictureInPictureMode);
  }
` : `
  // ${callbackMarker}
  override fun onPictureInPictureModeChanged(
    isInPictureInPictureMode: Boolean,
    newConfig: android.content.res.Configuration,
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    expo.modules.vicallcallmanager.VicallPictureInPictureManager
      .onPictureInPictureModeChanged(isInPictureInPictureMode)
  }
`;
  }

  if (!contents.includes(handoffMarker)) {
    methods += language === "java" ? `
  // ${handoffMarker}
  @Override
  public void onUserLeaveHint() {
    expo.modules.vicallcallmanager.VicallPictureInPictureManager
        .onUserLeaveHint(this);
    super.onUserLeaveHint();
  }
` : `
  // ${handoffMarker}
  override fun onUserLeaveHint() {
    expo.modules.vicallcallmanager.VicallPictureInPictureManager
      .onUserLeaveHint(this)
    super.onUserLeaveHint()
  }
`;
  }

  if (!contents.includes(pauseHandoffMarker)) {
    methods += language === "java" ? `
  // ${pauseHandoffMarker}
  @Override
  protected void onPause() {
    expo.modules.vicallcallmanager.VicallPictureInPictureManager
        .onActivityPausing(this);
    super.onPause();
  }
` : `
  // ${pauseHandoffMarker}
  override fun onPause() {
    expo.modules.vicallcallmanager.VicallPictureInPictureManager
      .onActivityPausing(this)
    super.onPause()
  }
`;
  }

  if (!methods) return contents;

  const lastBrace = contents.lastIndexOf("}");
  if (lastBrace < 0) {
    throw new Error("Unable to add the Picture in Picture callback to MainActivity");
  }
  return `${contents.slice(0, lastBrace)}${methods}${contents.slice(lastBrace)}`;
}

function withVicallCallManager(config, props = {}) {
  const {
    appName = config.name || "Vicall",
    supportsVideo = true,
    enablePictureInPicture = true,
    includesCallsInRecents = false,
    maximumCallGroups = 1,
    maximumCallsPerCallGroup = 1,
    ringtoneSound,
    enableVoipPush = true,
    androidNotificationChannelId = "vicall_calls",
    androidNotificationChannelName = "Calls",
    androidNotificationIcon = "",
  } = props;

  config = withInfoPlist(config, (mod) => {
    mod.modResults.VicallCallManager = {
      appName,
      supportsVideo,
      includesCallsInRecents,
      maximumCallGroups,
      maximumCallsPerCallGroup,
      enableVoipPush,
      ...(ringtoneSound ? { ringtoneSound } : {}),
    };

    if (enableVoipPush || enablePictureInPicture) {
      mod.modResults.UIBackgroundModes = appendUnique(
        mod.modResults.UIBackgroundModes,
        [
          ...(enableVoipPush ? ["voip", "remote-notification"] : []),
          ...(enablePictureInPicture ? ["audio"] : []),
        ],
      );
    }

    return mod;
  });

  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      mod.modResults,
    );

    upsertMetaData(application, `${META_PREFIX}.APP_NAME`, appName);
    upsertMetaData(
      application,
      `${META_PREFIX}.SUPPORTS_VIDEO`,
      supportsVideo,
    );
    upsertMetaData(
      application,
      `${META_PREFIX}.CHANNEL_ID`,
      androidNotificationChannelId,
    );
    upsertMetaData(
      application,
      `${META_PREFIX}.CHANNEL_NAME`,
      androidNotificationChannelName,
    );
    upsertMetaData(
      application,
      `${META_PREFIX}.NOTIFICATION_ICON`,
      androidNotificationIcon,
    );
    configureFirebaseMessagingService(mod.modResults.manifest, application);
    if (enablePictureInPicture) {
      configurePictureInPictureManifest(mod.modResults);
    }

    return mod;
  });

  if (enablePictureInPicture) {
    config = withMainActivity(config, (mod) => {
      mod.modResults.contents = addPictureInPictureCallback(
        mod.modResults.contents,
        mod.modResults.language,
      );
      return mod;
    });
  }

  return config;
}

module.exports = createRunOncePlugin(
  withVicallCallManager,
  pkg.name,
  pkg.version,
);
