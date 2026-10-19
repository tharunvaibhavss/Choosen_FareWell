import React from 'react';
import { Check, Lock, UserX } from 'lucide-react';
import type { Profile } from '../../types/database';

interface ClassmateCardProps {
  classmate: Profile;
  isSelected: boolean;
  isSelf: boolean;
  selectedInOtherQuestionNumber?: number | null;
  onSelect: (classmateId: string) => void;
}

export const ClassmateCard: React.FC<ClassmateCardProps> = ({
  classmate,
  isSelected,
  isSelf,
  selectedInOtherQuestionNumber,
  onSelect,
}) => {
  const isDisabled = isSelf || Boolean(selectedInOtherQuestionNumber);

  const handleClick = () => {
    onSelect(classmate.id);
  };

  if (isDisabled) {
    return (
      <div
        className="min-h-[38px] py-1.5 px-3 rounded-lg border border-[#e4dacf] bg-[#f7f2ea]/80 opacity-60 select-none cursor-not-allowed flex items-center justify-between gap-1.5 transition-all"
        title={
          isSelf
            ? `${classmate.full_name} (Rule C: You cannot select yourself)`
            : `${classmate.full_name} (Rule B: Selected for Question ${selectedInOtherQuestionNumber})`
        }
      >
        <span className="font-medium text-xs text-[#8c8075] line-clamp-2 leading-snug break-words">
          {classmate.full_name}
        </span>
        {isSelf ? (
          <span className="inline-flex items-center gap-0.5 text-[9.5px] font-semibold text-[#8a5b65] bg-[#fae8eb] px-1.5 py-0.5 rounded flex-shrink-0">
            <UserX className="w-2.5 h-2.5" />
            You
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[9.5px] font-semibold text-[#7d7065] bg-[#ece3d6] px-1.5 py-0.5 rounded flex-shrink-0">
            <Lock className="w-2.5 h-2.5" />
            Q{selectedInOtherQuestionNumber}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`classmate-card min-h-[38px] py-1.5 px-3 rounded-lg border text-left transition-all cursor-pointer relative flex items-center justify-between gap-1.5 active:scale-98 ${
        isSelected
          ? 'selected bg-[#581c3f] text-white border-[#3b1028] shadow-sm ring-1 ring-[#581c3f]'
          : 'bg-white hover:bg-[#faf5ed] text-[#3d2f2f] hover:text-[#581c3f] border-[#ebdccb] hover:border-[#581c3f]/50 shadow-2xs'
      }`}
      title={isSelected ? `${classmate.full_name} (Selected - Click to unselect)` : classmate.full_name}
    >
      <span
        className={`text-xs sm:text-[12.5px] leading-snug line-clamp-2 break-words ${
          isSelected ? 'text-white font-bold' : 'text-[#3d2f2f] font-medium'
        }`}
      >
        {classmate.full_name}
      </span>

      {isSelected && (
        <span className="w-4 h-4 rounded-full bg-white/25 text-white flex items-center justify-center flex-shrink-0 ml-1">
          <Check className="w-3.5 h-3.5 stroke-[3] text-white" />
        </span>
      )}
    </button>
  );
};
