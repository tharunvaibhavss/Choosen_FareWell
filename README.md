# MCA Memories 2025–2027 • Yearbook Questionnaire

A complete, production-ready, vintage scrapbook-themed **MCA Memories 2025–2027 Yearbook Questionnaire** web application. Built with React 19, TypeScript, Vite, Tailwind CSS, Supabase PostgreSQL, Supabase Auth, Row Level Security (RLS), and ExcelJS.

---

## 📸 Visual Style & Aesthetic

Faithfully inspired by vintage scrapbooks and the project design references:
- **Warm cream and beige paper background**: Subtle paper textures, torn-edge borders, washi tape corners, and botanical pressed flowers.
- **Color Palette**: Deep burgundy (`#581c3f`), plum (`#8a4f7d`), dusty pink (`#d99ca5`), and vintage gold (`#c59b27`).
- **Typography**: Elegant serif headings (*Playfair Display*) and clean modern sans-serif body text (*Outfit*).
- **Notebook Ring Binding**: Realistic spiral ring binding and punched holes.
- **Three Circular Progress Indicators**: Answered (Burgundy), Yet to Answer (Light gray/cream), and Marked for Review (Vintage gold).
- **Interactive 72-Question Grid**: Color-coded buttons with outline indicators for the active question.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS with custom CSS scrapbook tokens, washi tape clip-paths, and textures
- **Backend & Database**: Supabase PostgreSQL
- **Security & Authorization**: Supabase Auth + PostgreSQL Row Level Security (RLS) + Atomic Stored Functions
- **Excel Export**: ExcelJS (Generates multi-sheet styled `.xlsx` files with customized palettes, headers, and borders)
- **Icons**: Lucide React
- **Celebration**: Canvas Confetti

---

## 👥 User Accounts & Roles (61 Total)

The application provisions **exactly 61 intended accounts**:
1. **1 Administrator Account**:
   - Identifier: `admin` or `admin@mca2527.college`
   - Role: `admin`
   - Access: Admin Dashboard, Live Submissions Table, Audited Excel `.xlsx` Export
2. **60 Student Accounts**:
   - Roll Numbers: `MCA2501` through `MCA2560`
   - Email format: `mca25xx@mca2527.college`
   - Access: Student Questionnaire, persistent randomized 72 memories, personal submission lock

---

## 🏛️ Database Schema

The database migration is located at [`supabase/migrations/20250101_init_schema.sql`](supabase/migrations/20250101_init_schema.sql).

### 1. `profiles`
- `id` (UUID, Primary Key, references `auth.users(id)` on delete cascade)
- `roll_number` (TEXT, Unique, indexed)
- `full_name` (TEXT)
- `role` (TEXT, check `role IN ('admin', 'student')`)
- `created_at` (TIMESTAMPTZ)

### 2. `questions`
- `id` (UUID, Primary Key)
- `question_number` (INT, Unique, 1 to 72)
- `question_text` (TEXT)
- `is_active` (BOOLEAN, default true)
- `created_at` (TIMESTAMPTZ)

### 3. `student_question_order`
- `id` (UUID, Primary Key)
- `respondent_id` (UUID, references `profiles(id)`)
- `question_id` (UUID, references `questions(id)`)
- `position` (INT, 1 to 72)
- `is_marked_for_review` (BOOLEAN, default false)
- `created_at` (TIMESTAMPTZ)
- *Constraints*: `UNIQUE (respondent_id, question_id)`, `UNIQUE (respondent_id, position)`

### 4. `answers`
- `id` (UUID, Primary Key)
- `respondent_id` (UUID, references `profiles(id)`)
- `question_id` (UUID, references `questions(id)`)
- `selected_student_id` (UUID, references `profiles(id)`)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)
- *Constraints*:
  - **Rule A**: `UNIQUE (respondent_id, question_id)` (one classmate per question)
  - **Rule B**: `UNIQUE (respondent_id, selected_student_id)` (a classmate cannot be reused across questions)
  - **Rule C**: `CHECK (selected_student_id <> respondent_id)` (no self-selection)

### 5. `submissions`
- `id` (UUID, Primary Key)
- `student_id` (UUID, Unique, references `profiles(id)`)
- `answer_count` (INT, check `answer_count >= 59`)
- `status` (TEXT, `status IN ('submitted', 'reopened')`)
- `submitted_at` (TIMESTAMPTZ)

---

## 🛡️ Security, RLS & Server-Side Functions

Row Level Security is enabled on all tables:
- **`profiles`**: Any authenticated user can read student profiles (needed for the selection grid). Only the profile owner or admin can read private admin records. Role cannot be escalated by users.
- **`questions`**: Active questions are readable by all authenticated users; only administrators can create or edit questions.
- **`answers`**: Students can only `SELECT`, `INSERT`, and `UPDATE` their own answers (`respondent_id = auth.uid()`), and **cannot edit answers once their submission record exists**.
- **`submissions`**: Students can only read and insert their own submission record.

### Stored Database Functions:
1. `get_or_create_student_question_order(p_student_id UUID)`: Atomically generates and persists a randomized order of all 72 active questions for each student. Persists across refresh, logout, or new devices.
2. `save_student_answer(p_question_id UUID, p_selected_student_id UUID)`: Validates authenticated user, rejects self-selection, rejects reuse, verifies target student profile, and upserts atomically.
3. `toggle_student_question_review(p_question_id UUID, p_is_marked BOOLEAN)`: Toggles review marker without altering answers.
4. `submit_questionnaire()`: Revalidates that `>= 59` valid answers exist, ensures all chosen classmates are unique, checks zero self-selections, and atomically inserts the submission record.

---

## ⚖️ Mandatory Validation Rules

