import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  FileSpreadsheet, 
  Search, 
  Filter, 
  Download, 
  Sparkles,
  LayoutDashboard,
  UserCheck,
  BookOpen,
  ClipboardList,
  CheckCheck,
  ShieldCheck
} from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { BotanicalFlower, TapeStrip } from '../common/ScrapbookDecorations';
import { StudentManagementTab } from './StudentManagementTab';
import { QuestionManagementTab } from './QuestionManagementTab';
import type { StudentSummaryItem, AdminDashboardTab } from '../../types/database';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminDashboardTab>('overview');
  const [summaries, setSummaries] = useState<StudentSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'PENDING'>('ALL');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await AdminService.getStudentSummaries();
      setSummaries(data);
    } catch (err) {
      console.error('Error loading admin summaries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalStudents = summaries.length || 60;
  const completedCount = summaries.filter((s) => s.status === 'submitted').length;
  const pendingCount = totalStudents - completedCount;
  // Requirement 3: 59 required answers denominator for progress
  const completionPercentage = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;

  // Filtered rows for submissions
  const filteredStudents = summaries.filter((student) => {
    const matchesSearch =
      student.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.rollNumber.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'SUBMITTED') {
      return student.status === 'submitted';
    }
    if (statusFilter === 'PENDING') {
      return student.status !== 'submitted';
    }
    return true;
  });

  const handleExcelExport = async () => {
    try {
      setIsExporting(true);
      setExportNotice(null);
      await AdminService.exportToExcel();
      setExportNotice('✓ Excel workbook (.xlsx) downloaded successfully!');
      setTimeout(() => setExportNotice(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      alert(`Export error: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
      {/* Top Welcome Scrapbook Banner */}
      <div className="scrapbook-card p-6 sm:p-8 bg-[#fffdfa] relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <TapeStrip type="rose" className="absolute -top-2 left-8 rotate-2" />
        <TapeStrip type="gold" className="absolute -top-2 right-8 -rotate-2" />
        <BotanicalFlower className="absolute top-4 right-20 w-8 h-8 opacity-30 pointer-events-none" />

        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8a4f7d] bg-[#faedf2] px-2.5 py-0.5 rounded-full border border-[#eed5da] flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Administrator Console
            </span>
            <span className="text-xs text-[#8c7e73] font-serif italic">
              MCA Batch 2025–2027
            </span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-[#4a1525] mt-1.5">
            MCA Memories Yearbook Management
          </h1>
          <p className="text-xs sm:text-sm text-[#70645c] mt-1">
            Student accounts, dynamic question bank, submission auditing, and Excel exports.
          </p>
        </div>

        {/* Quick Export CTA */}
        <button
          type="button"
          onClick={handleExcelExport}
          disabled={isExporting}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-[#581c3f] hover:bg-[#43132f] text-white shadow-md shadow-[#581c3f]/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50 self-start md:self-auto"
        >
          {isExporting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Generating .xlsx...</span>
            </>
          ) : (
            <>
              <FileSpreadsheet className="w-4 h-4 text-[#ebd5dc]" />
              <span>Download Excel (.xlsx)</span>
              <Download className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {exportNotice && (
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-semibold animate-in fade-in">
          {exportNotice}
        </div>
      )}

      {/* 5-SECTION ADMIN DASHBOARD NAVIGATION TABS */}
      <nav className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#ebdccb]">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-[#581c3f] text-white shadow-xs'
              : 'bg-white/80 text-[#6e5f56] border border-[#ebdccb] hover:bg-[#faf5ed]'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'students'
              ? 'bg-[#581c3f] text-white shadow-xs'
              : 'bg-white/80 text-[#6e5f56] border border-[#ebdccb] hover:bg-[#faf5ed]'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Student Management</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('questions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'questions'
              ? 'bg-[#581c3f] text-white shadow-xs'
              : 'bg-white/80 text-[#6e5f56] border border-[#ebdccb] hover:bg-[#faf5ed]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Question Management</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('submissions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'submissions'
              ? 'bg-[#581c3f] text-white shadow-xs'
              : 'bg-white/80 text-[#6e5f56] border border-[#ebdccb] hover:bg-[#faf5ed]'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Student Submissions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('export')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'export'
              ? 'bg-[#581c3f] text-white shadow-xs'
              : 'bg-white/80 text-[#6e5f56] border border-[#ebdccb] hover:bg-[#faf5ed]'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Excel Export</span>
        </button>
      </nav>

      {/* TAB 1: DASHBOARD OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4 Summary Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="scrapbook-card p-5 bg-white/90">
              <div className="flex items-center justify-between text-[#8c7e73] mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Total Students
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#faf3ea] text-[#695d54] flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="font-serif text-3xl font-bold text-[#4a1525]">
                {totalStudents}
              </div>
              <span className="text-[11px] text-[#7d6f66] mt-1 block">
                Class of 2025–2027 Roster
              </span>
            </div>

            <div className="scrapbook-card p-5 bg-white/90">
              <div className="flex items-center justify-between text-emerald-800 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Completed (59/59)
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="font-serif text-3xl font-bold text-emerald-800">
                {completedCount}
              </div>
              <span className="text-[11px] text-emerald-700 mt-1 block">
                59+ answers verified & locked
              </span>
            </div>

            <div className="scrapbook-card p-5 bg-white/90">
              <div className="flex items-center justify-between text-amber-800 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Pending Submissions
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="font-serif text-3xl font-bold text-amber-800">
                {pendingCount}
              </div>
              <span className="text-[11px] text-amber-700 mt-1 block">
                Awaiting final submission
              </span>
            </div>

            <div className="scrapbook-card p-5 bg-white/90">
              <div className="flex items-center justify-between text-[#581c3f] mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Completion Rate
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#faedf2] text-[#581c3f] flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="font-serif text-3xl font-bold text-[#581c3f]">
                {completionPercentage}%
              </div>
              <div className="w-full bg-[#f0e6d8] h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-[#581c3f] h-full rounded-full transition-all duration-500"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Quick Action Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              onClick={() => setActiveTab('students')}
              className="scrapbook-card p-5 bg-[#fffdfa] hover:bg-[#faf5ed] transition-all cursor-pointer border border-[#ebdccb] flex items-start gap-3.5 group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#faedf2] text-[#581c3f] flex items-center justify-center group-hover:scale-105 transition-transform">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-[#4a1525]">
                  Student Management
                </h3>
                <p className="text-xs text-[#70645c] mt-0.5">
                  Add new students, update roll numbers, reset passwords, or deactivate accounts.
                </p>
              </div>
            </div>

            <div 
              onClick={() => setActiveTab('questions')}
              className="scrapbook-card p-5 bg-[#fffdfa] hover:bg-[#faf5ed] transition-all cursor-pointer border border-[#ebdccb] flex items-start gap-3.5 group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#fef8e7] text-[#c59b27] flex items-center justify-center group-hover:scale-105 transition-transform">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-[#4a1525]">
                  Question Bank (72)
                </h3>
                <p className="text-xs text-[#70645c] mt-0.5">
                  Configure memory question text, descriptions, and toggle active status.
                </p>
              </div>
            </div>

            <div 
              onClick={() => setActiveTab('submissions')}
              className="scrapbook-card p-5 bg-[#fffdfa] hover:bg-[#faf5ed] transition-all cursor-pointer border border-[#ebdccb] flex items-start gap-3.5 group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#faedf2] text-[#8a4f7d] flex items-center justify-center group-hover:scale-105 transition-transform">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-[#4a1525]">
                  Audit Submissions
                </h3>
                <p className="text-xs text-[#70645c] mt-0.5">
                  Inspect student completion counts out of 59 required answers.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STUDENT MANAGEMENT (CRUD) */}
      {activeTab === 'students' && <StudentManagementTab />}

      {/* TAB 3: QUESTION MANAGEMENT (CRUD) */}
      {activeTab === 'questions' && <QuestionManagementTab />}

      {/* TAB 4: STUDENT SUBMISSIONS */}
      {activeTab === 'submissions' && (
        <div className="scrapbook-card p-6 bg-[#fffdfa] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#ebdccb]">
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#4a1525]">
                Student Submissions Table
              </h2>
              <p className="text-xs text-[#70645c]">
                Live answer progress measured against the 59 required memories denominator.
              </p>
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
                All ({summaries.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('SUBMITTED')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === 'SUBMITTED'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-white text-emerald-800 border border-[#ebdccb] hover:bg-emerald-50'
                }`}
              >
                Submitted ({completedCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PENDING')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === 'PENDING'
                    ? 'bg-amber-700 text-white shadow-xs'
                    : 'bg-white text-amber-800 border border-[#ebdccb] hover:bg-amber-50'
                }`}
              >
                Pending ({pendingCount})
              </button>
            </div>
          </div>

          <div className="relative max-w-sm mb-2">
            <Search className="w-4 h-4 text-[#8a7b70] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by student name or roll number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] placeholder:text-[#a39488] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 focus:border-[#581c3f]"
            />
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-[#ebdccb] shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#eeddc8] bg-[#fdf9f3] text-[11px] font-bold uppercase tracking-wider text-[#7d6f66]">
                  <th className="py-3 px-4">Roll Number</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4 text-center">Required Progress (59 Denominator)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Submitted Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2e9de] text-xs sm:text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#8c7e73]">
                      Loading student submission records...
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#8c7e73]">
                      No students found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-[#faf5ed]/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#581c3f]">
                        {student.rollNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#3d2f2f]">
                          {student.fullName}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-xs ${
                            student.answeredCount >= 59
                              ? 'bg-emerald-100 text-emerald-800'
                              : student.answeredCount > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {student.answeredCount} / 59
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {student.status === 'submitted' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Submitted
                          </span>
                        ) : student.status === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                            <Clock className="w-3 h-3 text-amber-600" />
                            In Progress
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-0.5 rounded-full">
                            Not Started
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-[#7d6f66]">
                        {student.submittedAt
                          ? new Date(student.submittedAt).toLocaleString()
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: EXCEL EXPORT */}
      {activeTab === 'export' && (
        <div className="scrapbook-card p-6 sm:p-8 bg-[#fffdfa] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdccb]">
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#4a1525]">
                Yearbook Submissions Export (.xlsx)
              </h2>
              <p className="text-xs sm:text-sm text-[#70645c] mt-1">
                Generates a multi-sheet Microsoft Excel workbook containing full submission summaries and detailed memory answers.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExcelExport}
              disabled={isExporting}
              className="flex items-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm bg-[#581c3f] hover:bg-[#43132f] text-white shadow-md shadow-[#581c3f]/25 transition-all cursor-pointer active:scale-95 disabled:opacity-50 self-start sm:self-auto"
            >
              {isExporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating .xlsx File...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-5 h-5 text-[#ebd5dc]" />
                  <span>Download Excel Workbook</span>
                  <Download className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#faedf2] border border-[#eed5da]">
              <div className="flex items-center gap-2 text-[#581c3f] font-bold text-sm mb-1">
                <CheckCheck className="w-4 h-4" />
                <span>Sheet 1: Summary Report</span>
              </div>
              <p className="text-xs text-[#70645c] leading-relaxed">
                Contains all {summaries.length} student profiles with their unique roll numbers, full names, active account status, answered counts (evaluated out of 59 required), and submission timestamps.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#fef8e7] border border-[#e8d29b]">
              <div className="flex items-center gap-2 text-[#946e10] font-bold text-sm mb-1">
                <CheckCheck className="w-4 h-4 text-[#c59b27]" />
                <span>Sheet 2: Detailed Memory Responses</span>
              </div>
              <p className="text-xs text-[#70645c] leading-relaxed">
                Contains every granular answer recorded: Respondent Roll Number & Name, Question Number, Memory Prompt Text, Selected Classmate Roll Number & Name, and Timestamp.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
