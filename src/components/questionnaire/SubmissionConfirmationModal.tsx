import React from 'react';
import { AlertTriangle, CheckCircle2, X, Send, Lock } from 'lucide-react';

interface SubmissionConfirmationModalProps {
  isOpen: boolean;
  answeredCount: number;
  distinctCount?: number;
  totalQuestions: number;
  markedCount: number;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const SubmissionConfirmationModal: React.FC<SubmissionConfirmationModalProps> = ({
  isOpen,
  answeredCount,
  distinctCount,
  totalQuestions = 72,
  markedCount,
  isSubmitting,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const unansweredCount = totalQuestions - answeredCount;
  const isEligible = answeredCount >= 59 && (distinctCount === undefined || distinctCount >= 59);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#fffdfa] rounded-2xl border border-[#ebdccb] shadow-2xl p-6 sm:p-7 overflow-hidden">
        {/* Top washi tape accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-3.5 bg-[#eed5da]/80 rotate-1 rounded-b-sm border-b border-[#ddb5be]/60" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-[#8a7b70] hover:text-[#4a1525] p-1.5 rounded-lg hover:bg-[#faf5ed] transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center sm:text-left mt-2">
          <div className="w-12 h-12 rounded-2xl bg-[#faedf2] text-[#581c3f] border border-[#ebd5dc] flex items-center justify-center mx-auto sm:mx-0 mb-3 shadow-xs">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="font-serif text-2xl font-bold text-[#4a1525]">
            Confirm Final Yearbook Submission
          </h3>
          <p className="text-xs sm:text-sm text-[#7d6f66] mt-1">
            Please review your questionnaire summary below before sealing your memories into the batch yearbook.
          </p>
        </div>

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-3 gap-2.5 my-5">
          <div className="p-3 rounded-xl bg-[#faedf2] border border-[#eed5da] text-center">
            <span className="block font-serif text-xl font-bold text-[#581c3f]">
              {answeredCount} / 59
            </span>
            <span className="text-[11px] font-semibold text-[#6e2650]">
              Required Answered
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#f5f0e8] border border-[#dfd6c8] text-center">
            <span className="block font-serif text-xl font-bold text-[#554d45]">
              {unansweredCount} / 72
            </span>
            <span className="text-[11px] font-semibold text-[#695f56]">
              Unanswered ({Math.max(0, totalQuestions - 59)} allowed)
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#fcf6e7] border border-[#e8d29b] text-center">
            <span className="block font-serif text-xl font-bold text-[#c59b27]">
              {markedCount}
            </span>
            <span className="text-[11px] font-semibold text-[#946e10]">
              Marked Review
            </span>
          </div>
        </div>

        {/* Rules & Integrity Checklist */}
        <div className="space-y-2 py-3 border-t border-b border-[#ebdccb] text-xs text-[#554d45]">
          <div className="flex items-center gap-2 text-emerald-800 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>59 or more valid answers recorded ({answeredCount} of 59 required)</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-800 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Remaining {unansweredCount} questions can stay unanswered as permitted</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-800 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              Each classmate is selected at most once (
              {distinctCount !== undefined ? `${distinctCount} distinct classmates` : 'zero duplicates'}
              )
            </span>
          </div>
          <div className="flex items-center gap-2 text-emerald-800 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Zero self-selections verified</span>
          </div>

          <div className="flex items-start gap-2 text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200 mt-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span className="text-[11px] leading-relaxed">
              <strong>Notice:</strong> Once submitted, your questionnaire will be permanently locked into the yearbook and cannot be modified.
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-[#6e5f56] hover:text-[#4a1525] bg-white border border-[#ebdccb] hover:bg-[#faf5ed] rounded-xl transition-all cursor-pointer"
          >
            Back to Questionnaire
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={!isEligible || isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-[#581c3f] hover:bg-[#43132f] rounded-xl shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'Submitting...' : 'Confirm & Lock Submission'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
