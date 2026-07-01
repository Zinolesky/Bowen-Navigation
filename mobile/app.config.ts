export default {
  expo: {
    name: "Bowen Navigator",
    slug: "bowen-navigator",
    scheme: "bowennavigator",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    owner: "bowen-navigator",
    ios: {
      supportsTablet: false,
      bundleIdentifier: "ng.edu.bowen.navigator",
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY || ""
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "Bowen Navigator uses your location to calculate walking directions on campus."
      }
    },
    android: {
      package: "ng.edu.bowen.navigator",
      adaptiveIcon: {
        backgroundColor: "#0F766E"
      },
      permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY || ""
        }
      }
    },
    plugins: ["expo-router", "expo-secure-store", "expo-location"],
    experiments: {
      typedRoutes: true
    }
  }
};
