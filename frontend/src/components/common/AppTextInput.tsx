import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import AppIcon from "./AppIcon";
import { colors, typography, radius } from "../../theme";

export interface AppTextInputProps extends TextInputProps {
  label?: string;
  error?: string;
  helper?: string;
  leftIcon?: string;
  isPassword?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export default function AppTextInput({
  label,
  error,
  helper,
  leftIcon,
  isPassword = false,
  containerStyle,
  inputStyle,
  secureTextEntry,
  ...props
}: AppTextInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const showSecure = isPassword && !passwordVisible;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          Boolean(error) && styles.inputError,
        ]}
      >
        {leftIcon && (
          <View style={styles.leftIconWrap}>
            <AppIcon
              name={leftIcon}
              size={18}
              color={error ? colors.danger : isFocused ? colors.primary : colors.textMuted}
            />
          </View>
        )}

        <TextInput
          placeholderTextColor={colors.textMuted}
          secureTextEntry={showSecure}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[styles.input, inputStyle]}
          {...props}
        />

        {isPassword && (
          <TouchableOpacity
            onPress={() => setPasswordVisible((v) => !v)}
            style={styles.eyeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
          >
            <AppIcon
              name={passwordVisible ? "eye-off" : "eye"}
              size={18}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>

      {error ? (
        <View style={styles.messageRow}>
          <AppIcon name="alert-circle" size={13} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helperText}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    ...typography.label,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    height: 50,
    paddingHorizontal: 14,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceElevated,
  },
  inputError: {
    borderColor: colors.borderDanger,
  },
  leftIconWrap: {
    marginRight: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 6,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    fontSize: 12,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
});
