import React from 'react';

export const NotebookRings: React.FC<{ count?: number; orientation?: 'vertical' | 'horizontal' }> = ({
  count = 12,
  orientation = 'vertical',
}) => {
  const items = Array.from({ length: count });

  if (orientation === 'horizontal') {
    return (
      <div className="flex justify-around items-center px-6 py-1 select-none pointer-events-none">
        {items.map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            {/* Punched hole */}
            <div className="w-2.5 h-2.5 rounded-full bg-[#e8dece] border border-[#cfbeaa] shadow-inner" />
            {/* Metallic spiral ring */}
            <div className="w-1.5 h-4 -my-1 rounded-sm bg-gradient-to-r from-[#948b81] via-[#e2dbd2] to-[#73685e] shadow-sm z-10" />
            {/* Bottom hole */}
            <div className="w-2.5 h-2.5 rounded-full bg-[#e8dece] border border-[#cfbeaa] shadow-inner" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-around items-center py-6 px-1 select-none pointer-events-none h-full">
      {items.map((_, i) => (
        <div key={i} className="flex items-center my-1.5">
          {/* Punched hole left */}
          <div className="w-2.5 h-2.5 rounded-full bg-[#e8dece] border border-[#cfbeaa] shadow-inner" />
          {/* Metallic spiral ring loop */}
          <div className="w-4 h-1.5 -mx-1 rounded-sm bg-gradient-to-b from-[#8f867c] via-[#ece5dd] to-[#6e6359] shadow-sm z-10" />
          {/* Punched hole right */}
          <div className="w-2.5 h-2.5 rounded-full bg-[#e8dece] border border-[#cfbeaa] shadow-inner" />
        </div>
      ))}
    </div>
  );
};

export const BotanicalFlower: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = '#8a4f7d',
}) => {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 20C17 12 23 7 20 2C17 7 23 12 20 20Z"
        fill={color}
        fillOpacity="0.45"
      />
      <path
        d="M20 20C12 17 7 23 2 20C7 17 12 23 20 20Z"
        fill={color}
        fillOpacity="0.45"
      />
      <path
        d="M20 20C23 28 17 33 20 38C23 33 17 28 20 20Z"
        fill={color}
        fillOpacity="0.45"
      />
      <path
        d="M20 20C28 23 33 17 38 20C33 23 28 17 20 20Z"
        fill={color}
        fillOpacity="0.45"
      />
      <circle cx="20" cy="20" r="3.5" fill="#c59b27" fillOpacity="0.85" />
    </svg>
  );
};

export const TapeStrip: React.FC<{
  type?: 'rose' | 'gold' | 'kraft';
  className?: string;
}> = ({ type = 'rose', className = '' }) => {
  const bgClasses = {
    rose: 'bg-[#eed5da]/80 border-t border-b border-[#ddb5be]/60',
    gold: 'bg-[#faebca]/85 border-t border-b border-[#dfc384]/70',
    kraft: 'bg-[#ebdccb]/85 border-t border-b border-[#cfbca8]/70',
  };

  return (
    <div
      className={`h-5 w-24 backdrop-blur-xs shadow-xs select-none pointer-events-none ${bgClasses[type]} ${className}`}
      style={{
        clipPath: 'polygon(0% 0%, 5% 50%, 0% 100%, 100% 100%, 95% 50%, 100% 0%)',
      }}
    />
  );
};

export const PaperFlourish: React.FC = () => {
  return (
    <div className="flex items-center justify-center gap-2 text-[#c59b27]/60 my-2 select-none">
      <span className="h-px w-10 bg-[#e4d4c0]" />
      <span className="text-xs font-serif">✦ ❦ ✦</span>
      <span className="h-px w-10 bg-[#e4d4c0]" />
    </div>
  );
};
