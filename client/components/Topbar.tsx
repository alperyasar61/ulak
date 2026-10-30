import { CircleHelp } from "lucide-react";
import { navigation, type Tab } from "../navigation";

export function Topbar({ tab, onHelp }: { tab: Tab; onHelp: () => void }) {
  const label = tab === "overview" ? "Çalışma masası" : navigation.find((item) => item.id === tab)?.label ?? "Veri ve gizlilik";

  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <span>ULAK</span>
        <span className="crumb-slash">/</span>
        <span>{label}</span>
      </div>
      <div className="topbar-right">
        <span className="local-only">
          <span /> İŞLEMLER KONTROLLÜ
        </span>
        <button className="help-button" onClick={onHelp}>
          <CircleHelp size={17} />
          <span>Nasıl çalışır?</span>
        </button>
        <div className="avatar">U</div>
      </div>
    </header>
  );
}
