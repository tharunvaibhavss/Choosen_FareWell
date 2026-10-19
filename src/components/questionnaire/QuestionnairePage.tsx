import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { QuestionSidebar } from './QuestionSidebar';
import { QuestionCard } from './QuestionCard';
import { QuestionnaireFooter } from './QuestionnaireFooter';
import { SubmissionConfirmationModal } from './SubmissionConfirmationModal';
import { LockedSubmissionView } from './LockedSubmissionView';
import { QuestionnaireService } from '../../services/questionnaireService';
import type { AuthUser } from '../../types/auth';
import type { Profile, StudentQuestionOrder, Submission } from '../../types/database';

interface QuestionnairePageProps {
  user: AuthUser;
}

export const QuestionnairePage: React.FC<QuestionnairePageProps> = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classmates, setClassmates] = useState<Profile[]>([]);
  const [questions, setQuestions] = useState<StudentQuestionOrder[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Maps & sets for fast O(1) checks
  const [answersMap, setAnswersMap] = useState<Map<string, string>>(new Map()); // question_id -> classmate_id
  const [markedQuestionIds, setMarkedQuestionIds] = useState<Set<string>>(new Set());
  const [submission, setSubmission] = useState<Submission | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load all initial data on mount
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Check if already submitted
        const existingSub = await QuestionnaireService.getSubmission(user.id);
        if (existingSub && isMounted) {
          setSubmission(existingSub);
        }

        // Fetch classmates pool
        const eligibleClassmates = await QuestionnaireService.getEligibleClassmates();
        if (isMounted) {
          setClassmates(eligibleClassmates);
        }

        // Fetch persistent 72 questions order for this student
        const orderedQuestions = await QuestionnaireService.getStudentQuestionOrder(user.id);
        if (isMounted) {
          setQuestions(orderedQuestions);

          // Populate initial review markers
          const initialMarked = new Set<string>();
          orderedQuestions.forEach((q) => {
            if (q.is_marked_for_review) {
              initialMarked.add(q.question_id);
            }
          });
          setMarkedQuestionIds(initialMarked);
        }

        // Fetch existing answers
        const savedAnswers = await QuestionnaireService.getStudentAnswers(user.id);
        if (isMounted) {
          const initialMap = new Map<string, string>();
          savedAnswers.forEach((a) => {
            initialMap.set(a.question_id, a.selected_student_id);
          });
          setAnswersMap(initialMap);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading questionnaire';
        if (isMounted) setError(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [user.id]);

  // Derived set of answered question IDs
  const answeredQuestionIds = useMemo(() => {
    return new Set(answersMap.keys());
  }, [answersMap]);

  // Derived map of which classmate is assigned to which question position (Rule B check)
  // Maps: classmateId -> questionNumber (1..72)
  const classmateSelectionsMap = useMemo(() => {
    const map = new Map<string, number>();
    const currentQId = questions[currentIndex]?.question_id;

    questions.forEach((q, idx) => {
      // Exclude current question so user can see their current selection as active
      if (q.question_id !== currentQId) {
        const selectedId = answersMap.get(q.question_id);
        if (selectedId) {
          map.set(selectedId, idx + 1);
        }
      }
    });

    return map;
  }, [answersMap, questions, currentIndex]);

  const currentQuestion = questions[currentIndex];
  const selectedClassmateId = currentQuestion ? answersMap.get(currentQuestion.question_id) || null : null;
  const isCurrentMarked = currentQuestion ? markedQuestionIds.has(currentQuestion.question_id) : false;

  // Classmates quick lookup map
  const classmatesMap = useMemo(() => {
    return new Map(classmates.map((c) => [c.id, c]));
  }, [classmates]);

  // Unselect classmate for current question
  const handleUnselectCurrentClassmate = useCallback(async () => {
    if (!currentQuestion || submission) return;
    const previousSelectedId = answersMap.get(currentQuestion.question_id);
    if (!previousSelectedId) return;

    // Optimistic remove
    setAnswersMap((prev) => {
      const next = new Map(prev);
      next.delete(currentQuestion.question_id);
      return next;
    });

    try {
      setIsSaving(true);
      const res = await QuestionnaireService.removeAnswer(
        user.id,
        currentQuestion.question_id
      );

      if (!res.success) {
        // Revert on error
        alert(res.error || 'Failed to unselect classmate');
        setAnswersMap((prev) => {
          const next = new Map(prev);
          next.set(currentQuestion.question_id, previousSelectedId);
          return next;
        });
      }
    } catch (err: unknown) {
      console.error('Error removing answer:', err);
      setAnswersMap((prev) => {
        const next = new Map(prev);
        next.set(currentQuestion.question_id, previousSelectedId);
        return next;
      });
    } finally {
      setIsSaving(false);
    }
  }, [currentQuestion, submission, answersMap, user.id]);

  // Select classmate for current question (or unselect if clicking already selected card)
  const handleSelectClassmate = useCallback(
    async (classmateId: string) => {
      if (!currentQuestion || submission) return;

      const currentSelected = answersMap.get(currentQuestion.question_id);
      if (currentSelected === classmateId) {
        await handleUnselectCurrentClassmate();
        return;
      }

      // Optimistic update
      setAnswersMap((prev) => {
        const next = new Map(prev);
        next.set(currentQuestion.question_id, classmateId);
        return next;
      });

      try {
        setIsSaving(true);
        const res = await QuestionnaireService.saveAnswer(
          user.id,
          currentQuestion.question_id,
          classmateId
        );

        if (!res.success) {
          // Revert on error
          alert(res.error || 'Failed to save answer');
          setAnswersMap((prev) => {
            const next = new Map(prev);
            if (currentSelected) {
              next.set(currentQuestion.question_id, currentSelected);
            } else {
              next.delete(currentQuestion.question_id);
            }
            return next;
          });
        }
      } catch (err: unknown) {
        console.error('Error saving answer:', err);
      } finally {
        setIsSaving(false);
      }
    },
    [currentQuestion, submission, answersMap, user.id, handleUnselectCurrentClassmate]
  );

  // Toggle review marker for current question
  const handleToggleReview = useCallback(async () => {
    if (!currentQuestion || submission) return;

    const nextMarked = !isCurrentMarked;

    setMarkedQuestionIds((prev) => {
      const next = new Set(prev);
      if (nextMarked) {
        next.add(currentQuestion.question_id);
      } else {
        next.delete(currentQuestion.question_id);
      }
      return next;
    });

    await QuestionnaireService.toggleMarkForReview(
      user.id,
      currentQuestion.question_id,
      nextMarked
    );
  }, [currentQuestion, isCurrentMarked, submission, user.id]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Find first unanswered question
      const firstUnansweredIdx = questions.findIndex(
        (q) => !answersMap.has(q.question_id)
      );
      if (firstUnansweredIdx >= 0) {
        setCurrentIndex(firstUnansweredIdx);
      }
    }
  };

  // Final submission confirmation handler
  const handleFinalSubmit = async () => {
    if (answersMap.size < 59) {
      alert(`Rule D: You must answer at least 59 memories. Current count: ${answersMap.size}`);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await QuestionnaireService.submitQuestionnaire(user.id);

      if (res.success && res.submission) {
        setSubmission(res.submission);
        setIsModalOpen(false);
      } else {
        alert(res.error || 'Submission failed. Please check validation rules.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed';
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-[#581c3f] border-t-transparent rounded-full animate-spin" />
        <p className="font-serif text-base text-[#4a1525]">
          Opening your MCA Memories Yearbook...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-red-50 border border-red-200 rounded-2xl text-center">
        <p className="text-sm font-semibold text-red-800">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-[#581c3f] text-white text-xs font-semibold rounded-xl"
        >
          Retry
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-[#fffdfa] border border-[#ebdccb] rounded-2xl text-center scrapbook-card">
        <h2 className="font-serif text-xl font-bold text-[#4a1525] mb-2">
          No Questions Available
        </h2>
        <p className="text-xs text-[#70645c] leading-relaxed">
          The memory questions bank is currently being prepared. Please check back shortly or contact the administrator.
        </p>
      </div>
    );
  }

  // If already submitted, display locked confirmation view
  if (submission) {
    return (
      <LockedSubmissionView
        submission={submission}
        studentName={user.profile.full_name}
        rollNumber={user.profile.roll_number}
        questions={questions}
        answersMap={answersMap}
        classmatesMap={classmatesMap}
      />
    );
  }

  return (
    <div className="flex flex-col h-full lg:h-[calc(100dvh-46px)] justify-between overflow-hidden relative box-border">
      {/* Subtle backdrop overlay when sidebar drawer is open */}
      {isSidebarOpen && (
        <div
          id="sidebar-backdrop"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-[#3b1220]/25 backdrop-blur-[1px] z-30 transition-opacity cursor-pointer"
          aria-label="Close sidebar backdrop"
        />
      )}

      {/* Shared parent Flexbox layout for Sidebar and Main Questionnaire Panel */}
      <main className="max-w-7xl mx-auto w-full px-2 sm:px-4 py-1.5 flex-1 min-h-0 relative flex flex-row items-stretch overflow-hidden box-border">
        {/* Left Collapsible Sidebar Drawer */}
        <div
          id="collapsible-sidebar-drawer"
          className={`absolute top-1.5 bottom-1.5 left-2 sm:left-4 z-40 w-[290px] sm:w-[310px] max-w-[88vw] transition-transform duration-300 ease-out transform box-border ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-[115%] pointer-events-none'
          }`}
        >
          <QuestionSidebar
            questions={questions}
            currentIndex={currentIndex}
            onSelectIndex={(idx) => setCurrentIndex(idx)}
            answeredQuestionIds={answeredQuestionIds}
            markedQuestionIds={markedQuestionIds}
            onClose={() => setIsSidebarOpen(false)}
          />
        </div>

        {/* Main Questionnaire Card - Expands across full width when sidebar is collapsed */}
        {currentQuestion && (
          <QuestionCard
            currentQuestion={currentQuestion}
            currentIndex={currentIndex}
            totalQuestions={questions.length}
            classmates={classmates}
            currentUserId={user.id}
            selectedClassmateId={selectedClassmateId}
            answeredCount={answersMap.size}
            classmateSelectionsMap={classmateSelectionsMap}
            onSelectClassmate={handleSelectClassmate}
            onUnselectClassmate={handleUnselectCurrentClassmate}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          />
        )}
      </main>

      {/* Footer Controls: Previous, Mark for Review, Save & Next, Submit */}
      <QuestionnaireFooter
        currentIndex={currentIndex}
        totalQuestions={questions.length}
        currentQuestion={currentQuestion}
        isFirstQuestion={currentIndex === 0}
        isLastQuestion={currentIndex === questions.length - 1}
        isMarkedForReview={isCurrentMarked}
        answeredCount={answersMap.size}
        requiredCount={59}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onToggleReview={handleToggleReview}
        onSubmitClick={() => setIsModalOpen(true)}
        isSaving={isSaving}
      />

      {/* Submission Confirmation Modal */}
      <SubmissionConfirmationModal
        isOpen={isModalOpen}
        answeredCount={answersMap.size}
        totalQuestions={questions.length}
        markedCount={markedQuestionIds.size}
        isSubmitting={isSubmitting}
        onConfirm={handleFinalSubmit}
        onCancel={() => setIsModalOpen(false)}
      />
    </div>
  );
};
