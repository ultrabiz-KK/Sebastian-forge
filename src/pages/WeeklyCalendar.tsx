import { useState, useEffect } from 'react';
import {
  startOfWeek, addDays, format, isToday,
  addWeeks, subWeeks, isSameWeek,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { selectDb } from '../lib/db';
import { PRIORITY_COLOR } from '../lib/constants';
import { TaskPeekModal } from '../components/TaskPeekModal';

interface TaskItem {
  id: number;
  title: string;
  priority: string;
  status: string;
}

interface DayData {
  date: Date;
  tasks: TaskItem[];
  hasMemo: boolean;
}


const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日'];

export default function WeeklyCalendar() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [dayData, setDayData] = useState<DayData[]>([]);
  const [peekTaskId, setPeekTaskId] = useState<number | null>(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = weekDays[6];

  useEffect(() => {
    loadWeekData();
  }, [weekStart]);

  const loadWeekData = async () => {
    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(weekEnd, 'yyyy-MM-dd');

    const [tasks, memos] = await Promise.all([
      selectDb<{ id: number; title: string; priority: string; status: string; due_date: string }>(
        "SELECT id, title, priority, status, due_date FROM tasks WHERE due_date BETWEEN ? AND ? AND status != 'done' ORDER BY priority DESC",
        [startStr, endStr]
      ),
      selectDb<{ date: string }>(
        'SELECT date FROM daily_memos WHERE date BETWEEN ? AND ?',
        [startStr, endStr]
      ),
    ]);

    const memoDates = new Set(memos.map(m => m.date));

    const data: DayData[] = weekDays.map(day => ({
      date: day,
      tasks: tasks.filter(t => t.due_date === format(day, 'yyyy-MM-dd')),
      hasMemo: memoDates.has(format(day, 'yyyy-MM-dd')),
    }));

    setDayData(data);
  };

  const isCurrentWeek = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 });

  return (
    <div className="space-y-6">
      {peekTaskId !== null && (
        <TaskPeekModal taskId={peekTaskId} onClose={() => setPeekTaskId(null)} />
      )}
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

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-2">
        {dayData.map((day, i) => {
          const isWeekend = i >= 5;
          const today = isToday(day.date);
          const dateStr = format(day.date, 'd');
          const maxVisible = 3;
          const overflowCount = day.tasks.length - maxVisible;

          return (
            <div
              key={i}
              className={`relative rounded-xl border min-h-[160px] flex flex-col overflow-hidden ${
                today
                  ? 'shadow-sm'
                  : 'border-sebastian-border/60'
              } ${isWeekend ? 'bg-sebastian-parchment/40' : 'bg-white'}`}
              style={today ? { borderColor: 'rgba(201,164,86,0.5)', boxShadow: '0 0 0 1px rgba(201,164,86,0.3)' } : undefined}
            >
              {/* ヘッダー */}
              <div
                className={`px-3 py-2 flex items-center justify-between ${
                  today ? '' : ''
                }`}
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
                  {dateStr}
                </span>
              </div>

              {/* コンテンツ */}
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
                <div className="px-3 pb-2">
                  <span className="text-xs text-sebastian-lightgray/70 flex items-center gap-1 font-serif">
                    <span className="w-1.5 h-1.5 rounded-full bg-sebastian-gold/40 inline-block" />
                    メモあり
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-sebastian-lightgray/60 text-center font-serif">
        期日が設定されたタスクが表示されます。完了済みタスクは除外されています。
      </p>
    </div>
  );
}
