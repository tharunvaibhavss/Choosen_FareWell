import React from 'react';
import { Check, Menu, XCircle } from 'lucide-react';
import { ClassmateCard } from './ClassmateCard';
import { BotanicalFlower, TapeStrip } from '../common/ScrapbookDecorations';
import type { Profile, StudentQuestionOrder } from '../../types/database';

interface QuestionCardProps {
  currentQuestion: StudentQuestionOrder;
  currentIndex: number;
  totalQuestions: number;
  classmates: Profile[];
  currentUserId: string;
  selectedClassmateId: string | null;
  answeredCount: number;
  classmateSelectionsMap: Map<string, number>; // classmateId -> personalized position (1..72)
  onSelectClassmate: (classmateId: string) => void;
  onUnselectClassmate: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  currentQuestion,
  currentIndex,
  totalQuestions,
  classmates,
  currentUserId,
  selectedClassmateId,
  answeredCount,
  classmateSelectionsMap,
  onSelectClassmate,
  onUnselectClassmate,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const selectedClassmate = selectedClassmateId
    ? classmates.find((c) => c.id === selectedClassmateId)
    : null;

  const progressPercentValue = Math.min(100, (answeredCount / 59) * 100);
  const progressPercentDisplay =
    progressPercentValue % 1 === 0
      ? `${progressPercentValue}%`
      : `${progressPercentValue.toFixed(2)}%`;

  const displayPosition = currentIndex + 1;

  return (
    <section className="flex-1 scrapbook-card p-3 sm:p-4 bg-[#fffdfa] relative flex flex-col h-full min-h-0 overflow-hidden box-border">
      {/* Decorative Washi Tape Strip at Corner */}
      <TapeStrip type="rose" className="absolute -top-1.5 -right-3 rotate-12 pointer-events-none" />
      <BotanicalFlower className="absolute top-2 right-6 w-6 h-6 opacity-30 pointer-events-none hidden sm:block" />

      {/* Top Banner: Displayed Position, Menu Button & Required Progress Bar */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#eeddc8]">
          <div className="flex items-center gap-2">
            {onToggleSidebar && (
              <button
                id="sidebar-toggle-btn"
                type="button"
                onClick={onToggleSidebar}
                className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs ${
                  isSidebarOpen
                    ? 'bg-[#581c3f] text-white border-[#3b1028]'
                    : 'bg-white hover:bg-[#faedf2] text-[#581c3f] border-[#eeddc8] hover:border-[#581c3f]/50'
                }`}
                title={isSidebarOpen ? 'Close Question Navigator' : 'Open Question Navigator (Progress & 72 Questions)'}
                aria-label="Toggle Question Navigator"
              >
                <Menu className="w-4 h-4 stroke-[2.2]" />
                <span className="text-xs font-semibold hidden sm:inline">
                  {isSidebarOpen ? 'Close Navigator' : 'Navigator'}
                </span>
              </button>
            )}

            <span className="font-serif text-base sm:text-lg font-bold text-[#4a1525] tracking-tight">
              Question {displayPosition}{' '}
              <span className="text-[#8c7e73] font-normal text-xs">
                of {totalQuestions}
              </span>
            </span>
          </div>

          {/* Progress Percentage & Bar (Denominator: 59) */}
          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="text-[11px] font-bold text-[#581c3f] leading-none block">
                {progressPercentDisplay} Completed
              </span>
              <span className="text-[10px] text-[#8c7e73] leading-none block mt-0.5">
                {answeredCount} / 59 required answers
              </span>
            </div>
            <div className="w-16 sm:w-24 h-1.5 rounded-full bg-[#ede5d8] overflow-hidden flex-shrink-0">
              <div
                className="h-full bg-gradient-to-r from-[#8a4f7d] to-[#581c3f] rounded-full transition-all duration-300"
                style={{ width: `${progressPercentValue}%` }}
              />
            </div>
          </div>
        </div>

        {/* Question Prompt Section */}
        <div className="py-2 text-left relative">
          <p className="font-serif text-sm sm:text-base md:text-[17px] font-medium text-[#4a1525] leading-snug tracking-tight">
            “{currentQuestion.question_text}”
          </p>

          {currentQuestion.description && (
            <p className="text-[11px] font-serif italic text-[#8a4f7d] mt-0.5">
              Note: {currentQuestion.description}
            </p>
          )}

          {/* Selected Name Indicator & Unselect Bar - Fixed above selection grid */}
          <div className="flex items-center justify-between flex-wrap gap-2 mt-2 pt-2 border-t border-[#f2e7db]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#7d6f66]">
                Selection:
              </span>

              {selectedClassmateId && selectedClassmate ? (
                <div
                  id="selected-student-indicator"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#581c3f] text-white shadow-xs font-serif"
                >
                  <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                  <span className="text-xs font-bold tracking-tight">
                    Selected: {selectedClassmate.full_name}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-[#8c7e73] italic bg-[#faf5ed] px-2.5 py-1 rounded-md border border-[#eeddc8] border-dashed">
                  No classmate currently selected for this memory
                </div>
              )}
            </div>

            {selectedClassmateId && selectedClassmate && (
              <button
                id="unselect-button"
                type="button"
                onClick={onUnselectClassmate}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-[#8a2a46] hover:text-white bg-white hover:bg-[#8a2a46] border border-[#d99ca5] hover:border-[#8a2a46] rounded-md shadow-2xs transition-all cursor-pointer active:scale-95"
                title="Remove selection for this memory"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Unselect</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Classmate Selection Area: Independent Vertical Scrollable Panel */}
      <div
        id="classmate-grid-panel"
        className="flex-1 min-h-0 mt-1 pt-1 overflow-y-auto overflow-x-hidden pr-1.5 classmate-scroll-panel max-h-[52vh] lg:max-h-none"
      >
        {classmates.length === 0 ? (
          <div className="py-12 px-4 text-center bg-[#faf5ed] rounded-xl border border-dashed border-[#ebdccb]">
            <p className="text-xs text-[#7d6f66] font-medium">
              No registered student classmates are currently available in the database.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {classmates.map((classmate) => {
              const isSelected = selectedClassmateId === classmate.id;
              const isSelf = classmate.id === currentUserId;
              const selectedInOtherQ = classmateSelectionsMap.get(classmate.id);

              return (
                <ClassmateCard
                  key={classmate.id}
                  classmate={classmate}
                  isSelected={isSelected}
                  isSelf={isSelf}
                  selectedInOtherQuestionNumber={selectedInOtherQ}
                  onSelect={onSelectClassmate}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
