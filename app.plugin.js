const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withInfoPlist,
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

function withVicallCallManager(config, props = {}) {
  const {
    appName = config.name || "Vicall",
    supportsVideo = true,
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

    if (enableVoipPush) {
      mod.modResults.UIBackgroundModes = appendUnique(
        mod.modResults.UIBackgroundModes,
        ["voip", "remote-notification", "audio"],
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

    return mod;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withVicallCallManager,
  pkg.name,
  pkg.version,
);
