import { useState, useEffect } from 'react';
import {
  startOfWeek, addDays, format, isToday,
  addWeeks, subWeeks, isSameWeek, getWeek,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RotateCcw, BookOpen, BarChart2, Sparkles } from 'lucide-react';
import { selectDb } from '../lib/db';
import { PRIORITY_COLOR } from '../lib/constants';
import { TaskPeekModal } from '../components/TaskPeekModal';
import { OrnateCard } from '../components/ClassicUI';
import { getSetting, setSetting, SETTING_KEYS } from '../lib/settings';
import { generateWeeklyCalendarComment } from '../lib/ai';

// ─── 格言リスト ────────────────────────────────────────────────

const BUTLER_QUOTES: { text: string; author: string }[] = [
  {
    text: 'かのエジソンは申しました。「天才とは1%のひらめきと、99%の汗の産物である」と。',
    author: 'トーマス・エジソン',
  },
  {
    text: 'チャーチル首相はかつてこう述べておられました。「成功とは、失敗を重ねても情熱を失わない能力のことだ」と。',
    author: 'ウィンストン・チャーチル',
  },
  {
    text: '物理学者アインシュタインはこう語っています。「想像力は知識より重要だ。知識には限界があるが、想像力は世界を包み込む」と。',
    author: 'アルベルト・アインシュタイン',
  },
  {
    text: 'レオナルド・ダ・ヴィンチの言葉にございます。「シンプルさは究極の洗練である」と。',
    author: 'レオナルド・ダ・ヴィンチ',
  },
  {
    text: '哲学者アリストテレスは申しました。「私たちは繰り返し行うことの産物である。優秀さとは行為ではなく、習慣だ」と。',
    author: 'アリストテレス',
  },
  {
    text: 'かのリンカーン大統領は言いました。「木を切るのに6時間与えられたなら、最初の4時間を斧を研ぐことに使う」と。',
    author: 'エイブラハム・リンカーン',
  },
  {
    text: '詩人ゲーテはこう述べております。「できること、夢に見ることは今すぐ始めなさい。着手すること自体に才能と力と魔法が宿っている」と。',
    author: 'ヨハン・ヴォルフガング・フォン・ゲーテ',
  },
  {
    text: 'マーク・トウェインの言葉でございます。「前に進む秘訣は、とにかく始めることだ」と。',
    author: 'マーク・トウェイン',
  },
  {
    text: 'ローマの哲学者セネカはこう記しました。「幸運とは、準備が機会と出会ったときに生まれるものだ」と。',
    author: 'ルキウス・アンナエウス・セネカ',
  },
  {
    text: 'ベンジャミン・フランクリンは申しました。「準備を怠ることは、失敗する準備をしていることに他ならない」と。',
    author: 'ベンジャミン・フランクリン',
  },
  {
    text: '兵法家・孫子の教えにございます。「混乱の中にこそ、機会がある」と。',
    author: '孫子',
  },
  {
    text: 'ヴォルテールは喝破しました。「完璧は善の敵である」と。ご主人様、時に「十分によい」が最善の答えにございます。',
    author: 'ヴォルテール',
  },
  {
    text: 'ダーウィンはこう述べました。「生き残るのは最も強い者でも最も賢い者でもない。最も変化に適応できる者だ」と。',
    author: 'チャールズ・ダーウィン',
  },
  {
    text: '思想家ソローは記しました。「夢の方向へ、自信をもって歩み続けなさい。想像していた生活を実現しようと努めなさい」と。',
    author: 'ヘンリー・デイヴィッド・ソロー',
  },
  {
    text: '哲学者プラトンの言葉にございます。「始めることは仕事の最も重要な部分である」と。',
    author: 'プラトン',
  },
  {
    text: 'ニーチェはこう申しました。「私を殺さないものは、私をより強くする」と。',
    author: 'フリードリヒ・ニーチェ',
  },
  {
    text: 'ナポレオンはかつてこう語りました。「勝利は最も粘り強い者のものである」と。',
    author: 'ナポレオン・ボナパルト',
  },
  {
    text: 'アイザック・ニュートンは謙虚にも申しました。「私がより遠くを見られたとすれば、それは巨人たちの肩の上に立っていたからだ」と。',
    author: 'アイザック・ニュートン',
  },
  {
    text: 'ソクラテスの言葉でございます。「唯一の真の知恵とは、自分が何も知らないということを知ることだ」と。',
    author: 'ソクラテス',
  },
  {
    text: 'シェイクスピアはこう書き記しました。「疑いは裏切り者だ。挑戦を恐れることで、勝ち取れたはずの善を失わせる」と。',
    author: 'ウィリアム・シェイクスピア',
  },
  {
    text: 'フランクリンはまたこうも述べています。「知識への投資は、最も利回りの高い投資である」と。',
    author: 'ベンジャミン・フランクリン',
  },
  {
    text: 'マハトマ・ガンジーは申しました。「あなた自身が、世界に望む変化になりなさい」と。',
    author: 'マハトマ・ガンジー',
  },
  {
    text: '宮本武蔵は「五輪書」に記しました。「今日は昨日の自分に勝ること、明日は下手に勝ること」と。',
    author: '宮本武蔵',
  },
  {
    text: 'エマーソンはこう語りました。「情熱なしに偉大なことが成し遂げられたためしはない」と。',
    author: 'ラルフ・ウォルドー・エマーソン',
  },
  {
    text: '孔子の教えにございます。「どれほどゆっくりでも構わない、立ち止まりさえしなければ」と。',
    author: '孔子',
  },
  {
    text: 'スティーブ・ジョブズは申しました。「偉大な仕事をする唯一の方法は、自分のやることを愛することだ」と。',
    author: 'スティーブ・ジョブズ',
  },
  {
    text: 'かのキュリー夫人はこう語っています。「人生の中で恐れるべきものは何もない。理解すべきものがあるだけだ」と。',
    author: 'マリー・キュリー',
  },
  {
    text: '哲学者カントは申しました。「自分の理性を公に使う勇気を持ちなさい」と。',
    author: 'イマヌエル・カント',
  },
  {
    text: 'ヘレン・ケラーの言葉にございます。「人生は大胆な冒険であるか、あるいは何でもないかのどちらかだ」と。',
    author: 'ヘレン・ケラー',
  },
  {
    text: 'チェーホフはある手紙に書き記しました。「知識は持てば持つほど、どれほど知らないかがよくわかる」と。',
    author: 'アントン・チェーホフ',
  },
];

