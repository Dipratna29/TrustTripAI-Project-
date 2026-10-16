import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import CosmicBackground from "../components/common/CosmicBackground";
import ScreenHeader from "../components/common/ScreenHeader";
import AppIcon from "../components/common/AppIcon";
import { colors, typography, radius, spacing } from "../theme";

type Message = {
  id: string;
  text: string;
  sender: "user" | "bot";
  time: string;
};

const getTime = () => {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")} ${
    d.getHours() >= 12 ? "PM" : "AM"
  }`;
};

const SUGGESTIONS = [
  "Travel safety tips",
  "Local safe places",
  "Emergency help",
  "Fair pricing advice",
];

export default function ChatBotScreen() {
  const navigation = useNavigation<any>();
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<Message[]>([
    {
      id: "1",
      text: "Hello! I am your TrustTrip AI Safety Assistant. How can I help secure your journey today?",
      sender: "bot",
      time: getTime(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = (textToSend?: string) => {
    const txt = (textToSend || message).trim();
    if (!txt) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: txt,
      sender: "user",
      time: getTime(),
    };
    setChat((prev) => [...prev, userMsg]);
    setMessage("");
    setIsTyping(true);

    let botReply = "I'm analyzing safety intelligence for your destination. Stay alert and keep your emergency contacts updated.";
    const lower = txt.toLowerCase();

    if (lower.includes("safety") || lower.includes("tip")) {
      botReply = "Always keep your GPS telemetry active in TrustTrip. When navigating unfamiliar tourist hubs, stay on well-lit main routes and monitor crowd density in the Crowd Radar.";
    } else if (lower.includes("police") || lower.includes("emergency")) {
      botReply = "For immediate authority dispatch, tap the Emergency SOS button or dial 112 directly. Your live coordinates will be transmitted instantly.";
    } else if (lower.includes("price") || lower.includes("fair")) {
      botReply = "You can use the Fair Price Check tool in Traveler Services to compare local taxi rates, handicraft pricing, and avoid tourist markups.";
    } else if (lower.includes("hotel") || lower.includes("place")) {
      botReply = "Check the Women Safety section for verified safe havens, CCTV-equipped rest stations, and 24/7 tourist help posts.";
    }

    setTimeout(() => {
      const botMsg: Message = {
        id: Date.now().toString() + "_bot",
        text: botReply,
        sender: "bot",
        time: getTime(),
      };
      setChat((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 800);
  };

  return (
    <CosmicBackground>
      <ScreenHeader
        title="AI Safety Assistant"
        subtitle="24/7 travel advice & safety intelligence"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <View style={styles.onlineBadge}>
            <View style={styles.greenDot} />
            <Text style={styles.onlineText}>ONLINE</Text>
          </View>
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        {/* CHAT MESSAGES */}
        <FlatList
          ref={flatListRef}
          data={chat}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chatList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isUser = item.sender === "user";
            return (
              <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowBot]}>
                {!isUser && (
                  <View style={styles.botIconWrap}>
                    <AppIcon name="sparkles" size={16} color={colors.primary} />
                  </View>
                )}
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
                  <Text style={[styles.bubbleText, isUser && styles.userBubbleText]}>
                    {item.text}
                  </Text>
                  <Text style={styles.timeText}>{item.time}</Text>
                </View>
              </View>
            );
          }}
        />

        {/* TYPING INDICATOR */}
        {isTyping && (
          <View style={styles.typingRow}>
            <AppIcon name="sparkles" size={14} color={colors.primary} />
            <Text style={styles.typingText}>TrustTrip AI is thinking...</Text>
          </View>
        )}

        {/* SUGGESTED PROMPTS */}
        <View style={styles.suggestionsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScroll}>
            {SUGGESTIONS.map((sugg, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.suggestionChip}
                onPress={() => sendMessage(sugg)}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestionText}>{sugg}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* INPUT BAR */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask AI safety assistant..."
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !message.trim() && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!message.trim()}
            activeOpacity={0.8}
          >
            <AppIcon name="send" size={16} color={colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${colors.primary}18`,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    gap: 5,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  onlineText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  chatList: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    paddingBottom: 16,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 14,
    alignItems: "flex-end",
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  messageRowBot: {
    justifyContent: "flex-start",
  },
  botIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.card,
  },
  userBubble: {
    backgroundColor: "#00C292",
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  bubbleText: {
    ...typography.body,
    fontSize: 14,
    color: "#0F172A",
    lineHeight: 20,
  },
  userBubbleText: {
    color: "#FFFFFF",
  },
  timeText: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 4,
    textAlign: "right",
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 8,
  },
  typingText: {
    ...typography.caption,
    color: colors.primary,
    fontSize: 11,
  },
  suggestionsContainer: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestionsScroll: {
    paddingHorizontal: spacing.screenPadding,
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.lightBackground,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
