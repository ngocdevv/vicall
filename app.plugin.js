const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withInfoPlist,
  withMainActivity,
} = require("@expo/config-plugins");

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
