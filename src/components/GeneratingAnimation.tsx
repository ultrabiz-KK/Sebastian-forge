import { useEffect, useState } from 'react';

// ─── 羽根ペン画像 ──────────────────────────────────────────────
// 画像サイズ: 538×993px（余白トリム済み透過PNG）
// 表示: 高さ180px → 幅98px
// ペン先位置: 左約47%・下約2% → left:46px / bottom:2px

function QuillPen() {
  return (
    <div
      className="quill-rock"
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <img
        src="/quill-pen.png"
        alt=""
        aria-hidden="true"
        style={{ height: '180px', width: 'auto', display: 'block' }}
        draggable={false}
      />
    </div>
  );
}

// ─── 順番に入れ替わるサブメッセージ ────────────────────────────

const DAILY_MESSAGES = [
  'ペンを走らせております...',
  '言葉を選んでおります...',
  '本日の記録を整えております...',
  'もう少しお待ちくださいませ...',
  '丁寧に仕上げております...',
];

const WEEKLY_MESSAGES = [
  '今週の記録をひも解いております...',
  '言葉を選んでおります...',
  '1週間を振り返っております...',
  'もう少しお待ちくださいませ...',
  '丁寧にまとめております...',
];

// ─── メインコンポーネント ─────────────────────────────────────

interface Props {
  reportType: 'daily' | 'weekly';
}

export function GeneratingAnimation({ reportType }: Props) {
  const messages = reportType === 'daily' ? DAILY_MESSAGES : WEEKLY_MESSAGES;
  const mainLabel = reportType === 'daily'
    ? 'セバスチャンが日報案を整えています'
    : 'セバスチャンが週報案を整えています';

  const [msgIdx, setMsgIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // フェードアウト → テキスト更新 → フェードイン
      setVisible(false);
      setTimeout(() => {
        setMsgIdx(i => (i + 1) % messages.length);
        setVisible(true);
      }, 300);
    }, 2800);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="py-14 flex flex-col items-center gap-9">

      {/* 羽根ペン + インク滴 */}
      <QuillPen />

      {/* 手書き風ライン（パーチメント上に文字が刻まれるイメージ） */}
      <div className="flex flex-col gap-3" style={{ width: '176px' }}>
        <div className="write-line" />
        <div className="write-line" />
        <div className="write-line" />
      </div>

      {/* テキスト */}
      <div className="text-center space-y-2">
        <p className="text-sm font-serif text-sebastian-navy">{mainLabel}</p>
        <p
          className="text-xs font-serif text-sebastian-lightgray italic transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {messages[msgIdx]}
        </p>
      </div>

    </div>
  );
}
