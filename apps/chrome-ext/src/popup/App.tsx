import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  FILTER_COUNT_KEY,
  STAGE2_USAGE_KEY,
  STAGE2_MONTHLY_LIMIT,
  type FilterMode,
  type DisplayMode,
  type GameProgress,
  type Settings,
  type Stage2Usage,
  type CustomNGWord,
} from '../shared/settings.js';
import type { KBGame } from '@spoilershield/knowledge-base';
import { getAllGenreTemplates } from '@spoilershield/knowledge-base';
import aceAttorney1 from '@kb-data/ace-attorney-1.json';

const GAMES: KBGame[] = [aceAttorney1 as unknown as KBGame];

// ─── アイコン ──────────────────────────────────────────────────────────

function ShieldIcon({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width={size} height={size} style={{ flexShrink: 0 }}>
      <path d="M64 8 L112 28 L112 68 C112 96 88 116 64 124 C40 116 16 96 16 68 L16 28 Z" fill="#3B82F6" />
      <path d="M64 16 L104 33 L104 68 C104 91 84 109 64 117 C44 109 24 91 24 68 L24 33 Z" fill="#60A5FA" opacity="0.35" />
      <ellipse cx="64" cy="66" rx="26" ry="16" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" />
      <circle cx="64" cy="66" r="8" fill="white" />
      <circle cx="64" cy="66" r="4" fill="#3B82F6" />
      <line x1="38" y1="44" x2="90" y2="88" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="38" y1="44" x2="90" y2="88" stroke="#1D4ED8" strokeWidth="9" strokeLinecap="round" opacity="0.3" />
      <line x1="38" y1="44" x2="90" y2="88" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}

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

// ─── カスタムNGワードセクション ────────────────────────────────────────

const CUSTOM_NG_WORD_LIMIT = 200;

function CustomNGWordSection({
  words,
  onChange,
}: {
  words: CustomNGWord[];
  onChange: (words: CustomNGWord[]) => void;
}) {
  const [input, setInput] = useState('');
  const atLimit = words.length >= CUSTOM_NG_WORD_LIMIT;

  const addWord = () => {
    const trimmed = input.trim();
    if (!trimmed || atLimit) return;
    if (words.some((w) => w.word === trimmed)) return;
    onChange([...words, { id: crypto.randomUUID(), word: trimmed, enabled: true }]);
    setInput('');
  };

  const removeWord = (id: string) => onChange(words.filter((w) => w.id !== id));

  const toggleWord = (id: string) =>
    onChange(words.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));

  return (
    <div>
      <div className="flex gap-1.5 mb-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addWord()}
          placeholder="フィルタするワードを入力"
          disabled={atLimit}
          className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm bg-white min-w-0 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          onClick={addWord}
          disabled={!input.trim() || atLimit}
          className="px-2.5 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          追加
        </button>
      </div>
      <div className={`text-xs mb-1.5 ${atLimit ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
        {atLimit
          ? `上限に達しました（${words.length} / ${CUSTOM_NG_WORD_LIMIT}）`
          : `登録済み: ${words.length} / ${CUSTOM_NG_WORD_LIMIT}`}
      </div>
      {words.length === 0 ? (
        <p className="text-xs text-gray-400">登録済みのワードはありません</p>
      ) : (
        <ul className="space-y-1 max-h-36 overflow-y-auto">
          {words.map((w) => (
            <li
              key={w.id}
              className={`flex items-center gap-1.5 text-xs rounded px-2 py-1 bg-gray-50 ${!w.enabled ? 'opacity-40' : ''}`}
            >
              <span className="flex-1 truncate font-mono">{w.word}</span>
              <button
                onClick={() => toggleWord(w.id)}
                className={`px-1.5 py-0.5 rounded text-xs font-medium border transition-colors ${
                  w.enabled
                    ? 'border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                    : 'border-gray-300 text-gray-400 bg-white hover:bg-gray-100'
                }`}
              >
                {w.enabled ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => removeWord(w.id)}
                className="text-gray-400 hover:text-red-500 transition-colors px-1 leading-none"
                aria-label="削除"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── ジャンルテンプレートセクション ────────────────────────────────────

function GenreTemplateSection({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const templates = getAllGenreTemplates();
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-1.5">
      {templates.map((t) => (
        <label key={t.id} className="flex items-start gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selectedIds.includes(t.id)}
            onChange={() => toggle(t.id)}
            className="rounded border-gray-300 text-indigo-600 mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <span className="font-medium">{t.name}</span>
            <span className="text-xs text-gray-400 ml-1.5">{t.description}</span>
          </div>
        </label>
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
  const [stage2Count, setStage2Count] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // 起動時に設定・フィルタカウント・Stage 2 利用量を読み込む
  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY, FILTER_COUNT_KEY, STAGE2_USAGE_KEY], (result) => {
      setSettings({ ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] as Partial<Settings>) });
      setFilterCount((result[FILTER_COUNT_KEY] as number | undefined) ?? 0);
      const usage = result[STAGE2_USAGE_KEY] as Stage2Usage | undefined;
      const currentMonth = new Date().toISOString().slice(0, 7);
      setStage2Count(usage?.month === currentMonth ? (usage.messageCount ?? 0) : 0);
      setLoaded(true);
    });
  }, []);

  // ポップアップが開いている間も変化を反映する
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes[FILTER_COUNT_KEY]) {
        setFilterCount((changes[FILTER_COUNT_KEY].newValue as number | undefined) ?? 0);
      }
      if (changes[STAGE2_USAGE_KEY]) {
        const usage = changes[STAGE2_USAGE_KEY].newValue as Stage2Usage | undefined;
        const currentMonth = new Date().toISOString().slice(0, 7);
        setStage2Count(usage?.month === currentMonth ? (usage.messageCount ?? 0) : 0);
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
          <div className="flex items-center gap-2 font-semibold text-base leading-tight">
            <ShieldIcon size={22} />
            SpoilerShield
          </div>
          <div className="text-xs text-indigo-200 mt-1">
            {filterCount}件のコメントをフィルタしました
          </div>
          <div className={`text-xs mt-0.5 ${stage2Count >= STAGE2_MONTHLY_LIMIT ? 'text-red-300' : 'text-indigo-300'}`}>
            今月のフィルタ判定件数: {stage2Count} / {STAGE2_MONTHLY_LIMIT}件
            {stage2Count >= STAGE2_MONTHLY_LIMIT && ' (上限到達)'}
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

        {/* カスタムNGワード */}
        <Section label="カスタムNGワード">
          <CustomNGWordSection
            words={settings.customNgWords ?? []}
            onChange={(words) => update({ customNgWords: words })}
          />
        </Section>

        {/* ジャンル別テンプレート */}
        <Section label="ジャンル別テンプレート">
          <GenreTemplateSection
            selectedIds={settings.selectedGenreTemplates ?? []}
            onChange={(ids) => update({ selectedGenreTemplates: ids })}
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

    </div>
  );
}
