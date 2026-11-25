import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { getImage, type Screen } from "../shared/walkthrough";
import { Tag } from "./bits";
import { alpha, type Colors, MONO, type PressState } from "./style";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] + "=" : "==";
  }
  return out;
}

function useShotUri(cwd: string, file: string | null) {
  const get = useRpc(getImage);
  return useQuery({
    queryKey: ["walkthrough-shot", cwd, file],
    enabled: !!file,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      const bytes = await get({ cwd, file: file! });
      const mime = file!.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      const uri = `data:${mime};base64,${base64(bytes)}`;
      const size = await new Promise<{ width: number; height: number }>((resolve) =>
        Image.getSize(
          uri,
          (width, height) => resolve({ width, height }),
          () => resolve({ width: 16, height: 10 }),
        ),
      );
      return { uri, ...size };
    },
  });
}

/** Desktop captures are mostly margins on the sides: zoom in so the content is legible. */
const ZOOM = (imageWidth: number) => (imageWidth >= 1000 ? 1.6 : 1);

export const STATUS_LABEL = { new: "Nouveau", changed: "Modifié", removed: "Supprimé" } as const;

export function statusColor(colors: Colors, status: Screen["status"]): string {
  if (status === "new") return colors.statusSuccess;
  if (status === "removed") return colors.statusDanger;
  return colors.accent;
}

/** The top of a capture, zoomed on its centre and cropped to a fixed height: a thumbnail for cards. */
export function ShotThumb(props: { colors: Colors; cwd: string; screen: Screen; height: number; pending: boolean }) {
  const { colors, screen } = props;
  const file = screen.shot?.desktop ?? screen.shot?.mobile ?? null;
  const shot = useShotUri(props.cwd, file);
  const [width, setWidth] = useState(0);
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: props.height, overflow: "hidden", backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}
    >
      {shot.data && width > 0 ? (
        <Image
          source={{ uri: shot.data.uri }}
          style={{
            position: "absolute",
            top: 0,
            left: (width - width * ZOOM(shot.data.width)) / 2,
            width: width * ZOOM(shot.data.width),
            height: (width * ZOOM(shot.data.width) * shot.data.height) / shot.data.width,
          }}
        />
      ) : file || props.pending ? (
        <ActivityIndicator color={colors.foregroundMuted} />
      ) : (
        <View style={{ alignItems: "center", gap: 4, padding: 8 }}>
          <Icon name="ImageOff" size={18} color={colors.foregroundMuted} />
          <Text numberOfLines={2} style={{ color: colors.foregroundMuted, fontSize: 10.5, textAlign: "center" }}>
            {screen.shot?.error ?? "Pas de capture"}
          </Text>
        </View>
      )}
    </View>
  );
}

/** A screen as it appears in a step: what changed, where to look, and the capture. */
export function ScreenBlock(props: { colors: Colors; cwd: string; screen: Screen; pending: boolean; compact: boolean }) {
  const { colors, screen } = props;
  const hasDesktop = !!screen.shot?.desktop;
  const hasMobile = !!screen.shot?.mobile;
  const [viewport, setViewport] = useState<"desktop" | "mobile">(hasDesktop || !hasMobile ? "desktop" : "mobile");
  useEffect(() => {
    if (viewport === "desktop" && !hasDesktop && hasMobile) setViewport("mobile");
  }, [hasDesktop, hasMobile]);
  const file = viewport === "desktop" ? (screen.shot?.desktop ?? null) : (screen.shot?.mobile ?? null);
  const shot = useShotUri(props.cwd, file);
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const shownWidth = viewport === "mobile" ? Math.min(width, 390) : width;
  const fullHeight = shot.data ? (shownWidth * shot.data.height) / shot.data.width : 0;
  const cap = viewport === "mobile" ? 760 : Math.max(420, shownWidth * 0.7);
  const tooTall = fullHeight > cap * 1.15;

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface1 }}>
      <View style={{ padding: 12, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Tag colors={colors} label={STATUS_LABEL[screen.status]} color={statusColor(colors, screen.status)} />
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", flexShrink: 1 }}>{screen.title}</Text>
          <Text selectable style={{ color: colors.foregroundMuted, fontSize: 11.5, fontFamily: MONO }}>
            {screen.route}
          </Text>
          {screen.login ? <Tag colors={colors} icon="Lock" label="Connecté" /> : null}
        </View>
        {screen.change ? (
          <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>
            <Text style={{ fontWeight: "700" }}>Ce qui change : </Text>
            {screen.change}
          </Text>
        ) : null}
        {screen.lookAt ? (
          <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>
            <Text style={{ fontWeight: "700" }}>À regarder : </Text>
            {screen.lookAt}
          </Text>
        ) : null}
        {hasDesktop && hasMobile ? (
          <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
            {(["desktop", "mobile"] as const).map((v) => (
              <Pressable
                key={v}
                onPress={() => setViewport(v)}
                style={({ hovered }: PressState) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: viewport === v ? colors.accent : colors.border,
                  backgroundColor: viewport === v ? alpha(colors.accent, 0.12) : hovered ? colors.surface2 : "transparent",
                })}
              >
                <Icon name={v === "desktop" ? "Monitor" : "Smartphone"} size={13} color={colors.foreground} />
                <Text style={{ color: colors.foreground, fontSize: 12 }}>{v === "desktop" ? "Ordinateur" : "Mobile"}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ backgroundColor: colors.surface2, alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border }}
      >
        {file && shot.data && width > 0 ? (
          <>
            <View style={{ width: shownWidth, height: expanded || !tooTall ? fullHeight : cap, overflow: "hidden" }}>
              <Image source={{ uri: shot.data.uri }} style={{ width: shownWidth, height: fullHeight }} />
            </View>
            {tooTall ? (
              <Pressable
                onPress={() => setExpanded((v) => !v)}
                style={({ hovered }: PressState) => ({
                  alignSelf: "stretch",
                  alignItems: "center",
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  backgroundColor: hovered ? colors.surface1 : colors.surface2,
                })}
              >
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
                  {expanded ? "Réduire" : "Voir toute la page"}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : file || props.pending ? (
          <View style={{ height: 180, alignItems: "center", justifyContent: "center", gap: 8 }}>
            <ActivityIndicator color={colors.foregroundMuted} />
            <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>{props.pending ? "Capture en cours…" : "Chargement…"}</Text>
          </View>
        ) : (
          <View style={{ height: 110, alignItems: "center", justifyContent: "center", gap: 6, padding: 12 }}>
            <Icon name="ImageOff" size={18} color={colors.foregroundMuted} />
            <Text style={{ color: colors.foregroundMuted, fontSize: 12, textAlign: "center" }}>
              {screen.shot?.error ?? "Pas de capture pour cet écran."}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