// ─── 型定義 ───────────────────────────────────────────────────

interface TaskItem {
  id: number;
  title: string;
  priority: string;
  status: string;
  due_date: string;
}

interface DayData {
  date: Date;
  tasks: TaskItem[];     // 未完了（カレンダー表示用）
  allTasks: TaskItem[];  // 完了含む全タスク（統計用）
  hasMemo: boolean;
}

interface WeekStats {
  total: number;
  done: number;
  undone: number;
  high: number;   // 高優先度・未完了
  byDay: number[]; // 日別・未完了タスク数
}

const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日'];
const DAY_NAMES_JA = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'];
const MAX_BAR_TASKS = 5; // 負荷バー満杯の基準

// ─── 統計タイル ───────────────────────────────────────────────

function StatTile({
  label, value, accent = false,
}: {
  label: string; value: number | string; accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-3 py-3 text-center border ${
        accent
          ? 'bg-red-50 border-red-100'
          : 'bg-sebastian-parchment/40 border-sebastian-border/50'
      }`}
    >
      <div
        className={`text-2xl font-serif ${accent ? 'text-red-600' : 'text-sebastian-navy'}`}
      >
        {value}
      </div>
      <div className="text-[10px] text-sebastian-lightgray font-serif mt-0.5 leading-tight">
        {label}
      </div>
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────

export default function WeeklyCalendar() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [dayData, setDayData] = useState<DayData[]>([]);
  const [peekTaskId, setPeekTaskId] = useState<number | null>(null);

  // 新規state
  const [weekStats, setWeekStats] = useState<WeekStats>({ total: 0, done: 0, undone: 0, high: 0, byDay: [] });
  const [weekComment, setWeekComment] = useState<string | null>(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const [showQuote, setShowQuote] = useState(false);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = weekDays[6];
  const isCurrentWeek = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 });

  // 今週の格言（週番号でローテーション）
  const quoteIdx = getWeek(weekStart, { weekStartsOn: 1 }) % BUTLER_QUOTES.length;
  const currentQuote = BUTLER_QUOTES[quoteIdx];

  useEffect(() => {
    loadWeekData();
  }, [weekStart]);

  const loadWeekData = async () => {
    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(weekEnd, 'yyyy-MM-dd');

    const [tasks, memos] = await Promise.all([
      selectDb<TaskItem>(
        'SELECT id, title, priority, status, due_date FROM tasks WHERE due_date BETWEEN ? AND ? AND archived = 0 ORDER BY priority DESC',
        [startStr, endStr]
      ),
      selectDb<{ date: string }>(
        'SELECT date FROM daily_memos WHERE date BETWEEN ? AND ?',
        [startStr, endStr]
      ),
    ]);

    const memoDates = new Set(memos.map(m => m.date));

    const data: DayData[] = weekDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayTasks = tasks.filter(t => t.due_date === dateStr);
      return {
        date: day,
        tasks: dayTasks.filter(t => t.status !== 'done'),
        allTasks: dayTasks,
        hasMemo: memoDates.has(dateStr),
      };
    });

    setDayData(data);

    const stats: WeekStats = {
      total:  tasks.length,
      done:   tasks.filter(t => t.status === 'done').length,
      undone: tasks.filter(t => t.status !== 'done').length,
      high:   tasks.filter(t => t.priority === 'high' && t.status !== 'done').length,
      byDay:  data.map(d => d.tasks.length),
    };
    setWeekStats(stats);

    loadComment(stats, weekStart, weekEnd);
  };

  const regenerateComment = async () => {
    const cacheKey = `weekly_cal_comment_${format(weekStart, 'yyyy-MM-dd')}`;
    await setSetting(cacheKey, '');
    setWeekComment(null);
    loadComment(weekStats, weekStart, weekEnd, true);
  };

  const loadComment = async (stats: WeekStats, start: Date, end: Date, forceRegenerate = false) => {
    const cacheKey = `weekly_cal_comment_${format(start, 'yyyy-MM-dd')}`;

    // キャッシュ確認
    const cached = await getSetting(cacheKey);
    if (cached && !forceRegenerate) {
      setWeekComment(cached);
      return;
    }

    // AI無効 → フォールバック
    const provider = await getSetting(SETTING_KEYS.AI_PROVIDER);
    if (!provider || provider === 'disabled') {
      setWeekComment(buildFallbackComment(stats));
      return;
    }

    setCommentLoading(true);
    try {
      const maxCount = Math.max(...stats.byDay, 0);
      const busiestIdx = maxCount > 0 ? stats.byDay.indexOf(maxCount) : 0;
      const comment = await generateWeeklyCalendarComment({
        weekStart: format(start, 'yyyy-MM-dd'),
        weekEnd: format(end, 'yyyy-MM-dd'),
        total: stats.total,
        done: stats.done,
        undone: stats.undone,
        highPriority: stats.high,
        busiestDayName: DAY_NAMES_JA[busiestIdx],
        busiestDayCount: maxCount,
      });
      await setSetting(cacheKey, comment);
      setWeekComment(comment);
    } catch {
      setWeekComment(buildFallbackComment(stats));
    } finally {
      setCommentLoading(false);
    }
  };

  const buildFallbackComment = (stats: WeekStats): string => {
    if (stats.total === 0) return '今週は期日付きのタスクがございません。余裕を持ってお過ごしくださいませ。';
    const parts: string[] = [`今週は${stats.total}件の期日タスクがございます。`];
    if (stats.high > 0) parts.push(`高優先度が${stats.high}件ございますのでご注意を。`);
    if (stats.done > 0) parts.push(`${stats.done}件完了、お疲れ様でございます。`);
    return parts.join('');
  };

  const rate = weekStats.total > 0
    ? Math.round((weekStats.done / weekStats.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {peekTaskId !== null && (
        <TaskPeekModal taskId={peekTaskId} onClose={() => setPeekTaskId(null)} />
      )}

      {/* ─── ヘッダー ─── */}
      <div className="flex items-start justify-between mb-6">
        <header>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-display tracking-[0.22em] text-sebastian-gray uppercase shrink-0">Calendar</span>
            <div className="flex-1 h-px bg-sebastian-gold/20" />
            <span className="text-sebastian-gold/45 text-[10px] shrink-0">◆</span>
            <div className="w-10 h-px bg-sebastian-gold/20" />
          </div>
          <h1 className="text-3xl font-serif text-sebastian-navy">週スケジュール</h1>
        </header>
        <div className="flex items-center gap-2 mt-1">
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="flex items-center gap-1 text-xs text-sebastian-gray hover:text-sebastian-navy border border-sebastian-border rounded-lg px-2.5 py-1.5 transition-colors font-serif"
            >
              <RotateCcw size={12} />
              今週
            </button>
          )}
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="p-1.5 text-sebastian-lightgray hover:text-sebastian-navy hover:bg-sebastian-parchment rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-sebastian-gray font-serif min-w-[160px] text-center">
            {format(weekStart, 'yyyy年M月d日', { locale: ja })} 〜 {format(weekEnd, 'M月d日', { locale: ja })}
          </span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 text-sebastian-lightgray hover:text-sebastian-navy hover:bg-sebastian-parchment rounded-lg transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ─── カレンダーグリッド ─── */}
      <div className="grid grid-cols-7 gap-2">
        {dayData.map((day, i) => {
          const isWeekend = i >= 5;
          const today = isToday(day.date);
          const maxVisible = 3;
          const overflowCount = day.tasks.length - maxVisible;
          const barPercent = Math.min((day.tasks.length / MAX_BAR_TASKS) * 100, 100);
          const barColor = day.tasks.length >= 5
            ? 'rgba(200,80,60,0.72)'
            : day.tasks.length >= 3
              ? 'rgba(220,140,50,0.78)'
              : 'rgba(201,164,86,0.6)';

          return (
            <div
              key={i}
              className={`relative rounded-xl border min-h-[160px] flex flex-col overflow-hidden ${
                today ? 'shadow-sm' : 'border-sebastian-border/60'
              } ${isWeekend ? 'bg-sebastian-parchment/40' : 'bg-white'}`}
              style={today ? { borderColor: 'rgba(201,164,86,0.5)', boxShadow: '0 0 0 1px rgba(201,164,86,0.3)' } : undefined}
            >
              {/* ヘッダー */}
              <div
                className="px-3 py-2 flex items-center justify-between"
                style={today ? { backgroundColor: '#131929' } : undefined}
              >
                <span className={`text-xs font-serif ${
                  today ? 'text-[#c9a456]' : isWeekend ? 'text-sebastian-lightgray' : 'text-sebastian-gray'
                }`}>
                  {DAY_NAMES[i]}
                </span>
                <span className={`text-sm font-semibold font-serif ${
                  today ? 'text-[#d4c9a8]' : isWeekend ? 'text-sebastian-lightgray' : 'text-sebastian-text'
                }`}>
                  {format(day.date, 'd')}
                </span>
              </div>

              {/* タスク */}
              <div className="flex-1 p-2 space-y-1">
                {day.tasks.slice(0, maxVisible).map(task => (
                  <div
                    key={task.id}
                    className={`text-xs px-2 py-1 rounded border truncate font-serif cursor-pointer hover:opacity-75 transition-opacity ${PRIORITY_COLOR[task.priority]}`}
                    title={task.title}
                    onClick={() => setPeekTaskId(task.id)}
                  >
                    {task.title}
                  </div>
                ))}
                {overflowCount > 0 && (
                  <div className="text-xs text-sebastian-lightgray px-2 font-serif">+{overflowCount} 件</div>
                )}
              </div>

              {/* メモインジケーター */}
              {day.hasMemo && (
                <div className="px-3 pb-1.5">
                  <span className="text-xs text-sebastian-lightgray/70 flex items-center gap-1 font-serif">
                    <span className="w-1.5 h-1.5 rounded-full bg-sebastian-gold/40 inline-block" />
                    メモあり
                  </span>
                </div>
              )}

              {/* 負荷バー */}
              <div className="h-[3px] w-full" style={{ backgroundColor: 'rgba(201,164,86,0.1)' }}>
                {barPercent > 0 && (
                  <div
                    className="h-full transition-all duration-700 ease-out"
                    style={{ width: `${barPercent}%`, backgroundColor: barColor }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── サマリー / 格言パネル ─── */}
      <OrnateCard>
        {/* タブ */}
        <div
          className="flex border-b"
          style={{ borderColor: 'rgba(201,164,86,0.2)' }}
        >
          <button
            onClick={() => setShowQuote(false)}
            className={`flex items-center gap-1.5 px-5 py-3 text-xs font-serif border-b-2 transition-colors ${
              !showQuote
                ? 'border-sebastian-gold/70 text-sebastian-navy'
                : 'border-transparent text-sebastian-lightgray hover:text-sebastian-gray'
            }`}
          >
            <BarChart2 size={12} />
            週のサマリー
          </button>
          <button
            onClick={() => setShowQuote(true)}
            className={`flex items-center gap-1.5 px-5 py-3 text-xs font-serif border-b-2 transition-colors ${
              showQuote
                ? 'border-sebastian-gold/70 text-sebastian-navy'
                : 'border-transparent text-sebastian-lightgray hover:text-sebastian-gray'
            }`}
          >
            <BookOpen size={12} />
            今週の格言
          </button>
        </div>

        {/* ─── サマリービュー ─── */}
        {!showQuote && (
          <div className="px-5 py-4 space-y-4">
            {/* 統計タイル */}
            <div className="grid grid-cols-4 gap-3">
              <StatTile label="期日タスク合計" value={weekStats.total} />
              <StatTile label="完了" value={weekStats.done} />
              <StatTile label="未完了" value={weekStats.undone} />
              <StatTile label="高優先度" value={weekStats.high} accent={weekStats.high > 0} />
            </div>

            {/* 達成率バー */}
            {weekStats.total > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs font-serif text-sebastian-lightgray mb-1.5">
                  <span>今週の達成率</span>
                  <span className="text-sebastian-navy font-semibold">{rate}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(201,164,86,0.12)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${rate}%`,
                      background: rate >= 80
                        ? 'linear-gradient(to right, rgba(201,164,86,0.7), rgba(201,164,86,1))'
                        : 'linear-gradient(to right, rgba(201,164,86,0.5), rgba(201,164,86,0.8))',
                    }}
                  />
                </div>
              </div>
            )}

            {/* 週評コメント */}
            <div
              className="flex items-start gap-3 pt-3"
              style={{ borderTop: '1px solid rgba(201,164,86,0.15)' }}
            >
              <div
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-display font-semibold"
                style={{ backgroundColor: '#131929', color: '#c9a456', border: '1px solid rgba(201,164,86,0.3)' }}
              >
                S
              </div>
              <p className="flex-1 text-sm font-serif leading-relaxed text-sebastian-text">
                {commentLoading
                  ? <span className="text-sebastian-lightgray italic">考えております...</span>
                  : weekComment ?? <span className="text-sebastian-lightgray/60 italic">－</span>
                }
              </p>
              <button
                onClick={regenerateComment}
                disabled={commentLoading}
                className="flex items-center gap-1 text-xs text-sebastian-lightgray hover:text-sebastian-gold transition-colors disabled:opacity-40 font-serif flex-shrink-0"
                title="週評を再生成"
              >
                <Sparkles size={12} />
                再生成
              </button>
            </div>
          </div>
        )}

        {/* ─── 格言ビュー ─── */}
        {showQuote && (() => {
          const bracketIdx = currentQuote.text.indexOf('「');
          const intro = bracketIdx !== -1 ? currentQuote.text.slice(0, bracketIdx) : currentQuote.text;
          const quote = bracketIdx !== -1 ? currentQuote.text.slice(bracketIdx) : null;
          return (
          <div className="px-8 py-8 flex flex-col items-center text-center space-y-4">
            <div
              className="text-5xl font-serif leading-none"
              style={{ color: 'rgba(201,164,86,0.35)' }}
            >
              ❝
            </div>
            <div className="space-y-2 max-w-[480px]">
              <p className="text-sm font-serif text-sebastian-gray leading-relaxed">
                {intro}
              </p>
              {quote && (
                <p className="text-base font-serif text-sebastian-navy leading-loose">
                  {quote}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="h-px w-12" style={{ backgroundColor: 'rgba(201,164,86,0.3)' }} />
              <span className="text-xs font-serif text-sebastian-lightgray tracking-widest">— {currentQuote.author}</span>
              <div className="h-px w-12" style={{ backgroundColor: 'rgba(201,164,86,0.3)' }} />
            </div>
            <p className="text-[10px] font-serif text-sebastian-lightgray/50">
              第{getWeek(weekStart, { weekStartsOn: 1 })}週の格言
            </p>
          </div>
          );
        })()}
      </OrnateCard>
    </div>
  );
}
