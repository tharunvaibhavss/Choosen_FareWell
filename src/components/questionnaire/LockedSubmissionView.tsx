import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Lock, Heart, Award } from 'lucide-react';
import { BotanicalFlower, TapeStrip } from '../common/ScrapbookDecorations';
import type { Submission, StudentQuestionOrder, Profile } from '../../types/database';

interface LockedSubmissionViewProps {
  submission: Submission;
  studentName: string;
  rollNumber: string;
  questions: StudentQuestionOrder[];
  answersMap: Map<string, string>; // questionId -> classmateId
  classmatesMap: Map<string, Profile>;
}

export const LockedSubmissionView: React.FC<LockedSubmissionViewProps> = ({
  submission,
  studentName,
  rollNumber,
  questions,
  answersMap,
  classmatesMap,
}) => {
  useEffect(() => {
    // Fire celebratory confetti on mount
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#581c3f', '#d99ca5', '#c59b27', '#faeff2'],
      });
    } catch {
      // ignore
    }
  }, []);

  const formattedDate = submission.submitted_at
    ? new Date(submission.submitted_at).toLocaleString()
    : 'Recently';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-20 space-y-6">
      {/* Top Celebratory Banner */}
      <div className="scrapbook-card p-6 sm:p-10 text-center bg-[#fffdfa] relative overflow-hidden">
        <TapeStrip type="rose" className="absolute -top-2 left-10 rotate-3" />
        <TapeStrip type="gold" className="absolute -top-2 right-10 -rotate-3" />
        <BotanicalFlower className="absolute top-6 left-6 w-10 h-10 opacity-30" />
        <BotanicalFlower className="absolute top-6 right-6 w-10 h-10 opacity-30" />

        <div className="w-16 h-16 rounded-full bg-[#faedf2] text-[#581c3f] border-2 border-[#ebd5dc] flex items-center justify-center mx-auto mb-4 shadow-md">
          <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
        </div>

        <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#4a1525]">
          Your Memories Are Sealed!
        </h2>
        <p className="font-serif italic text-base sm:text-lg text-[#8a4f7d] mt-2">
          MCA Memories 2025 – 2027 • Official Batch Yearbook
        </p>

        <p className="max-w-xl mx-auto text-xs sm:text-sm text-[#70645c] mt-3 leading-relaxed">
          Thank you, <strong className="text-[#4a1525]">{studentName} ({rollNumber})</strong>.
          Your thoughtful memories for our batch have been securely recorded and sealed into the graduation keepsake.
        </p>

        {/* Sealed Badge Info */}
        <div className="inline-flex items-center gap-3 bg-[#fdf8ee] border border-[#e8d29b] px-4 py-2 rounded-xl mt-6 text-xs text-[#73550b] shadow-xs">
          <Lock className="w-4 h-4 text-[#c59b27]" />
          <span>
            Locked on <strong>{formattedDate}</strong> • <strong>{submission.answer_count}</strong> memories assigned
          </span>
        </div>
      </div>

      {/* Read-Only Summary of Responses */}
      <div className="scrapbook-card p-6 sm:p-8 bg-[#fffdfa]">
        <div className="flex items-center justify-between pb-4 border-b border-[#ebdccb] mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[#581c3f]" />
            <h3 className="font-serif text-xl font-bold text-[#4a1525]">
              Your Memory Selections (Read-Only)
            </h3>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#faedf2] text-[#581c3f] border border-[#ebd5dc]">
            Questionnaire Sealed
          </span>
        </div>

        <div className="divide-y divide-[#f2e9de]">
          {questions.map((q) => {
            const chosenId = answersMap.get(q.question_id);
            const chosenStudent = chosenId ? classmatesMap.get(chosenId) : null;

            if (!chosenStudent) return null;

            return (
              <div key={q.question_id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <span className="text-xs font-mono font-bold text-[#8a4f7d] mt-0.5">
                    Q{String(q.question_number).padStart(2, '0')}.
                  </span>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-[#4a3f38]">
                      {q.question_text}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center bg-[#faedf2] border border-[#ebd5dc] px-3 py-1 rounded-xl">
                  <Heart className="w-3.5 h-3.5 text-[#581c3f] fill-[#581c3f]" />
                  <span className="text-xs font-bold text-[#581c3f]">
                    {chosenStudent.full_name}
                  </span>
                  <span className="text-[10px] font-mono text-[#8a5b65]">
                    ({chosenStudent.roll_number})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
