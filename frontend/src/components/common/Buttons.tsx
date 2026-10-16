import React, { ReactNode } from "react";
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  View,
} from "react-native";
import { Ionicons } from "./AppIcon";
import { colors, radius, shadows, typography } from "../../theme";

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost" | "cream";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode | keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export default function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
}: ButtonProps) {
  const getBackgroundColor = () => {
    if (disabled) return "rgba(255, 255, 255, 0.06)";
    switch (variant) {
      case "primary":
        return colors.primary;
      case "danger":
        return colors.danger;
      case "cream":
        return colors.cream;
      case "secondary":
        return colors.surfaceElevated;
      case "outline":
      case "ghost":
        return "transparent";
      default:
        return colors.primary;
    }
  };

  const getTextColor = () => {
    if (disabled) return colors.textMuted;
    switch (variant) {
      case "primary":
      case "danger":
      case "secondary":
        return colors.white;
      case "cream":
        return colors.background;
      case "outline":
        return colors.primary;
      case "ghost":
        return colors.textSecondary;
      default:
        return colors.white;
    }
  };

  const getBorderColor = () => {
    if (disabled) return "transparent";
    switch (variant) {
      case "outline":
        return colors.primary;
      case "secondary":
        return colors.border;
      case "ghost":
        return "transparent";
      default:
        return "transparent";
    }
  };

  const getPadding = () => {
    switch (size) {
      case "sm":
        return { paddingVertical: 10, paddingHorizontal: 16 };
      case "lg":
        return { paddingVertical: 16, paddingHorizontal: 26 };
      case "md":
      default:
        return { paddingVertical: 14, paddingHorizontal: 20 };
    }
  };

  const renderIcon = (iconColor: string) => {
    if (!icon) return null;
    if (typeof icon === "string") {
      const iconSize = size === "lg" ? 20 : size === "sm" ? 14 : 16;
      return (
        <View style={styles.iconWrap}>
          <Ionicons name={icon as any} size={iconSize} color={iconColor} />
        </View>
      );
    }
    if (React.isValidElement(icon)) {
      return <View style={styles.iconWrap}>{icon}</View>;
    }
    return null;
  };

  const textColor = getTextColor();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        getPadding(),
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: variant === "outline" || variant === "secondary" ? 1 : 0,
        },
        !disabled && variant === "primary" && shadows.glowPrimary,
        !disabled && variant === "danger" && shadows.glowDanger,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {renderIcon(textColor)}
          <Text
            style={[
              typography.button,
              { color: textColor },
              size === "lg" && { fontSize: 16 },
              size === "sm" && { fontSize: 13 },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function PrimaryButton(props: ButtonProps) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: ButtonProps) {
  return <Button {...props} variant="secondary" />;
}

export function DangerButton(props: ButtonProps) {
  return <Button {...props} variant="danger" />;
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    marginRight: 8,
  },
});