| Rule | Description | Implementation |
|---|---|---|
| **Rule A** | One answer per question | Unique constraint on `(respondent_id, question_id)` in `answers` table |
| **Rule B** | Classmates cannot be reused | Unique constraint on `(respondent_id, selected_student_id)` + dynamic client badge `Lock: Q#` |
| **Rule C** | No self-selection | Check constraint `selected_student_id <> respondent_id` + `auth.uid()` derivation |
| **Rule D** | Exactly 59 answers required | Submit button gated at `answers >= 59`; enforced on DB function `submit_questionnaire()` |
| **Rule E** | Save & resume | Immediate persistence on each selection; restored automatically on login |
| **Rule F** | Mark for Review | Persisted boolean flag in `student_question_order`; gold circular ring indicator |
| **Rule G** | Final submission & lock | Confirmation modal with checklist; idempotent atomic insert into `submissions`; permanently locks answers |

---

## 📊 Administrator Dashboard (5 Core Sections)

The Admin Dashboard provides five dedicated tabs adhering to the warm cream scrapbook and vintage burgundy design:

1. **Dashboard Overview**:
   - Total Students: 60 (or active student count)
   - Completed Submissions count & Pending Submissions count
   - Batch Completion Rate calculated against the 59 required answers
   - Quick download CTA for real Excel `.xlsx` exports

2. **Student Management (CRUD)**:
   - Full student accounts table with Roll Number, Full Name, Login Identifier/Email, Status, and Actions
   - **Create Account**: Add a new student account with unique roll number, name, and initial password
   - **Edit Account**: Modify student names and roll numbers with duplicate checking
   - **Reset Password**: Secure password update with show/hide password toggle
   - **Activate / Deactivate**: Instant toggle between Active and Disabled status
   - **Safe Deletion**: Deletion dialog with protection—if a student already has a final submission, their account is safely deactivated instead of deleted to protect historical yearbook data
   - **Search & Filter**: Filter by All, Active, or Disabled students; real-time search by roll number or name

3. **Question Management (CRUD)**:
   - Header counter showing: `Configured: 72 / 72 Questions (X Active)`
   - Full question table showing Question Number (1–72), Question Title, Category, Description, Status, and Actions
   - **Create Question**: Add questions with unique number validation constrained to the range 1–72
   - **Edit Question**: Update question title and description dynamically without editing code
   - **Activate / Deactivate**: Toggle questions active/inactive
   - **Safe Archival**: If a question has recorded student answers, attempting to delete it safely deactivates and archives it rather than corrupting student progress
   - **Dynamic Loading**: Loads dynamically from Supabase database or persistent store

4. **Student Submissions**:
   - Filter by All, Submitted, or Pending
   - Real-time search by name or roll number
   - Answer count badge evaluated against the 59 required answers (`59 / 59` green, `in progress` amber)
   - Submission timestamp and audit details

5. **Excel Export (`.xlsx`)**:
   - Powered by **ExcelJS**
   - **Sheet 1: Summary Report**: Roll Number, Full Name, Answered Count (out of 59 required), Status, Submission Timestamp for all students.
   - **Sheet 2: Detailed Answers**: Respondent Roll Number, Respondent Name, Question Number, Memory Question Text, Selected Classmate Roll Number, Selected Classmate Name, Timestamp.
   - Styled headers with Burgundy `#581C3F` & Gold `#C59B27`, alternate row shading, and cell borders.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+ (tested on Node v24)
- npm 9+

### 2. Installation
```bash
npm install
```

### 3. Environment Variables
Create `.env.local` based on `.env.example`:
```ini
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key # Only needed for scripts/provision_accounts.ts
```

> **Note on Local / Demo Mode**: If `VITE_SUPABASE_URL` is left empty, the application automatically runs in **high-fidelity Local Persistent Mode**. All 61 accounts, 72 questions, Rule A–G constraints, and Excel export work seamlessly out of the box with zero setup!

### 4. Database Setup & Account Provisioning
1. Open your Supabase SQL Editor and run `supabase/migrations/20250101_init_schema.sql`.
2. Seed the 72 memory questions with `supabase/seeds/01_questions.sql`.
3. Provision all 61 accounts via the secure Node script:
   ```bash
   npx tsx scripts/provision_accounts.ts
   ```

### 5. Running the Application
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing Scenarios

1. **Authentication**:
   - Sign in as `MCA2501` with password `mca2025` (or click the quick preset).
   - Sign in as `admin` with password `Admin@MCA2025!`.
2. **Self-Selection Prevention (Rule C)**:
   - When logged in as `MCA2501` (Aishwarya Nair), card `MCA2501` is disabled with the badge `You (Self)`.
3. **Classmate Reuse Prevention (Rule B)**:
   - Select `MCA2502` (Arjun Menon) on Question 1.
   - Click **Save & Next** to go to Question 2.
   - Notice `MCA2502` is now disabled with badge `Q1`.
4. **Randomized Question Order**:
   - Each student gets a unique, persistent random ordering of the 72 questions. Refreshing or logging in from another device maintains the exact sequence.
5. **Mark for Review**:
   - Click **Mark for Review** on any question. The question number turns gold in the sidebar grid, and the circular ring count updates.
6. **59 Answers Submission Gate (Rule D & G)**:
   - Answering 58 memories keeps Submit disabled (`Submit (58/59)`).
   - Answering 59 memories unlocks the glowing green Submit button (`Submit Questionnaire (59/59)`).
   - Clicking Submit shows the confirmation checklist and permanently locks the questionnaire into read-only mode.
7. **Admin Dashboard & Excel Export**:
   - Sign in as `admin`.
   - View live statistics and the submissions table.
   - Click **Download Excel Report (.xlsx)** to download the complete dual-sheet workbook.
