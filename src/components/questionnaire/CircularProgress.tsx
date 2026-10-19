import React from 'react';

interface CircularRingProps {
  label: string;
  value: number;
  total: number;
  type: 'answered' | 'unanswered' | 'review';
  sublabel?: string;
}

export const CircularRing: React.FC<CircularRingProps> = ({
  label,
  value,
  total,
  type,
  sublabel,
}) => {
  const size = 46;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = total > 0 ? total : 59;
  const progressRatio = Math.min(Math.max(value / safeTotal, 0), 1);
  const strokeDashoffset = circumference - progressRatio * circumference;

  const colorStyles = {
    answered: {
      track: '#faedf2',
      stroke: '#581c3f',
      text: '#4a1525',
    },
    unanswered: {
      track: '#f0ece3',
      stroke: '#b8aba0',
      text: '#695f56',
    },
    review: {
      track: '#fcf6e7',
      stroke: '#c59b27',
      text: '#946e10',
    },
  }[type];

  return (
    <div className="flex flex-col items-center text-center p-1 rounded-lg bg-white/75 border border-[#eee4d3] shadow-2xs">
      <div className="relative flex items-center justify-center">
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colorStyles.track}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colorStyles.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-300 ease-out"
          />
        </svg>

        {/* Center count */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-xs font-bold font-serif leading-none tracking-tight"
            style={{ color: colorStyles.text }}
          >
            {value}
          </span>
          <span className="text-[8px] text-[#918379] font-medium leading-none mt-0.5">
            / {total}
          </span>
        </div>
      </div>

      <span className="mt-0.5 text-[10px] font-semibold tracking-tight text-[#4a3f38] leading-tight">
        {label}
      </span>
      {sublabel && (
        <span className="text-[8px] text-[#8a7b70] leading-none">
          {sublabel}
        </span>
      )}
    </div>
  );
};

interface CircularProgressGroupProps {
  answeredCount: number;
  totalQuestions?: number;
  markedCount: number;
  requiredCount?: number;
}

export const CircularProgressGroup: React.FC<CircularProgressGroupProps> = ({
  answeredCount,
  totalQuestions = 72,
  markedCount,
  requiredCount = 59,
}) => {
  const remainingRequired = Math.max(0, requiredCount - answeredCount);

  return (
    <div className="grid grid-cols-3 gap-1 w-full">
      <CircularRing
        label="Answered"
        value={answeredCount}
        total={requiredCount}
        type="answered"
        sublabel="of 59"
      />
      <CircularRing
        label="Remaining"
        value={remainingRequired}
        total={requiredCount}
        type="unanswered"
        sublabel="to 59"
      />
      <CircularRing
        label="Review"
        value={markedCount}
        total={totalQuestions}
        type="review"
        sublabel={`of ${totalQuestions}`}
      />
    </div>
  );
};
