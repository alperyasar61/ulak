import { Activity, Globe2, Layers3, MessageSquare, Network, Radar, ShieldAlert } from "lucide-react";

export type Tab =
  | "overview"
  | "architecture"
  | "findings"
  | "proactive"
  | "research"
  | "roadmap"
  | "conversation"
  | "privacy";

export const navigation: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Genel bakış", icon: Activity },
  { id: "architecture", label: "Proje haritası", icon: Network },
  { id: "findings", label: "Bulgular", icon: ShieldAlert },
  { id: "proactive", label: "Proaktif Denetim", icon: Radar },
  { id: "research", label: "Canlı araştırma", icon: Globe2 },
  { id: "roadmap", label: "Yol haritası", icon: Layers3 },
  { id: "conversation", label: "Takip sohbeti", icon: MessageSquare },
];
