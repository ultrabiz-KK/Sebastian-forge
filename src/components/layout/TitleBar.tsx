import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Maximize2 } from 'lucide-react';

// モジュールスコープで一度だけ取得（レンダリングごとの再生成を避ける）
const appWindow = getCurrentWindow();

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  // 起動時の初期状態取得 + リサイズイベントで最大化状態を同期
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const init = async () => {
      // 初期状態
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);

      // ウィンドウのリサイズを監視して最大化アイコンを同期
      unlisten = await appWindow.onResized(async () => {
        const m = await appWindow.isMaximized();
        setIsMaximized(m);
      });
    };

    init().catch(console.warn);

    return () => {
      unlisten?.();
    };
  }, []);

  const handleMinimize = () => appWindow.minimize();

  const handleMaximize = async () => {
    const maximized = await appWindow.isMaximized();
    if (maximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  };

  const handleClose = () => appWindow.close();

  // タイトルバーダブルクリックで最大化トグル
  const handleDoubleClick = () => handleMaximize();

  return (
    <div
      className="titlebar-root"
      data-tauri-drag-region
      onDoubleClick={handleDoubleClick}
    >
      {/* 左: アプリ名 */}
      <div className="titlebar-left" data-tauri-drag-region>
        <div className="titlebar-icon" data-tauri-drag-region>
          <span>S</span>
        </div>
        <span className="titlebar-app-name" data-tauri-drag-region>
          Sebastian
        </span>
        <span className="titlebar-subtitle" data-tauri-drag-region>
          AI Work Supporter
        </span>
      </div>

      {/* 装飾ライン（中央） */}
      <div className="titlebar-ornament" data-tauri-drag-region>
        <span className="titlebar-ornament-line" />
        <span className="titlebar-ornament-diamond">◆</span>
        <span className="titlebar-ornament-line" />
      </div>

      {/* 右: ウィンドウ操作ボタン（ドラッグ領域外） */}
      <div className="titlebar-controls">
        <button
          id="titlebar-minimize"
          className="titlebar-btn"
          onClick={handleMinimize}
          onDoubleClick={(e) => e.stopPropagation()}
          title="最小化"
          aria-label="最小化"
        >
          <Minus size={11} />
        </button>
        <button
          id="titlebar-maximize"
          className="titlebar-btn"
          onClick={handleMaximize}
          onDoubleClick={(e) => e.stopPropagation()}
          title={isMaximized ? '元に戻す' : '最大化'}
          aria-label={isMaximized ? '元に戻す' : '最大化'}
        >
          {isMaximized ? <Square size={10} /> : <Maximize2 size={10} />}
        </button>
        <button
          id="titlebar-close"
          className="titlebar-btn titlebar-btn-close"
          onClick={handleClose}
          onDoubleClick={(e) => e.stopPropagation()}
          title="閉じる"
          aria-label="閉じる"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}
