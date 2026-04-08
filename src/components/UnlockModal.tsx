import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { unlock } from '../lib/session';

interface Props {
  onUnlock: () => void;
}

export function UnlockModal({ onUnlock }: Props) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('パスワードを入力してください');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const success = await unlock(password);
      if (success) {
        onUnlock();
      } else {
        setError('パスワードが違います');
        setPassword('');
      }
    } catch {
      setError('エラーが発生しました');
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div 
        className="relative rounded-2xl shadow-xl w-full max-w-sm"
        style={{ backgroundColor: '#faf7f0', border: '1px solid #d5c9a8' }}
      >
        <span className="absolute top-2.5 left-2.5 w-4 h-4 border-t border-l border-sebastian-gold/30 pointer-events-none rounded-tl-sm" />
        <span className="absolute top-2.5 right-2.5 w-4 h-4 border-t border-r border-sebastian-gold/30 pointer-events-none rounded-tr-sm" />
        <span className="absolute bottom-2.5 left-2.5 w-4 h-4 border-b border-l border-sebastian-gold/30 pointer-events-none rounded-bl-sm" />
        <span className="absolute bottom-2.5 right-2.5 w-4 h-4 border-b border-r border-sebastian-gold/30 pointer-events-none rounded-br-sm" />

        <div className="p-6">
          <div className="flex items-center justify-center mb-4">
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(201,164,86,0.1)', border: '1px solid rgba(201,164,86,0.3)' }}
            >
              <Lock size={24} style={{ color: '#c9a456' }} />
            </div>
          </div>

          <h2 className="font-serif text-sebastian-navy text-xl text-center mb-2">
            ロック解除
          </h2>
          <p className="text-sm text-sebastian-lightgray text-center mb-6 font-serif">
            マスターパスワードを入力してください
          </p>

          <form onSubmit={handleSubmit}>
            <div className="relative mb-3">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード"
                disabled={isLoading}
                autoFocus
                className="w-full px-4 py-3 pr-10 rounded-lg text-sm font-serif text-sebastian-text bg-white border border-sebastian-border/50 focus:outline-none focus:border-sebastian-gold/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sebastian-lightgray/50 hover:text-sebastian-lightgray transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-600 text-center mb-3 font-serif">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="w-full py-3 rounded-lg text-sm font-serif transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                backgroundColor: '#131929', 
                color: '#d4c9a8', 
                border: '1px solid rgba(201,164,86,0.3)' 
              }}
            >
              {isLoading ? '検証中...' : 'ロック解除'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}