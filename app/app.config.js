export default {
  expo: {
    name: "Tokamon",
    slug: "tokamon",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#0f0f0f",
    },
    ios: {
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
    plugins: [
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Tokamon needs your location to find nearby spots.",
        },
      ],
    ],
  },
};
