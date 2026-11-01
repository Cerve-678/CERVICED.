import React, { useCallback } from "react";
import {
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { providerProfileDeepLink } from "../utils/providerProfileDeepLink";

type Props = {
  visible: boolean;
  providerSlug: string;
  providerName: string;
  /** Clients can't open a profile that isn't live, so don't promise they can. */
  isLive: boolean;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  subtextColor: string;
  borderColor: string;
  onClose: () => void;
};

/** Provider-owned, print-friendly QR for their public in-app profile. */
export function ProviderProfileQrSheet({
  visible,
  providerSlug,
  providerName,
  isLive,
  accentColor,
  backgroundColor,
  textColor,
  subtextColor,
  borderColor,
  onClose,
}: Props) {
  const deepLink = providerProfileDeepLink(providerSlug);
  const share = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await Share.share({
      title: `${providerName} on CERVICED`,
      message: `Open ${providerName}'s profile in CERVICED: ${deepLink}`,
      url: deepLink,
    });
  }, [deepLink, providerName]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor, borderColor }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: borderColor }]} />
          <View style={[styles.icon, { backgroundColor: `${accentColor}1F` }]}>
            <Ionicons name="qr-code-outline" size={23} color={accentColor} />
          </View>
          <Text style={[styles.title, { color: textColor }]}>
            Your profile QR
          </Text>
          <Text style={[styles.copy, { color: subtextColor }]}>
            {isLive
              ? `Clients with the CERVICED app can scan this to open ${providerName}.`
              : "This code starts working once your profile is live."}
          </Text>
          <View
            style={styles.qrFrame}
            accessible
            accessibilityLabel={`QR code for ${providerName}'s CERVICED profile`}
          >
            <QRCode
              value={deepLink}
              size={220}
              color="#171411"
              backgroundColor="#FFFFFF"
              ecl="M"
            />
          </View>
          <Text style={[styles.hint, { color: subtextColor }]}>
            Keep it by your chair, on a card, or at your front desk.
          </Text>
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: accentColor }]}
            onPress={() => void share()}
            activeOpacity={0.85}
          >
            <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            <Text style={styles.shareText}>SHARE PROFILE LINK</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={[styles.closeText, { color: textColor }]}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.46)",
  },
  sheet: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: { width: 38, height: 4, borderRadius: 2, marginBottom: 18 },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontFamily: "BakbakOne-Regular", fontSize: 23 },
  copy: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 300,
  },
  qrFrame: {
    marginTop: 22,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  hint: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 16,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    minHeight: 50,
    borderRadius: 15,
    marginTop: 22,
  },
  shareText: {
    color: "#FFFFFF",
    fontFamily: "BakbakOne-Regular",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  closeButton: { paddingVertical: 16, paddingHorizontal: 24, marginTop: 2 },
  closeText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 14,
    fontWeight: "800",
  },
});
