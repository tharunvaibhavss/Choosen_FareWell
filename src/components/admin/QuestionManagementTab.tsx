import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  X
} from 'lucide-react';
import { AdminService } from '../../services/adminService';
import type { Question, CreateQuestionInput, UpdateQuestionInput } from '../../types/database';

export const QuestionManagementTab: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);

  // Create form state
  const [newNumber, setNewNumber] = useState<number>(1);
  const [newText, setNewText] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIsActive, setNewIsActive] = useState(true);

  // Edit form state
  const [editNumber, setEditNumber] = useState<number>(1);
  const [editText, setEditText] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  // Feedback state
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const data = await AdminService.getAllQuestions();
      setQuestions(data);
    } catch (err) {
      console.error('Error loading questions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 6000);
  };

  // Find next available question number
  const findNextAvailableNumber = (): number => {
    const existing = new Set(questions.map((q) => q.question_number));
    for (let i = 1; i <= 72; i++) {
      if (!existing.has(i)) return i;
    }
    return 72;
  };

  const openCreateModal = () => {
    setNewNumber(findNextAvailableNumber());
    setNewText('');
    setNewDescription('Select the classmate who best fits this batch memory.');
    setNewIsActive(true);
    setIsCreateOpen(true);
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);

    const input: CreateQuestionInput = {
      questionNumber: Number(newNumber),
      questionText: newText,
      description: newDescription,
      isActive: newIsActive,
    };

    const res = await AdminService.createQuestion(input);
    setActionLoading(false);

    if (res.success && res.question) {
      showFeedback('success', `✓ Question #${res.question.question_number} created successfully!`);
      setIsCreateOpen(false);
      loadQuestions();
    } else {
      showFeedback('error', res.error || 'Failed to create question');
    }
  };

  const openEditModal = (q: Question) => {
    setActiveQuestion(q);
    setEditNumber(q.question_number);
    setEditText(q.question_text);
    setEditDescription(q.description || '');
    setEditIsActive(q.is_active !== false);
    setIsEditOpen(true);
  };

  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuestion) return;

    setActionLoading(true);
    const input: UpdateQuestionInput = {
      questionNumber: Number(editNumber),
      questionText: editText,
      description: editDescription,
      isActive: editIsActive,
    };

    const res = await AdminService.updateQuestion(activeQuestion.id, input);
    setActionLoading(false);

    if (res.success && res.question) {
      showFeedback('success', `✓ Question #${res.question.question_number} updated successfully!`);
      setIsEditOpen(false);
      setActiveQuestion(null);
      loadQuestions();
    } else {
      showFeedback('error', res.error || 'Failed to update question');
    }
  };

  const handleToggleStatus = async (q: Question) => {
    const nextStatus = !(q.is_active !== false);
    const res = await AdminService.toggleQuestionStatus(q.id, nextStatus);

    if (res.success) {
      showFeedback(
        'success',
        `✓ Question #${q.question_number} is now ${nextStatus ? 'Active' : 'Inactive'}.`
      );
      loadQuestions();
    } else {
      showFeedback('error', res.error || 'Failed to toggle status');
    }
  };

  const openDeleteModal = (q: Question) => {
    setActiveQuestion(q);
    setIsDeleteOpen(true);
  };

  const handleDeleteQuestion = async () => {
    if (!activeQuestion) return;

    setActionLoading(true);
    const res = await AdminService.deleteQuestion(activeQuestion.id);
    setActionLoading(false);

    if (res.success) {
      showFeedback('success', `✓ ${res.message}`);
      setIsDeleteOpen(false);
      setActiveQuestion(null);
      loadQuestions();
    } else {
      showFeedback('error', res.error || 'Failed to delete question');
    }
  };

  // Filter questions
  const filteredQuestions = questions.filter((q) => {
    const matchesSearch =
      q.question_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(q.question_number).includes(searchQuery.trim());

    if (!matchesSearch) return false;

    if (statusFilter === 'ACTIVE') return q.is_active !== false;
    if (statusFilter === 'INACTIVE') return q.is_active === false;
    return true;
  });

  const activeCount = questions.filter((q) => q.is_active !== false).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Question Counter (Configured out of 72) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdccb]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-2xl font-bold text-[#4a1525]">
              Question Management
            </h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#faeff2] text-[#581c3f] border border-[#ebd5dc]">
              Configured: {questions.length} / 72 Questions ({activeCount} Active)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#70645c] mt-1">
            Create, edit, activate, deactivate, and manage all 72 memory questions dynamically.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#581c3f] hover:bg-[#43132f] text-white shadow-md shadow-[#581c3f]/20 transition-all cursor-pointer active:scale-95 self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add New Question</span>
        </button>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/80 p-3.5 rounded-xl border border-[#ebdccb]">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#8a7b70] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by question number or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] placeholder:text-[#a39488] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 focus:border-[#581c3f]"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <Filter className="w-3.5 h-3.5 text-[#8a7b70] mr-1" />
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-[#581c3f] text-white shadow-xs'
                : 'bg-white text-[#6e5f56] border border-[#ebdccb] hover:bg-[#faf5ed]'
            }`}
          >
            All ({questions.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'ACTIVE'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white text-emerald-800 border border-[#ebdccb] hover:bg-emerald-50'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('INACTIVE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'INACTIVE'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white text-amber-800 border border-[#ebdccb] hover:bg-amber-50'
            }`}
          >
            Inactive ({questions.length - activeCount})
          </button>
        </div>
      </div>

      {/* Questions Table */}
      <div className="overflow-x-auto bg-white rounded-2xl border border-[#ebdccb] shadow-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#eeddc8] bg-[#fdf9f3] text-[11px] font-bold uppercase tracking-wider text-[#7d6f66]">
              <th className="py-3 px-4 w-14 text-center">Q#</th>
              <th className="py-3 px-4">Memory Question & Description</th>
              <th className="py-3 px-4 w-28 text-center">Status</th>
              <th className="py-3 px-4 w-24 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f2e9de] text-xs sm:text-sm">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-[#8c7e73]">
                  Loading questions bank...
                </td>
              </tr>
            ) : filteredQuestions.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-[#8c7e73]">
                  No questions found matching your search.
                </td>
              </tr>
            ) : (
              filteredQuestions.map((q) => {
                const isActive = q.is_active !== false;
                return (
                  <tr key={q.id} className="hover:bg-[#faf5ed]/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#581c3f] text-center">
                      {String(q.question_number).padStart(2, '0')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-serif text-sm font-semibold text-[#3d2f2f] leading-snug">
                        “{q.question_text}”
                      </div>
                      {q.description && (
                        <div className="text-[11px] text-[#8a7b70] mt-1 font-sans">
                          {q.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(q)}
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full cursor-pointer transition-all ${
                          isActive
                            ? 'text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                            : 'text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                        }`}
                        title="Click to toggle active status"
                      >
                        {isActive ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-amber-600" />
                            Inactive
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(q)}
                          className="p-1.5 rounded-lg text-[#695d54] hover:text-[#581c3f] hover:bg-[#faedf2] transition-colors cursor-pointer"
                          title="Edit question text and description"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteModal(q)}
                          className="p-1.5 rounded-lg text-[#695d54] hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Delete / archive question"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE QUESTION MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-lg bg-[#fffdfa] rounded-2xl border border-[#ebdccb] shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-4 right-4 text-[#8a7b70] hover:text-[#4a1525] p-1.5 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-serif text-xl font-bold text-[#4a1525] mb-1">
              Add New Memory Question
            </h3>
            <p className="text-xs text-[#70645c] mb-4">
              Configure a memory question within the 1 to 72 range.
            </p>

            <form onSubmit={handleCreateQuestion} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Question # (1 to 72) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={72}
                  required
                  value={newNumber}
                  onChange={(e) => setNewNumber(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Question Text (Prompt) *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Who was always the first to crack tough algorithmic problems?"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 font-serif"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Description / Instruction
                </label>
                <input
                  type="text"
                  placeholder="e.g. Select the classmate who best fits this memory."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="newQIsActive"
                  checked={newIsActive}
                  onChange={(e) => setNewIsActive(e.target.checked)}
                  className="rounded text-[#581c3f] focus:ring-[#581c3f]"
                />
                <label htmlFor="newQIsActive" className="text-xs font-medium text-[#4a1525] cursor-pointer">
                  Activate question immediately in questionnaires
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#ebdccb]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#6e5f56] hover:bg-[#faf5ed] rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#581c3f] hover:bg-[#43132f] rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Creating...' : 'Save Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT QUESTION MODAL */}
      {isEditOpen && activeQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-lg bg-[#fffdfa] rounded-2xl border border-[#ebdccb] shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="absolute top-4 right-4 text-[#8a7b70] hover:text-[#4a1525] p-1.5 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-serif text-xl font-bold text-[#4a1525] mb-1">
              Edit Question #{activeQuestion.question_number}
            </h3>
            <p className="text-xs text-[#70645c] mb-4">
              Existing student progress and answers will be preserved with updated text.
            </p>

            <form onSubmit={handleUpdateQuestion} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Question # (1 to 72) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={72}
                  required
                  value={editNumber}
                  onChange={(e) => setEditNumber(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Question Text *
                </label>
                <textarea
                  required
                  rows={3}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 font-serif"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Description / Instruction
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editQIsActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="rounded text-[#581c3f] focus:ring-[#581c3f]"
                />
                <label htmlFor="editQIsActive" className="text-xs font-medium text-[#4a1525] cursor-pointer">
                  Question is Active
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#ebdccb]">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#6e5f56] hover:bg-[#faf5ed] rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#581c3f] hover:bg-[#43132f] rounded-xl shadow-xs"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteOpen && activeQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-sm bg-[#fffdfa] rounded-2xl border border-red-200 shadow-2xl p-6 max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              onClick={() => setIsDeleteOpen(false)}
              className="absolute top-4 right-4 text-[#8a7b70] hover:text-[#4a1525] p-1.5 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <h3 className="font-serif text-lg font-bold text-red-900 mb-1">
              Delete Question #{activeQuestion.question_number}?
            </h3>
            <p className="text-xs text-[#70645c] mb-4 leading-relaxed">
              Are you sure you want to delete Question #{activeQuestion.question_number}?
              <br /><br />
              <em>Integrity Protection:</em> If students have already recorded answers for this memory, it will be safely archived and marked inactive to protect existing responses.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-[#6e5f56]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteQuestion}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-xs"
              >
                {actionLoading ? 'Processing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
