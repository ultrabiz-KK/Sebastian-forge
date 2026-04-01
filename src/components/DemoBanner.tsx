export function DemoBanner() {
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 mb-6 text-sm font-serif"
      style={{
        backgroundColor: 'rgba(201,164,86,0.12)',
        border: '1px solid rgba(201,164,86,0.4)',
        color: 'var(--color-sebastian-gold-dark, #a07c30)',
      }}
    >
      <span className="text-[10px]">◆</span>
      <span>
        <strong>デモモード</strong> — 表示されているデータはサンプルです。実際のデータへの変更は行われません。
      </span>
      <span className="text-[10px]">◆</span>
    </div>
  );
}
