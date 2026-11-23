import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { copyText } from "../utils/clipboard";
import { providerWebPageUrl } from "../utils/providerProfileLink";
import { isDarkColor } from '../constants/providerThemes';

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
  const pageUrl = providerWebPageUrl(providerSlug);
  // Printed under the code, so a screenshot or print of the card still says
  // where it goes and can be typed in. The bare domain redirects to www.
  const printedLink = pageUrl.replace(/^https:\/\/(www\.)?/, "");
  const share = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await Share.share({
      title: `${providerName} on CERVICED`,
      message: `${providerName} on CERVICED: ${pageUrl}`,
      url: pageUrl,
    });
  }, [pageUrl, providerName]);

  // Copy link: the row shows "Copied" for a moment, then the link again. A
  // build without the clipboard module opens the share sheet instead, which
  // has its own Copy.
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);
  useEffect(() => {
    if (!visible) setCopied(false);
  }, [visible]);
  const copyLink = useCallback(async () => {
    if (!(await copyText(pageUrl))) {
      await share();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [pageUrl, share]);

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
              ? `Anyone can scan this with their phone camera to open your page.`
              : "This code starts working once your profile is live."}
          </Text>
          <View
            style={styles.qrFrame}
            accessible
            accessibilityLabel={`QR code for ${providerName}'s CERVICED profile, ${printedLink}`}
          >
            <QRCode
              value={pageUrl}
              size={220}
              color="#171411"
              backgroundColor="#FFFFFF"
              ecl="M"
            />
            <Text style={styles.qrLink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {printedLink}
            </Text>
          </View>
          <Text style={[styles.hint, { color: subtextColor }]}>
            Keep it by your chair, on a card, or at your front desk.
          </Text>
          <TouchableOpacity
            style={[styles.linkRow, { borderColor }]}
            onPress={() => void copyLink()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={copied ? "Link copied" : "Copy link"}
          >
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={17} color={accentColor} />
            <Text style={[styles.linkActionText, { color: accentColor }]}>{copied ? "COPIED" : "COPY LINK"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: accentColor }]}
            onPress={() => void share()}
            activeOpacity={0.85}
          >
            <Ionicons name="share-outline" size={18} color={isDarkColor(accentColor) ? '#FFFFFF' : '#1B2740'} />
            <Text style={[styles.shareText, { color: isDarkColor(accentColor) ? '#FFFFFF' : '#1B2740' }]}>SHARE PROFILE LINK</Text>
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
  // Always dark on the card's white, whatever the sheet's theme, like the code.
  qrLink: {
    maxWidth: 220,
    marginTop: 12,
    color: "#171411",
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    gap: 8,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 15,
    marginTop: 18,
  },
  linkActionText: { fontFamily: "BakbakOne-Regular", fontSize: 14, letterSpacing: 0.5 },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    minHeight: 50,
    borderRadius: 15,
    marginTop: 12,
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
