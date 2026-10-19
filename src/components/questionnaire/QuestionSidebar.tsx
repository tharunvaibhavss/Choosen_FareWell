import React from 'react';
import { X } from 'lucide-react';
import { CircularProgressGroup } from './CircularProgress';
import type { StudentQuestionOrder } from '../../types/database';

interface QuestionSidebarProps {
  questions: StudentQuestionOrder[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  answeredQuestionIds: Set<string>;
  markedQuestionIds: Set<string>;
  onClose?: () => void;
}

export const QuestionSidebar: React.FC<QuestionSidebarProps> = ({
  questions,
  currentIndex,
  onSelectIndex,
  answeredQuestionIds,
  markedQuestionIds,
  onClose,
}) => {
  const answeredCount = answeredQuestionIds.size;
  const markedCount = markedQuestionIds.size;
  const total = questions.length || 72;
  const displayPosition = currentIndex + 1;

  return (
    <aside className="scrapbook-card p-2.5 sm:p-3 bg-white/98 shadow-2xl border border-[#ebdccb] flex flex-col h-full w-full box-border overflow-hidden rounded-2xl relative">
      {/* Drawer Header with Title, Count badge, & Close button */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#f0e6d8] flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <h2 className="font-serif text-[13px] sm:text-sm font-bold text-[#4a1525]">
            Question Navigator
          </h2>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#f6efe4] text-[#581c3f] border border-[#ebdccb]">
            {answeredCount} / 59 Required
          </span>
        </div>

        {onClose && (
          <button
            id="close-sidebar-btn"
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[#7d6f66] hover:text-[#581c3f] hover:bg-[#faedf2] transition-colors cursor-pointer"
            title="Close Navigator (Esc)"
            aria-label="Close Navigator"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Progress Summary Section */}
      <div className="py-1.5 border-b border-[#f0e6d8] flex-shrink-0 bg-[#faf6f0]/50 rounded-lg my-1 px-1">
        <CircularProgressGroup
          answeredCount={answeredCount}
          totalQuestions={total}
          markedCount={markedCount}
          requiredCount={59}
        />
        <p className="text-[10px] text-center text-[#7d6f66] mt-1 font-medium leading-none">
          {answeredCount >= 59 ? (
            <span className="text-[#1b5e20] font-semibold">
              🎉 59 required answered! Ready to submit.
            </span>
          ) : (
            <span>
              {59 - answeredCount} more memories to unlock submission
            </span>
          )}
        </p>
      </div>

      {/* Middle Section Header */}
      <div className="flex items-center justify-between pb-1 flex-shrink-0">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#695d54]">
          All 72 Questions
        </span>
        <span className="text-[11px] text-[#581c3f] font-mono font-semibold">
          Q{displayPosition} Selected
        </span>
      </div>

      {/* Scrollable 72 Questions Grid (Ensures exact container fit on all screen heights) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 my-0.5 classmate-scroll-panel">
        <div className="grid grid-cols-6 gap-1 py-0.5">
          {questions.map((q, idx) => {
            const isAnswered = answeredQuestionIds.has(q.question_id);
            const isMarked = markedQuestionIds.has(q.question_id);
            const isCurrent = idx === currentIndex;
            const posNum = idx + 1;

            let btnClass = 'bg-[#f0ece3] text-[#554d45] border border-[#ded5c7] hover:bg-[#e4ddcf]';

            if (isAnswered) {
              btnClass = 'bg-[#581c3f] text-white border-[#42112d] shadow-2xs hover:bg-[#6e2650]';
            } else if (isMarked) {
              btnClass = 'bg-[#c59b27] text-white border-[#a47e17] shadow-2xs hover:bg-[#d6a930]';
            }

            const currentRing = isCurrent
              ? 'ring-2 ring-[#581c3f] font-bold scale-105 z-10 shadow-xs'
              : 'font-normal';

            return (
              <button
                key={q.question_id}
                onClick={() => onSelectIndex(idx)}
                className={`question-btn h-[22px] rounded text-[10.5px] flex items-center justify-center transition-all cursor-pointer ${btnClass} ${currentRing}`}
                title={`Question ${posNum}${
                  isAnswered ? ' (Answered)' : ''
                }${isMarked ? ' (Marked for Review)' : ''}`}
                type="button"
              >
                {String(posNum).padStart(2, '0')}
              </button>
            );
          })}
        </div>
      </div>

      {/* State Legend - Fixed at bottom */}
      <div className="pt-1.5 border-t border-[#ebdccb] grid grid-cols-2 gap-1 text-[9.5px] text-[#695d54] leading-none flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#581c3f] border border-[#42112d] flex-shrink-0" />
          <span className="truncate">Answered</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#f0ece3] border border-[#ded5c7] flex-shrink-0" />
          <span className="truncate">Yet to Answer</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#c59b27] border border-[#a47e17] flex-shrink-0" />
          <span className="truncate">Marked Review</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-xs bg-white border-2 border-[#581c3f] flex-shrink-0" />
          <span className="truncate font-semibold">Current</span>
        </div>
      </div>
    </aside>
  );
};
