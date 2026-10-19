import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  Search, 
  Filter, 
  Edit3, 
  KeyRound, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  X,
  Eye,
  EyeOff,
  RotateCcw,
  Clock,
  ShieldAlert
} from 'lucide-react';
import { AdminService } from '../../services/adminService';
import type { Profile, CreateStudentInput, UpdateStudentInput } from '../../types/database';

export const StudentManagementTab: React.FC = () => {
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');
  const [passwordFilter, setPasswordFilter] = useState<'ALL' | 'CHANGED' | 'PENDING'>('ALL');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isResetPassOpen, setIsResetPassOpen] = useState(false);
  const [isRequireResetOpen, setIsRequireResetOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const [activeStudent, setActiveStudent] = useState<Profile | null>(null);

  // Form states
  const [newRoll, setNewRoll] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('mca2025');
  const [newIsActive, setNewIsActive] = useState(true);

  // Edit states
  const [editRoll, setEditRoll] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  // Reset pass state
  const [resetPassVal, setResetPassVal] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Status feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const data = await AdminService.getAllStudents();
      setStudents(data);
    } catch (err) {
      console.error('Error loading students:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 6000);
  };

  // Filter counts
  const totalCount = students.length;
  const changedCount = students.filter((s) => s.must_change_password === false).length;
  const pendingCount = students.filter((s) => s.must_change_password !== false).length;

  // Filtered list
  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      s.full_name.toLowerCase().includes(q) ||
      s.roll_number.toLowerCase().includes(q) ||
      (s.email && s.email.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (statusFilter === 'ACTIVE' && s.is_active === false) return false;
    if (statusFilter === 'DISABLED' && s.is_active !== false) return false;

    if (passwordFilter === 'CHANGED' && s.must_change_password !== false) return false;
    if (passwordFilter === 'PENDING' && s.must_change_password === false) return false;

    return true;
  });

  // Handle Create Student
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);

    const emailToSave = newEmail.trim();
    if (!emailToSave) {
      showFeedback('error', 'Please provide a valid email address.');
      setActionLoading(false);
      return;
    }

    const input: CreateStudentInput = {
      rollNumber: newRoll.trim().toUpperCase(),
      fullName: newName.trim(),
      email: emailToSave,
      password: newPassword,
      isActive: newIsActive,
    };

    const res = await AdminService.createStudent(input);
    setActionLoading(false);

    if (res.success && res.student) {
      showFeedback('success', `✓ Student ${res.student.full_name} (${res.student.roll_number}) created successfully with email ${res.student.email}!`);
      setIsCreateOpen(false);
      setNewRoll('');
      setNewName('');
      setNewEmail('');
      setNewPassword('mca2025');
      loadStudents();
    } else {
      showFeedback('error', res.error || 'Failed to create student account');
    }
  };

  // Open Edit Modal
  const openEditModal = (student: Profile) => {
    setActiveStudent(student);
    setEditRoll(student.roll_number);
    setEditName(student.full_name);
    setEditEmail(student.email || '');
    setEditIsActive(student.is_active !== false);
    setIsEditOpen(true);
  };

  // Handle Update Student
  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudent) return;

    setActionLoading(true);
    const input: UpdateStudentInput = {
      rollNumber: editRoll.trim().toUpperCase(),
      fullName: editName.trim(),
      email: editEmail.trim().toLowerCase(),
      isActive: editIsActive,
    };

    const res = await AdminService.updateStudent(activeStudent.id, input);
    setActionLoading(false);

    if (res.success && res.student) {
      showFeedback('success', `✓ Updated profile for ${res.student.full_name} (${res.student.roll_number}) - Email: ${res.student.email}`);
      setIsEditOpen(false);
      setActiveStudent(null);
      loadStudents();
    } else {
      showFeedback('error', res.error || 'Failed to update student');
    }
  };

  // Toggle active status directly
  const handleToggleStatus = async (student: Profile) => {
    const nextStatus = !(student.is_active !== false);
    const res = await AdminService.toggleStudentStatus(student.id, nextStatus);

    if (res.success) {
      showFeedback(
        'success',
        `✓ ${student.full_name} (${student.roll_number}) is now ${nextStatus ? 'Active' : 'Disabled'}.`
      );
      loadStudents();
    } else {
      showFeedback('error', res.error || 'Failed to toggle status');
    }
  };

  // Open Reset Password Modal
  const openResetPassModal = (student: Profile) => {
    setActiveStudent(student);
    setResetPassVal('');
    setIsResetPassOpen(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudent) return;

    setActionLoading(true);
    const res = await AdminService.resetStudentPassword(activeStudent.id, resetPassVal);
    setActionLoading(false);

    if (res.success) {
      showFeedback('success', `✓ Password reset successfully for ${activeStudent.full_name} (${activeStudent.roll_number})`);
      setIsResetPassOpen(false);
      setActiveStudent(null);
    } else {
      showFeedback('error', res.error || 'Failed to reset password');
    }
  };

  // Open Require Password Reset Modal
  const openRequireResetModal = (student: Profile) => {
    setActiveStudent(student);
    setIsRequireResetOpen(true);
  };

  const handleRequirePasswordReset = async () => {
    if (!activeStudent) return;

    setActionLoading(true);
    const res = await AdminService.requirePasswordReset(activeStudent.id);
    setActionLoading(false);

    if (res.success) {
      showFeedback(
        'success',
        `✓ Password reset requirement set for ${activeStudent.full_name} (${activeStudent.roll_number}). They must set a new password on their next login.`
      );
      setIsRequireResetOpen(false);
      setActiveStudent(null);
      loadStudents();
    } else {
      showFeedback('error', res.error || 'Failed to require password reset');
    }
  };

  // Open Delete Modal
  const openDeleteModal = (student: Profile) => {
    setActiveStudent(student);
    setIsDeleteOpen(true);
  };

  const handleDeleteStudent = async () => {
    if (!activeStudent) return;

    setActionLoading(true);
    const res = await AdminService.deleteStudent(activeStudent.id);
    setActionLoading(false);

    if (res.success) {
      showFeedback('success', `✓ ${res.message}`);
      setIsDeleteOpen(false);
      setActiveStudent(null);
      loadStudents();
    } else {
      showFeedback('error', res.error || 'Failed to delete student');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdccb]">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[#4a1525]">
            Student Accounts Management
          </h2>
          <p className="text-xs sm:text-sm text-[#70645c]">
            Create, view, update, deactivate, and manage passwords for batch student accounts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#581c3f] hover:bg-[#43132f] text-white shadow-md shadow-[#581c3f]/20 transition-all cursor-pointer active:scale-95 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New Student</span>
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

      {/* Password Status Filter Views */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPasswordFilter('ALL')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            passwordFilter === 'ALL'
              ? 'bg-[#581c3f] text-white shadow-md shadow-[#581c3f]/20'
              : 'bg-white text-[#6e5f56] border border-[#ebdccb] hover:bg-[#faf5ed]'
          }`}
        >
          <span>All Students</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              passwordFilter === 'ALL'
                ? 'bg-white/20 text-white'
                : 'bg-[#f4ebe1] text-[#581c3f]'
            }`}
          >
            {totalCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPasswordFilter('CHANGED')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            passwordFilter === 'CHANGED'
              ? 'bg-emerald-700 text-white shadow-md shadow-emerald-700/20'
              : 'bg-white text-emerald-800 border border-[#ebdccb] hover:bg-emerald-50'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>Password Changed</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              passwordFilter === 'CHANGED'
                ? 'bg-white/20 text-white'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {changedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPasswordFilter('PENDING')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            passwordFilter === 'PENDING'
              ? 'bg-amber-700 text-white shadow-md shadow-amber-700/20'
              : 'bg-white text-amber-800 border border-[#ebdccb] hover:bg-amber-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          <span>Password Change Pending</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              passwordFilter === 'PENDING'
                ? 'bg-white/20 text-white'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {pendingCount}
          </span>
        </button>
      </div>

      {/* Search & Status Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/80 p-3.5 rounded-xl border border-[#ebdccb]">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#8a7b70] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by student name or roll number..."
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
            All Accounts
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
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('DISABLED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'DISABLED'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white text-amber-800 border border-[#ebdccb] hover:bg-amber-50'
            }`}
          >
            Disabled
          </button>
        </div>
      </div>

      {/* Student Table */}
      <div className="overflow-x-auto bg-white rounded-2xl border border-[#ebdccb] shadow-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#eeddc8] bg-[#fdf9f3] text-[11px] font-bold uppercase tracking-wider text-[#7d6f66]">
              <th className="py-3 px-4">Roll Number</th>
              <th className="py-3 px-4">Student Name</th>
              <th className="py-3 px-4">Email Address</th>
              <th className="py-3 px-4 text-center">Password Status</th>
              <th className="py-3 px-4">Password Changed At</th>
              <th className="py-3 px-4 text-center">Account Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f2e9de] text-xs sm:text-sm">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#8c7e73]">
                  Loading students roster...
                </td>
              </tr>
            ) : filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#8c7e73]">
                  No student accounts found matching your filters.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => {
                const isActive = student.is_active !== false;
                const isPasswordChanged = student.must_change_password === false;
                return (
                  <tr key={student.id} className="hover:bg-[#faf5ed]/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#581c3f]">
                      {student.roll_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#3d2f2f]">
                        {student.full_name}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-[#6e5f56]">
                      {student.email || '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isPasswordChanged ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Changed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {student.password_changed_at ? (
                        <span className="text-xs text-[#6e5f56] font-mono">
                          {new Date(student.password_changed_at).toLocaleString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : (
                        <span className="text-xs text-[#a39488] italic">
                          Never / Pending
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(student)}
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full cursor-pointer transition-all ${
                          isActive
                            ? 'text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                            : 'text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                        }`}
                        title="Click to toggle status"
                      >
                        {isActive ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-amber-600" />
                            Disabled
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openRequireResetModal(student)}
                          className="p-1.5 rounded-lg text-[#695d54] hover:text-[#581c3f] hover:bg-[#faedf2] transition-colors cursor-pointer"
                          title="Require Password Reset on next login"
                        >
                          <RotateCcw className="w-4 h-4 text-[#581c3f]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(student)}
                          className="p-1.5 rounded-lg text-[#695d54] hover:text-[#581c3f] hover:bg-[#faedf2] transition-colors cursor-pointer"
                          title="Edit student profile"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openResetPassModal(student)}
                          className="p-1.5 rounded-lg text-[#695d54] hover:text-[#c59b27] hover:bg-[#fef8e7] transition-colors cursor-pointer"
                          title="Directly set new password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteModal(student)}
                          className="p-1.5 rounded-lg text-[#695d54] hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Delete / deactivate student"
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

      {/* CREATE STUDENT MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-md bg-[#fffdfa] rounded-2xl border border-[#ebdccb] shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-4 right-4 text-[#8a7b70] hover:text-[#4a1525] p-1.5 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-serif text-xl font-bold text-[#4a1525] mb-1">
              Create New Student Account
            </h3>
            <p className="text-xs text-[#70645c] mb-4">
              Provision a new student profile and authentication record.
            </p>

            <form onSubmit={handleCreateStudent} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Roll Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MCA2561"
                  value={newRoll}
                  onChange={(e) => setNewRoll(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Anand Krishna"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. 25mca001@mcafarewell.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Initial Password *
                </label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] font-mono focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="newIsActive"
                  checked={newIsActive}
                  onChange={(e) => setNewIsActive(e.target.checked)}
                  className="rounded text-[#581c3f] focus:ring-[#581c3f]"
                />
                <label htmlFor="newIsActive" className="text-xs font-medium text-[#4a1525] cursor-pointer">
                  Activate account immediately
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
                  {actionLoading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT STUDENT MODAL */}
      {isEditOpen && activeStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-md bg-[#fffdfa] rounded-2xl border border-[#ebdccb] shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="absolute top-4 right-4 text-[#8a7b70] hover:text-[#4a1525] p-1.5 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-serif text-xl font-bold text-[#4a1525] mb-1">
              Edit Student Profile
            </h3>
            <p className="text-xs text-[#70645c] mb-4">
              Update {activeStudent.full_name} ({activeStudent.roll_number})
            </p>

            <form onSubmit={handleUpdateStudent} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Roll Number *
                </label>
                <input
                  type="text"
                  required
                  value={editRoll}
                  onChange={(e) => setEditRoll(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 font-mono"
                />
                <p className="text-[11px] text-[#8a7b70] mt-1">
                  Updates Supabase Auth login email and student profile consistently.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="rounded text-[#581c3f] focus:ring-[#581c3f]"
                />
                <label htmlFor="editIsActive" className="text-xs font-medium text-[#4a1525] cursor-pointer">
                  Account is Active
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

      {/* RESET PASSWORD MODAL */}
      {isResetPassOpen && activeStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-sm bg-[#fffdfa] rounded-2xl border border-[#ebdccb] shadow-2xl p-6 max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              onClick={() => setIsResetPassOpen(false)}
              className="absolute top-4 right-4 text-[#8a7b70] hover:text-[#4a1525] p-1.5 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-10 h-10 rounded-xl bg-[#fef8e7] text-[#c59b27] flex items-center justify-center mb-3">
              <KeyRound className="w-5 h-5" />
            </div>

            <h3 className="font-serif text-lg font-bold text-[#4a1525] mb-1">
              Reset Password
            </h3>
            <p className="text-xs text-[#70645c] mb-4">
              Set a new password for {activeStudent.full_name} ({activeStudent.roll_number}).
            </p>

            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  placeholder="Enter new password (min 4 chars)"
                  value={resetPassVal}
                  onChange={(e) => setResetPassVal(e.target.value)}
                  className="w-full pr-10 px-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b70]"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsResetPassOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#6e5f56]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#581c3f] hover:bg-[#43132f] rounded-xl shadow-xs"
                >
                  {actionLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteOpen && activeStudent && (
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
              Delete Student Account?
            </h3>
            <p className="text-xs text-[#70645c] mb-4 leading-relaxed">
              Are you sure you want to remove <strong>{activeStudent.full_name} ({activeStudent.roll_number})</strong>?
              <br /><br />
              <em>Note:</em> If this student already has a finalized yearbook submission, the account will be safely deactivated rather than destroyed, preserving batch integrity.
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
                onClick={handleDeleteStudent}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-xs"
              >
                {actionLoading ? 'Processing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUIRE PASSWORD RESET CONFIRMATION MODAL */}
      {isRequireResetOpen && activeStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-md bg-[#fffdfa] rounded-2xl border border-[#ebdccb] shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              onClick={() => {
                setIsRequireResetOpen(false);
                setActiveStudent(null);
              }}
              className="absolute top-4 right-4 text-[#8a7b70] hover:text-[#4a1525] p-1.5 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-11 h-11 rounded-xl bg-[#faedf2] text-[#581c3f] flex items-center justify-center mb-3">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <h3 className="font-serif text-xl font-bold text-[#4a1525] mb-1">
              Require Password Reset
            </h3>
            <p className="text-xs text-[#70645c] mb-4">
              Require this student to set a new password on their next login.
            </p>

            {/* Student Info Card */}
            <div className="p-3.5 rounded-xl bg-[#fdf9f3] border border-[#ebdccb] space-y-1.5 text-xs text-[#4a1525] mb-4">
              <div>
                <span className="text-[#8a7b70]">Student Name:</span>{' '}
                <strong>{activeStudent.full_name}</strong>
              </div>
              <div>
                <span className="text-[#8a7b70]">Roll Number:</span>{' '}
                <strong className="font-mono text-[#581c3f]">{activeStudent.roll_number}</strong>
              </div>
              <div>
                <span className="text-[#8a7b70]">Email:</span>{' '}
                <span className="font-mono text-[#6e5f56]">{activeStudent.email || '—'}</span>
              </div>
              <div>
                <span className="text-[#8a7b70]">Current Password Status:</span>{' '}
                <span
                  className={`font-semibold ${
                    activeStudent.must_change_password === false
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {activeStudent.must_change_password === false ? 'Changed' : 'Already Pending'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 mb-5 leading-relaxed">
              <strong>Notice:</strong> At their next login, {activeStudent.full_name} will be blocked from accessing student features, the questionnaire, classmates page, and submission features until they successfully set a new password.
              <br /><br />
              <em>Existing answers, profile data, and submission records will remain completely intact.</em>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#ebdccb]">
              <button
                type="button"
                onClick={() => {
                  setIsRequireResetOpen(false);
                  setActiveStudent(null);
                }}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold text-[#6e5f56] hover:bg-[#faf5ed] rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequirePasswordReset}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-[#581c3f] hover:bg-[#43132f] rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {actionLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Require Password Reset</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
