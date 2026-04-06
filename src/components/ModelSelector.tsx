/**
 * ModelSelector — プロバイダーのモデル一覧を取得してインクリメンタル検索で選択できるコンポーネント
 * モデル取得失敗時は手動テキスト入力にフォールバック
 */

import { useState, useEffect, useRef } from 'react';
import { getProvider, type ModelInfo } from '../lib/ai';

interface ModelSelectorProps {
  providerId: string;
  value: string;
  onChange: (model: string) => void;
  placeholder?: string;
}

export function ModelSelector({ providerId, value, onChange, placeholder }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!providerId || providerId === 'disabled') {
      setModels([]);
      return;
    }
    setLoading(true);
    getProvider(providerId)
      .then(p => p.listModels())
      .then(m => setModels(m))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, [providerId]);

  // リスト外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowList(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = search
    ? models.filter(m =>
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        m.name.toLowerCase().includes(search.toLowerCase())
      )
    : models;

  const handleSelect = (id: string) => {
    onChange(id);
    setShowList(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* テキスト入力（常時表示、datalistで補完） */}
      <div className="flex gap-1.5">
        <input
          type="text"
          className="flex-1 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-sebastian-gold/50 transition-colors"
          placeholder={placeholder ?? 'モデルIDを入力または選択'}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        {models.length > 0 && (
          <button
            type="button"
            onClick={() => setShowList(v => !v)}
            className="px-2.5 py-1.5 bg-sebastian-parchment/50 border border-sebastian-border rounded-lg text-xs text-sebastian-lightgray hover:text-sebastian-gray hover:bg-sebastian-parchment transition-colors"
            title="モデル一覧を表示"
          >
            {loading ? '…' : '▼'}
          </button>
        )}
      </div>

      {loading && (
        <p className="text-xs text-sebastian-lightgray mt-1">モデル一覧を取得中...</p>
      )}

      {/* ドロップダウン */}
      {showList && models.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-sebastian-border rounded-lg shadow-lg">
          {/* 検索ボックス */}
          <div className="p-1.5 border-b border-sebastian-border/40">
            <input
              type="text"
              autoFocus
              placeholder="モデルを検索..."
              className="w-full px-2.5 py-1.5 text-xs bg-sebastian-parchment/30 border border-sebastian-border/50 rounded outline-none focus:border-sebastian-gold/50 transition-colors"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* モデルリスト */}
          <ul className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-sebastian-lightgray">一致するモデルがありません</li>
            ) : (
              filtered.map(m => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(m.id)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-sebastian-parchment/50 ${
                      m.id === value
                        ? 'bg-sebastian-gold/10 text-sebastian-navy font-semibold'
                        : 'text-sebastian-text'
                    }`}
                  >
                    {m.name !== m.id ? (
                      <span>
                        <span className="font-medium">{m.name}</span>
                        <span className="ml-1.5 text-sebastian-lightgray font-mono text-[11px]">{m.id}</span>
                      </span>
                    ) : (
                      <span className="font-mono">{m.id}</span>
                    )}
                    {m.id === value && (
                      <span className="float-right text-sebastian-gold">✓</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
