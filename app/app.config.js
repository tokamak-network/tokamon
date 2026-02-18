export default {
  expo: {
    name: "Tokamon",
    slug: "tokamon",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-bg.png",
      resizeMode: "cover",
      backgroundColor: "#0a0a1a",
    },
    ios: {
      bundleIdentifier: "com.tokamak.tokamon",
      supportsTablet: true,
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "Tokamon needs your location to find nearby spots and enable claims within range.",
      },
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0f0f0f",
      },
      package: "com.tokamak.tokamon",
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      edgeToEdgeEnabled: true,
      permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        },
      },
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    extra: {
      eas: {
        projectId: "11e487be-3c7c-438c-8386-82068bf972ac",
      },
    },
    plugins: [
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Tokamon needs your location to find nearby spots.",
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#0f0f0f",
        },
      ],
    ],
  },
};
