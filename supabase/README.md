# Supabase Database Setup & Architecture Guide

This guide provides simple, step-by-step instructions for setting up the **MCA Memories 2025–2027 Yearbook** database in your Supabase project.

---

## 1. Quick Summary of Files

### ✅ Files You MUST Run (In this exact order)

| Order | File | What it does | Where to run it |
|:---:|---|---|---|
| **Step 1** | [`supabase/migrations/20250105_consolidated_initial_schema.sql`](file:///c:/Users/HP/Desktop/MCA%20Choosening/supabase/migrations/20250105_consolidated_initial_schema.sql) | Creates all 5 tables, safety rules, row-level security, and database functions. Safe & non-destructive (`IF NOT EXISTS`). Leaves 0 questions and 0 students. | **Supabase SQL Editor** |
| **Step 2** | [`scripts/provision_accounts.ts`](file:///c:/Users/HP/Desktop/MCA%20Choosening/scripts/provision_accounts.ts) | Creates the **1 Initial Admin account** inside Supabase Auth safely using the Admin API. Creates 0 students. | **Your Terminal CLI** |
| **Optional** | [`supabase/seed_questions.sql`](file:///c:/Users/HP/Desktop/MCA%20Choosening/supabase/seed_questions.sql) | *(Optional)* Pre-seeds 72 yearbook memory questions. Skip if you want to start with 0 questions and add them via the Admin Dashboard. | **Supabase SQL Editor** |


---

### ❌ Original Files You Should NOT Run

| File | Why you should NOT run it |
|---|---|
| `20250101_init_schema.sql` | **Outdated & Incomplete**: Missing `email` and `is_active` columns. Contains destructive `DROP TABLE ... CASCADE` which will wipe data if tables exist. |
| `20250102_admin_crud.sql` | **Conflicting signatures**: Creates `admin_create_student` with 4 parameters instead of 5, which breaks the frontend TypeScript calls. |
| `20250103_updates_unselect_email.sql` | **Incomplete patch**: Only alters tables; will fail if run on an empty database. |
| `20250104_randomized_order_and_cleanup.sql` | **Incomplete patch**: Only patches one function; cannot run standalone. |
| `0001_initial_schema.sql` | Contains destructive `DROP TABLE CASCADE` commands at the top. Replaced by `20250105_consolidated_initial_schema.sql`. |
| `02_provision_accounts.sql` | Contains only SQL comments; does not actually create Supabase Auth accounts. |
| `seed.sql` | Contains sample placeholder text. Replaced by `seed_questions.sql` which has the real 72 questions. |

---

## 2. Step-by-Step Instructions

### Step 1: Run the Consolidated Initial Schema
1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to your project and click **SQL Editor** on the left menu.
3. Click **+ New Query**.
4. Open [`supabase/migrations/20250105_consolidated_initial_schema.sql`](file:///c:/Users/HP/Desktop/MCA%20Choosening/supabase/migrations/20250105_consolidated_initial_schema.sql) in your code editor.
5. Copy all the SQL text and paste it into the Supabase SQL Editor.
6. Click the green **Run** button (or press `Ctrl+Enter` / `Cmd+Enter`).
7. Confirm that the message says: `Success. No rows returned`.
8. Click **Table Editor** on the left menu and verify that these 5 tables exist:
   - `profiles`
   - `questions`
   - `student_question_order`
   - `answers`
   - `submissions`

---

### Step 2: Provision the Initial Administrator Account
In Supabase, user logins are managed by **Supabase Auth** (not plain database tables). Passwords must be hashed via the Supabase Admin API. The provisioning script creates ONLY the single Initial Admin account (0 students).

To create the initial Admin account:
1. In your Supabase Dashboard, go to **Project Settings** (gear icon) $\to$ **API**.
2. Scroll to **Project API keys** and copy the **`service_role`** secret key (click "Reveal").
3. In your local `.env.local` file, add this key:
   ```env
   SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-secret-key-here
   INITIAL_ADMIN_EMAIL=admin@mca2527.college
   INITIAL_ADMIN_PASSWORD=Admin@MCA2025!
   ```
   > 🔒 **Security Notice:** The `SUPABASE_SERVICE_ROLE_KEY` is a private server-side secret. Never put `VITE_` in front of it, never commit it to Git, and never use it in browser code.

4. Open your terminal in the project directory and run:
   ```bash
   npx tsx scripts/provision_accounts.ts
   ```
5. You will see confirmation in your terminal:
   ```text
   MCA Memories 2025–2027: Initial Admin Account Setup
   [Step 1/3] Checking existing Supabase Auth users...
   [Step 2/3] Creating initial Admin user in Supabase Auth...
     ✓ Auth user successfully created
   [Step 3/3] Verifying and linking admin profile...
     ✓ Admin profile upserted successfully
   🎉 Initial Admin Account Ready!
   ```
6. Once completed, you can delete or clear `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.

---

### Step 3: (Optional) Pre-seed the 72 Authentic Questions
- **If you want to start with an empty question bank (0 questions)**: Skip this step! You can create and publish questions directly through the Admin Dashboard website UI.
- **If you prefer pre-loading all 72 authentic yearbook memory questions**:
  1. In the Supabase **SQL Editor**, click **+ New Query**.
  2. Open [`supabase/seed_questions.sql`](file:///c:/Users/HP/Desktop/MCA%20Choosening/supabase/seed_questions.sql).
  3. Paste the SQL and click **Run**.


---

## 3. Database Security & Features Overview

- **Rule A (One answer per question)**: Enforced by `uq_answers_respondent_question`.
- **Rule B (One nomination per classmate)**: Enforced by `uq_answers_respondent_classmate`. A student cannot pick the same classmate for multiple questions.
- **Rule C (No self-selection)**: Enforced by check constraint `chk_no_self_selection` and in stored procedures.
- **Rule D (Minimum 59 answers required)**: Enforced in table check `submissions.answer_count >= 59` and atomically verified inside `submit_questionnaire()`.
- **Randomized Question Ordering**: The function `get_or_create_student_question_order()` presents questions in a randomized sequence for each student while persisting that order permanently in `student_question_order`.
- **Row Level Security (RLS)**:
  - Students can only see their own answers and draft data.
  - Students can never view another classmate's answers.
  - Students can never elevate their own role to admin.
  - Admins can manage student accounts, activate/deactivate students, and view submission reports.
  - Deleting a student who already has a final submission safely deactivates the account rather than deleting their record, preserving yearbook integrity.

---

## 4. Production Deployment & Vercel Configuration

For full production deployment instructions, see [`DEPLOYMENT.md`](../DEPLOYMENT.md).

### Quick Environment Variable Checklist
In your Vercel Project Settings → **Environment Variables**, provide:
- `VITE_SUPABASE_URL`: Your Supabase Project URL (`https://<project-ref>.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Your Supabase public anonymous key

### Quick Supabase Auth Redirect Checklist
In Supabase Dashboard → **Authentication** → **URL Configuration**:
- **Site URL**: `https://<your-vercel-app>.vercel.app`
- **Redirect URLs**:
  - `https://<your-vercel-app>.vercel.app/**`
  - `http://localhost:5173/**`

