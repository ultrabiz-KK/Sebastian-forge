import React, { useState, useEffect } from 'react';
import {
  startOfWeek, addDays, format, isSameDay, isToday,
  addWeeks, subWeeks, isSameWeek,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { selectDb } from '../lib/db';

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

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-50 text-red-700 border-red-100',
  medium: 'bg-blue-50 text-blue-700 border-blue-100',
  low: 'bg-gray-50 text-gray-600 border-gray-100',
  none: 'bg-gray-50 text-gray-500 border-gray-100',
};

const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日'];

export default function WeeklyCalendar() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [dayData, setDayData] = useState<DayData[]>([]);

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
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-sebastian-gray mb-1">CALENDAR</h2>
          <h1 className="text-2xl font-serif text-sebastian-navy">週スケジュール</h1>
        </div>
        <div className="flex items-center gap-2">
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="flex items-center gap-1 text-xs text-sebastian-gray hover:text-sebastian-navy border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <RotateCcw size={12} />
              今週
            </button>
          )}
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="p-1.5 text-gray-400 hover:text-sebastian-navy hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-gray-600 font-medium min-w-[160px] text-center">
            {format(weekStart, 'yyyy年M月d日', { locale: ja })} 〜 {format(weekEnd, 'M月d日', { locale: ja })}
          </span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 text-gray-400 hover:text-sebastian-navy hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

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
              className={`rounded-xl border min-h-[160px] flex flex-col overflow-hidden ${
                today
                  ? 'border-sebastian-navy shadow-sm'
                  : 'border-gray-100'
              } ${isWeekend ? 'bg-gray-50/50' : 'bg-white'}`}
            >
              {/* ヘッダー */}
              <div
                className={`px-3 py-2 flex items-center justify-between ${
                  today ? 'bg-sebastian-navy text-white' : ''
                }`}
              >
                <span className={`text-xs font-medium ${
                  today ? 'text-white' : isWeekend ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {DAY_NAMES[i]}
                </span>
                <span className={`text-sm font-semibold ${
                  today ? 'text-white' : isWeekend ? 'text-gray-400' : 'text-gray-700'
                }`}>
                  {dateStr}
                </span>
              </div>

              {/* コンテンツ */}
              <div className="flex-1 p-2 space-y-1">
                {day.tasks.slice(0, maxVisible).map(task => (
                  <div
                    key={task.id}
                    className={`text-xs px-2 py-1 rounded border truncate ${PRIORITY_COLORS[task.priority]}`}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                ))}
                {overflowCount > 0 && (
                  <div className="text-xs text-gray-400 px-2">+{overflowCount} 件</div>
                )}
              </div>

              {/* メモインジケーター */}
              {day.hasMemo && (
                <div className="px-3 pb-2">
                  <span className="text-xs text-sebastian-lightgray flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sebastian-lightgray inline-block" />
                    メモあり
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 text-center">
        期日が設定されたタスクが表示されます。完了済みタスクは除外されています。
      </p>
    </div>
  );
}
