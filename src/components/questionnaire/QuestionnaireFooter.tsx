import React from 'react';
import { ChevronLeft, ChevronRight, Bookmark, CheckCircle, Send, BookmarkCheck } from 'lucide-react';
interface QuestionnaireFooterProps {
  currentIndex: number;
  totalQuestions: number;
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  isMarkedForReview: boolean;
  answeredCount: number;
  distinctCount?: number;
  requiredCount?: number;
  onPrevious: () => void;
  onNext: () => void;
  onToggleReview: () => void;
  onSubmitClick: () => void;
  isSaving?: boolean;
}

export const QuestionnaireFooter: React.FC<QuestionnaireFooterProps> = ({
  currentIndex,
  totalQuestions,
  isFirstQuestion,
  isLastQuestion,
  isMarkedForReview,
  answeredCount,
  distinctCount,
  requiredCount = 59,
  onPrevious,
  onNext,
  onToggleReview,
  onSubmitClick,
  isSaving,
}) => {
  const isSubmitEligible = answeredCount >= requiredCount && (distinctCount === undefined || distinctCount >= requiredCount);
  const displayPosition = currentIndex + 1;

  return (
    <footer className="w-full bg-[#fdfcf9] border-t border-[#ebdccb] py-1.5 px-4 sm:px-6 shadow-sm z-20 flex-shrink-0">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Left Side: Navigation between questions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={isFirstQuestion}
            className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
              isFirstQuestion
                ? 'opacity-40 bg-[#f7f2ea] text-[#9c8e82] border-[#e4dacf] cursor-not-allowed'
                : 'bg-white text-[#4a1525] border-[#ebdccb] hover:bg-[#faf5ed] active:scale-95 shadow-2xs'
            }`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          {/* Mark for Review Toggle */}
          <button
            type="button"
            onClick={onToggleReview}
            className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer active:scale-95 shadow-2xs ${
              isMarkedForReview
                ? 'bg-[#fef8e7] text-[#946e10] border-[#e4cc88] ring-1 ring-[#e4cc88]'
                : 'bg-white text-[#73550b] border-[#ebdccb] hover:bg-[#fefcf6]'
            }`}
            title="Mark this memory to revisit later"
          >
            {isMarkedForReview ? (
              <>
                <BookmarkCheck className="w-3.5 h-3.5 text-[#c59b27] fill-[#c59b27]" />
                <span>Marked for Review</span>
              </>
            ) : (
              <>
                <Bookmark className="w-3.5 h-3.5 text-[#c59b27]" />
                <span>Mark for Review</span>
              </>
            )}
          </button>
        </div>

        {/* Center: Current question position */}
        <div className="text-center hidden sm:block">
          <span className="text-xs font-serif font-bold text-[#4a1525]">
            Question {displayPosition} of {totalQuestions}
          </span>
        </div>

        {/* Right Side: Save & Next and Submit */}
        <div className="flex items-center gap-2">
          {/* Submit Button (Rule D: Enabled only at >= 59 answers) */}
          <button
            type="button"
            onClick={onSubmitClick}
            disabled={!isSubmitEligible}
            className={`flex items-center gap-1.5 px-3.5 py-1 rounded-md text-xs font-bold border transition-all shadow-xs ${
              isSubmitEligible
                ? 'bg-gradient-to-r from-[#1b5e20] to-[#2e7d32] text-white border-transparent hover:from-[#144818] hover:to-[#236327] cursor-pointer ring-1 ring-emerald-400 active:scale-95 animate-pulse'
                : 'opacity-50 bg-[#e8e2d8] text-[#7d7065] border-[#d8cec0] cursor-not-allowed'
            }`}
            title={
              isSubmitEligible
                ? 'Submit your final yearbook questionnaire'
                : distinctCount !== undefined && distinctCount < requiredCount && answeredCount >= requiredCount
                ? `Need ${requiredCount} distinct classmates (currently ${distinctCount} distinct)`
                : `Need ${requiredCount - answeredCount} more answers to submit (at least ${requiredCount} required)`
            }
          >
            <Send className="w-3 h-3" />
            <span>Submit</span>
          </button>

          {/* Save & Next Button */}
          <button
            type="button"
            onClick={onNext}
            disabled={isSaving}
            className="flex items-center gap-1 px-3.5 py-1 rounded-md text-xs font-bold bg-[#581c3f] hover:bg-[#6e2650] text-white border border-[#42112d] shadow-xs transition-all cursor-pointer active:scale-95"
          >
            {isLastQuestion ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-rose-200" />
                <span>Jump to Unanswered</span>
              </>
            ) : (
              <>
                <span>Save & Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </footer>
  );
};
