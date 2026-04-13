import { useState } from 'react';
import { CloudCog } from 'lucide-react';
import { format } from 'date-fns';
import { s3Push, s3Pull } from '../lib/s3sync';
import type { ConflictDetails } from '../lib/s3sync';

interface Props {
  details: ConflictDetails;
  onResolved: () => void;
}

function formatUnixSec(unixSec: number): string {
  return format(new Date(unixSec * 1000), 'yyyy-MM-dd HH:mm:ss');
}

export function S3ConflictModal({ details, onResolved }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUseLocal = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await s3Push();
      onResolved();
    } catch (e) {
      setError(`アップロードに失敗しました: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseRemote = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // s3Pull内でwindow.location.reload()が呼ばれるためonResolvedは不要
      await s3Pull();
    } catch (e) {
      setError(`ダウンロードに失敗しました: ${e}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div
        className="relative rounded-2xl shadow-xl w-full max-w-md"
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
              <CloudCog size={24} style={{ color: '#c9a456' }} />
            </div>
          </div>

          <h2 className="font-serif text-sebastian-navy text-xl text-center mb-2">
            データの競合を検出しました
          </h2>
          <p className="text-sm text-sebastian-lightgray text-center mb-5 font-serif">
            ローカルとクラウドのデータが異なります。どちらを使用しますか？
          </p>

          {/* タイムスタンプ比較 */}
          <div className="rounded-lg mb-4 overflow-hidden" style={{ border: '1px solid #d5c9a8' }}>
            <div className="flex">
              <div className="flex-1 p-3 text-center" style={{ borderRight: '1px solid #d5c9a8' }}>
                <p className="text-xs text-sebastian-lightgray font-serif mb-1">ローカル</p>
                <p className="text-sm font-serif text-sebastian-navy font-medium">
                  {formatUnixSec(details.localMtime)}
                </p>
              </div>
              <div className="flex-1 p-3 text-center">
                <p className="text-xs text-sebastian-lightgray font-serif mb-1">クラウド（S3）</p>
                <p className="text-sm font-serif text-sebastian-navy font-medium">
                  {details.remoteMtime !== null
                    ? formatUnixSec(details.remoteMtime)
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* 警告 */}
          <p className="text-xs text-amber-700 text-center mb-5 font-serif bg-amber-50 rounded-lg py-2 px-3">
            ⚠️ この操作は元に戻せません。選択前にご確認ください。
          </p>

          {error && (
            <p className="text-sm text-red-600 text-center mb-3 font-serif">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleUseLocal}
              disabled={isLoading}
              className="flex-1 py-3 rounded-lg text-sm font-serif transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: '#131929',
                color: '#d4c9a8',
                border: '1px solid rgba(201,164,86,0.3)',
              }}
            >
              {isLoading ? '処理中...' : 'ローカルを使用\n（S3へアップロード）'}
            </button>
            <button
              onClick={handleUseRemote}
              disabled={isLoading}
              className="flex-1 py-3 rounded-lg text-sm font-serif transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: '#faf7f0',
                color: '#131929',
                border: '1px solid #d5c9a8',
              }}
            >
              {isLoading ? '処理中...' : 'クラウドを使用\n（S3からダウンロード）'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
