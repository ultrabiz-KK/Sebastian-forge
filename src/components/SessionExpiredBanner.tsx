import { useState, useEffect, useRef } from 'react';
import { isUnlocked, unlock } from '../lib/session';
import { getSetting, SETTING_KEYS } from '../lib/settings';

/**
 * AI呼び出し時にセッション期限切れを検知した場合、
 * このイベントをdispatchしてバナーを緊急モード（赤）に切り替える。
 */
export const SESSION_EXPIRED_URGENT_EVENT = 'session-expired-urgent';

export function triggerSessionExpiredUrgent(): void {
  window.dispatchEvent(new Event(SESSION_EXPIRED_URGENT_EVENT));
}

export function SessionExpiredBanner() {
  const [visible, setVisible] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const checkVisibility = async () => {
    const hash = await getSetting(SETTING_KEYS.MASTER_PASSWORD_HASH);
    if (!hash) {
      setVisible(false);
      return;
    }
    const unlocked = isUnlocked();
    setVisible(!unlocked);
    // 再ロック解除されたらurgentも解除
    if (unlocked) setUrgent(false);
  };

  useEffect(() => {
    checkVisibility();
    // 1分ごとにポーリングして期限切れを自動検知
    const interval = setInterval(checkVisibility, 60_000);

    const handleUrgent = () => {
      setUrgent(true);
      checkVisibility();
    };
    window.addEventListener(SESSION_EXPIRED_URGENT_EVENT, handleUrgent);

    return () => {
      clearInterval(interval);
      window.removeEventListener(SESSION_EXPIRED_URGENT_EVENT, handleUrgent);
    };
  }, []);

  // バナーが表示されたらパスワード入力欄にフォーカス
  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    setError('');
    try {
      const success = await unlock(password);
      if (success) {
        setPassword('');
        setUrgent(false);
        setVisible(false);
      } else {
        setError('パスワードが違います');
      }
    } catch {
      setError('認証に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const urgentStyle = {
    backgroundColor: 'rgba(180,30,30,0.10)',
    borderColor: 'rgba(200,50,50,0.50)',
    color: '#8b1a1a',
  };
  const normalStyle = {
    backgroundColor: 'rgba(201,164,86,0.12)',
    borderColor: 'rgba(201,164,86,0.40)',
    color: 'var(--color-sebastian-gold-dark, #a07c30)',
  };

  return (
    <div
      className="flex items-center justify-center gap-3 px-4 py-2 text-sm font-serif border-b"
      style={urgent ? urgentStyle : normalStyle}
      role="alert"
      aria-live="polite"
    >
      <span className="text-[10px]">◆</span>
      <span className="shrink-0">
        {urgent
          ? 'AI呼び出しがブロックされました — セッションが期限切れです。再認証してください。'
          : 'セッションが期限切れです。マスターパスワードを入力して再認証してください。'}
      </span>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 ml-2">
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="マスターパスワード"
          className="px-2 py-0.5 text-sm rounded border font-serif bg-white/60 focus:outline-none focus:ring-1"
          style={{
            borderColor: urgent ? 'rgba(200,50,50,0.50)' : 'rgba(201,164,86,0.50)',
            color: 'var(--color-sebastian-text)',
            minWidth: '180px',
          }}
          disabled={loading}
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={loading || !password}
          className="px-3 py-0.5 rounded text-sm font-serif transition-opacity disabled:opacity-40"
          style={{
            backgroundColor: urgent ? 'rgba(200,50,50,0.80)' : 'rgba(201,164,86,0.80)',
            color: '#fff',
          }}
        >
          {loading ? '認証中…' : '再認証'}
        </button>
        {error && (
          <span className="text-[11px]" style={{ color: '#8b1a1a' }}>
            {error}
          </span>
        )}
      </form>

      <span className="text-[10px]">◆</span>
    </div>
  );
}
