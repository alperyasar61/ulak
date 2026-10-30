export function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="page-intro">
      <div className="eyebrow">
        <span className="signal-line" /> {eyebrow}
      </div>
      <h1>{title}</h1>
      <p>{copy}</p>
    </div>
  );
}
