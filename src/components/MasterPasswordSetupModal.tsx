import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, X, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getSetting, setSetting, SETTING_KEYS } from '../lib/settings';
import { unlock, lock } from '../lib/session';

interface Props {
  onClose: () => void;
  onPasswordSet?: () => void;
}

type Step = 'setup' | 'change_confirm' | 'change_set' | 'delete_confirm';

export function MasterPasswordSetupModal({ onClose, onPasswordSet }: Props) {
  const [step, setStep] = useState<Step>('setup');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    getSetting(SETTING_KEYS.MASTER_PASSWORD_HASH).then(hash => {
      setHasPassword(!!hash);
    });
  }, []);

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) return 'パスワードは8文字以上で入力してください';
    return null;
  };

  const handleSetup = async () => {
    setError(null);
    setSuccess(null);

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    setLoading(true);
    try {
      const hash = await invoke<string>('hash_password', { password: newPassword });
      await setSetting(SETTING_KEYS.MASTER_PASSWORD_HASH, hash);
      await unlock(newPassword);
      setSuccess('マスターパスワードを設定しました');
      onPasswordSet?.();
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : '設定に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCurrentPassword = async () => {
    setError(null);
    setLoading(true);
    try {
      const hash = await getSetting(SETTING_KEYS.MASTER_PASSWORD_HASH);
      if (!hash) {
        setError('マスターパスワードが設定されていません');
        setLoading(false);
        return;
      }
      const valid = await invoke<boolean>('verify_password', { password: currentPassword, hash });
      if (valid) {
        setStep('change_set');
        setCurrentPassword('');
      } else {
        setError('現在のパスワードが正しくありません');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '検証に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeConfirm = async () => {
    setError(null);
    setSuccess(null);

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    setLoading(true);
    try {
      const hash = await invoke<string>('hash_password', { password: newPassword });
      await setSetting(SETTING_KEYS.MASTER_PASSWORD_HASH, hash);
      await unlock(newPassword);
      setSuccess('パスワードを変更しました');
      onPasswordSet?.();
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : '変更に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await setSetting(SETTING_KEYS.MASTER_PASSWORD_HASH, '');
      lock();
      setSuccess('マスターパスワードを削除しました。暗号化設定は復号できなくなります。');
      onPasswordSet?.();
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const clearState = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
  };

  const renderSetup = () => (
    <>
      <p className="text-sm text-sebastian-gray font-serif mb-4">
        マスターパスワードを設定すると、APIキーなどの機密情報を暗号化して保存できます。
      </p>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">パスワード</label>
          <div className="flex gap-2">
            <input
              type={showNewPassword ? 'text' : 'password'}
              className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors font-mono"
              placeholder="8文字以上"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="px-3 text-sebastian-lightgray hover:text-gray-600 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg transition-colors"
            >
              {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">確認用パスワード</label>
          <div className="flex gap-2">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors font-mono"
              placeholder="もう一度入力"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="px-3 text-sebastian-lightgray hover:text-gray-600 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg transition-colors"
            >
              {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-4">
        <button
          onClick={handleSetup}
          disabled={loading || !newPassword || !confirmPassword}
          className="flex-1 py-2.5 rounded-lg text-sm font-serif transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#131929', color: '#d4c9a8', border: '1px solid rgba(201,164,86,0.3)' }}
        >
          {loading ? '設定中...' : '設定する'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2.5 rounded-lg bg-gray-100 text-sebastian-gray hover:bg-gray-200 transition-colors text-sm"
        >
          キャンセル
        </button>
      </div>
    </>
  );

  const renderChangeConfirm = () => (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800 mb-4">
        セキュリティのため、パスワード変更には現在のパスワード確認が必要です。
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm text-sebastian-gray">現在のパスワード</label>
        <div className="flex gap-2">
          <input
            type={showCurrentPassword ? 'text' : 'password'}
            className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors font-mono"
            placeholder="現在のパスワード"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
            className="px-3 text-sebastian-lightgray hover:text-gray-600 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg transition-colors"
          >
            {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <div className="flex gap-2 pt-4">
        <button
          onClick={handleVerifyCurrentPassword}
          disabled={loading || !currentPassword}
          className="flex-1 py-2.5 rounded-lg text-sm font-serif transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#131929', color: '#d4c9a8', border: '1px solid rgba(201,164,86,0.3)' }}
        >
          {loading ? '確認中...' : '確認'}
        </button>
        <button
          onClick={() => { clearState(); setStep('setup'); }}
          className="px-4 py-2.5 rounded-lg bg-gray-100 text-sebastian-gray hover:bg-gray-200 transition-colors text-sm"
        >
          戻る
        </button>
      </div>
    </>
  );

  const renderChangeSet = () => (
    <>
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-xs text-green-800 mb-4">
        <span className="font-medium">✓</span> 現在のパスワードが確認できました。新しいパスワードを設定してください。
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">新しいパスワード</label>
          <div className="flex gap-2">
            <input
              type={showNewPassword ? 'text' : 'password'}
              className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors font-mono"
              placeholder="8文字以上"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="px-3 text-sebastian-lightgray hover:text-gray-600 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg transition-colors"
            >
              {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm text-sebastian-gray">確認用パスワード</label>
          <div className="flex gap-2">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors font-mono"
              placeholder="もう一度入力"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="px-3 text-sebastian-lightgray hover:text-gray-600 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg transition-colors"
            >
              {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-4">
        <button
          onClick={handleChangeConfirm}
          disabled={loading || !newPassword || !confirmPassword}
          className="flex-1 py-2.5 rounded-lg text-sm font-serif transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#131929', color: '#d4c9a8', border: '1px solid rgba(201,164,86,0.3)' }}
        >
          {loading ? '変更中...' : '変更する'}
        </button>
        <button
          onClick={() => { clearState(); setStep('setup'); }}
          className="px-4 py-2.5 rounded-lg bg-gray-100 text-sebastian-gray hover:bg-gray-200 transition-colors text-sm"
        >
          キャンセル
        </button>
      </div>
    </>
  );

  const renderDeleteConfirm = () => (
    <>
      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-800 mb-4">
        <p className="font-medium mb-1">⚠️ 警告</p>
        <p>マスターパスワードを削除すると、暗号化された設定は復号できなくなります。</p>
        <p className="mt-1">引き続きアプリは使用できますが、暗号化設定（APIキーなど）は再入力が必要です。</p>
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm text-sebastian-gray">現在のパスワード</label>
        <div className="flex gap-2">
          <input
            type={showCurrentPassword ? 'text' : 'password'}
            className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm outline-none focus:border-sebastian-gold/50 transition-colors font-mono"
            placeholder="確認のためパスワードを入力"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
            className="px-3 text-sebastian-lightgray hover:text-gray-600 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg transition-colors"
          >
            {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <div className="flex gap-2 pt-4">
        <button
          onClick={handleDelete}
          disabled={loading || !currentPassword}
          className="flex-1 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {loading ? '削除中...' : '削除する'}
        </button>
        <button
          onClick={() => { clearState(); setStep('setup'); }}
          className="px-4 py-2.5 rounded-lg bg-gray-100 text-sebastian-gray hover:bg-gray-200 transition-colors text-sm"
        >
          キャンセル
        </button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="relative rounded-2xl shadow-xl w-full max-w-md" style={{ backgroundColor: '#faf7f0', border: '1px solid #d5c9a8' }}>
        <span className="absolute top-2.5 left-2.5 w-4 h-4 border-t border-l border-sebastian-gold/30 pointer-events-none rounded-tl-sm" />
        <span className="absolute top-2.5 right-2.5 w-4 h-4 border-t border-r border-sebastian-gold/30 pointer-events-none rounded-tr-sm" />
        <span className="absolute bottom-2.5 left-2.5 w-4 h-4 border-b border-l border-sebastian-gold/30 pointer-events-none rounded-bl-sm" />
        <span className="absolute bottom-2.5 right-2.5 w-4 h-4 border-b border-r border-sebastian-gold/30 pointer-events-none rounded-br-sm" />

        <div className="p-6 border-b border-sebastian-border/50 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(201,164,86,0.1)', border: '1px solid rgba(201,164,86,0.3)' }}>
              <Lock size={18} style={{ color: '#c9a456' }} />
            </div>
            <div>
              <h2 className="font-serif text-sebastian-navy text-lg">
                {step === 'setup' && 'マスターパスワード'}
                {step === 'change_confirm' && 'パスワード変更'}
                {step === 'change_set' && '新しいパスワード'}
                {step === 'delete_confirm' && 'パスワード削除'}
              </h2>
              <p className="text-xs text-sebastian-lightgray mt-0.5 font-serif">
                {step === 'setup' && 'セキュリティ設定'}
                {step === 'change_confirm' && '現在のパスワードを確認'}
                {step === 'change_set' && '新しいパスワードを設定'}
                {step === 'delete_confirm' && '確認して削除'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-sebastian-lightgray/50 hover:text-sebastian-lightgray transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {step === 'setup' && hasPassword && (
            <div className="flex items-center gap-2 px-3 py-2 bg-sebastian-parchment/50 rounded-lg border border-sebastian-border/40 mb-4">
              <CheckCircle size={14} className="text-green-600" />
              <span className="text-xs text-sebastian-gray">マスターパスワードは設定済みです</span>
            </div>
          )}

          {step === 'setup' && !hasPassword && renderSetup()}
          {step === 'setup' && hasPassword && (
            <div className="space-y-3">
              <button
                onClick={() => { clearState(); setStep('change_confirm'); }}
                className="w-full py-2.5 rounded-lg text-sm font-serif transition-colors"
                style={{ backgroundColor: '#131929', color: '#d4c9a8', border: '1px solid rgba(201,164,86,0.3)' }}
              >
                パスワードを変更
              </button>
              <button
                onClick={() => { clearState(); setStep('delete_confirm'); }}
                className="w-full py-2.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-sm font-serif border border-red-200 flex items-center justify-center gap-2"
              >
                <Trash2 size={14} />
                パスワードを削除（機能を無効化）
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-lg bg-gray-100 text-sebastian-gray hover:bg-gray-200 transition-colors text-sm"
              >
                閉じる
              </button>
            </div>
          )}

          {step === 'change_confirm' && renderChangeConfirm()}
          {step === 'change_set' && renderChangeSet()}
          {step === 'delete_confirm' && renderDeleteConfirm()}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5 text-sm text-green-700">
              <CheckCircle size={15} className="flex-shrink-0 mt-0.5" />
              {success}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}