import type { LucideIcon } from "lucide-react";

export function Metric({
  label,
  value,
  note,
  icon: Icon,
  tone = "mint",
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: "mint" | "amber" | "blue";
}) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <div className="metric-head">
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}
