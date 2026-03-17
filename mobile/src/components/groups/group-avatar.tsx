import { Image, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme";

interface GroupAvatarProps {
  name: string;
  logoUrl?: string | null;
  size?: number;
}

export function GroupAvatar({ name, logoUrl, size = 28 }: GroupAvatarProps) {
  if (logoUrl) {
    return <Image source={{ uri: logoUrl }} style={[styles.image, { width: size, height: size }]} />;
  }

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.fallbackLabel}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 999,
  },
  fallback: {
    alignItems: "center",
    backgroundColor: colors.secondary,
    justifyContent: "center",
  },
  fallbackLabel: {
    color: colors.primaryStrong,
    fontSize: 14,
    fontWeight: "700",
  },
});
