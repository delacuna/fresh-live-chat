import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  FILTER_COUNT_KEY,
  type FilterMode,
  type DisplayMode,
  type GameProgress,
  type Settings,
} from '../shared/settings.js';
import type { KBGame } from '@spoilershield/knowledge-base';
import aceAttorney1 from '@kb-data/ace-attorney-1.json';

const GAMES: KBGame[] = [aceAttorney1 as unknown as KBGame];

// ─── 小コンポーネント ─────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      aria-checked={checked}
      role="switch"
      className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-white' : 'bg-indigo-400'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform ${
          checked ? 'translate-x-5 bg-indigo-600' : 'translate-x-0 bg-white'
        }`}
      />
    </button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-gray-100 last:border-b-0">
      <div className="text-xs font-medium text-gray-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-1.5 transition-colors ${
            i > 0 ? 'border-l border-gray-200' : ''
          } ${
            value === opt.value
              ? 'bg-indigo-600 text-white font-medium'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── 進行状況セレクター ────────────────────────────────────────────────

function ProgressSettings({
  game,
  progress,
  onChange,
}: {
  game: KBGame;
  progress: GameProgress;
  onChange: (p: GameProgress) => void;
}) {
  if (game.progress_type === 'chapter') {
    const chapters = game.chapters ?? [];
    return (
      <select
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-white"
        value={progress.currentChapterId ?? ''}
        onChange={(e) =>
          onChange({ ...progress, progressModel: 'chapter', currentChapterId: e.target.value })
        }
      >
        <option value="">-- 進行状況を選択 --</option>
        {chapters.map((ch) => (
          <option key={ch.id} value={ch.id}>
            {ch.title}
          </option>
        ))}
      </select>
    );
  }

  // event モデル
  const events = game.events ?? [];
  const completed = new Set(progress.completedEventIds ?? []);
  const toggleEvent = (id: string) => {
    const next = new Set(completed);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange({ ...progress, progressModel: 'event', completedEventIds: [...next] });
  };

  return (
    <div className="space-y-1 max-h-36 overflow-y-auto">
      {events.map((ev) => (
        <label key={ev.id} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={completed.has(ev.id)}
            onChange={() => toggleEvent(ev.id)}
            className="rounded border-gray-300 text-indigo-600"
          />
          <span>{ev.title}</span>
        </label>
      ))}
    </div>
  );
}

// ─── メインApp ────────────────────────────────────────────────────────

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [filterCount, setFilterCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // 起動時に設定とフィルタカウントをそれぞれのキーから読み込む
  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY, FILTER_COUNT_KEY], (result) => {
      setSettings({ ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] as Partial<Settings>) });
      setFilterCount((result[FILTER_COUNT_KEY] as number | undefined) ?? 0);
      setLoaded(true);
    });
  }, []);

  // ポップアップが開いている間も FILTER_COUNT_KEY の変化を反映する
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[FILTER_COUNT_KEY]) {
        setFilterCount((changes[FILTER_COUNT_KEY].newValue as number | undefined) ?? 0);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const update = (partial: Partial<Settings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    chrome.storage.local.set({ [STORAGE_KEY]: next });
  };

  const activeGame = GAMES.find((g) => g.id === settings.gameId) ?? GAMES[0];
  const activeProgress: GameProgress = settings.progressByGame[settings.gameId] ?? {
    progressModel: activeGame.progress_type,
  };

  if (!loaded) {
    return <div className="p-4 text-sm text-gray-400">読み込み中...</div>;
  }

  return (
    <div className="w-[300px] text-sm font-sans bg-white select-none">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white">
        <div>
          <div className="font-semibold text-base leading-tight">🛡 SpoilerShield</div>
          <div className="text-xs text-indigo-200 mt-0.5">
            {filterCount > 0
              ? `${filterCount}件のコメントをフィルタしました`
              : 'フィルタ待機中'}
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Toggle checked={settings.enabled} onChange={(v) => update({ enabled: v })} />
          <span className="text-xs text-indigo-200">{settings.enabled ? 'ON' : 'OFF'}</span>
        </div>
      </div>

      {/* 設定パネル（無効時は薄く表示） */}
      <div className={settings.enabled ? '' : 'opacity-40 pointer-events-none'}>
        {/* ゲーム選択 */}
        <Section label="ゲーム">
          <select
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-white"
            value={settings.gameId}
            onChange={(e) => update({ gameId: e.target.value })}
          >
            {GAMES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </Section>

        {/* 進行状況 */}
        <Section label="進行状況">
          <ProgressSettings
            game={activeGame}
            progress={activeProgress}
            onChange={(p) =>
              update({
                progressByGame: { ...settings.progressByGame, [settings.gameId]: p },
              })
            }
          />
        </Section>

        {/* フィルタ強度 */}
        <Section label="フィルタ強度">
          <SegmentedControl
            options={[
              { value: 'strict', label: '厳格' },
              { value: 'standard', label: '標準' },
              { value: 'lenient', label: '緩め' },
            ]}
            value={settings.filterMode}
            onChange={(v) => update({ filterMode: v as FilterMode })}
          />
          <p className="text-xs text-gray-400 mt-1.5">
            {settings.filterMode === 'strict' && 'ネタバレ・匂わせ・攻略ヒントをすべてブロック'}
            {settings.filterMode === 'standard' && 'ネタバレ・匂わせをブロック（デフォルト）'}
            {settings.filterMode === 'lenient' && '明示的なネタバレのみブロック'}
          </p>
        </Section>

        {/* 表示方式 */}
        <Section label="表示方式">
          <SegmentedControl
            options={[
              { value: 'placeholder', label: 'プレースホルダー' },
              { value: 'hidden', label: '非表示' },
            ]}
            value={settings.displayMode}
            onChange={(v) => update({ displayMode: v as DisplayMode })}
          />
          <p className="text-xs text-gray-400 mt-1.5">
            {settings.displayMode === 'placeholder'
              ? '「⚠ フィルタされました」に書き換え（クリックで表示）'
              : '完全に非表示（Flow Chat等の他拡張には効かない場合あり）'}
          </p>
        </Section>
      </div>

      {/* フッター */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">Alt+S でフィルタのON/OFFを切替</p>
      </div>
    </div>
  );
}
