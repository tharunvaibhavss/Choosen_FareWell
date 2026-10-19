# Deployment & Production Configuration Guide: MCA Memories 2025–2027

This guide outlines the complete, step-by-step process for deploying the **MCA Memories 2025–2027 Yearbook** application to **Vercel** with a live **Supabase** backend.

---

## 1. Overview of Architecture

```
                                  ┌───────────────────────────────┐
                                  │      Vercel (Frontend)        │
                                  │   React + TypeScript + Vite   │
                                  │   (Static SPA with rewrites)  │
                                  └───────────────┬───────────────┘
                                                  │
                                                  │ HTTPS / Supabase Client
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Supabase Cloud Project                                │
│                                                                                 │
│   ┌────────────────────┐   ┌──────────────────────┐   ┌─────────────────────┐   │
│   │   Supabase Auth    │   │  PostgreSQL (RLS)    │   │    Edge Function    │   │
│   │ (JWT / Password)   │   │  • profiles          │   │ 'admin-manage-user' │   │
│   │                    │   │  • questions (72)    │   │  (Privileged Admin  │   │
│   │                    │   │  • answers           │   │   user management)  │   │
│   │                    │   │  • submissions       │   │                     │   │
│   │                    │   │  • q_order (shuffle) │   │                     │   │
│   └────────────────────┘   └──────────────────────┘   └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Supabase Setup (Run Once)

### Step 2.1: Execute Schema Migration
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard) $\to$ select your project.
2. Navigate to **SQL Editor** on the left menu.
3. Click **+ New query**.
4. Open [`supabase/migrations/20250105_consolidated_initial_schema.sql`](file:///c:/Users/HP/Desktop/MCA%20Choosening/supabase/migrations/20250105_consolidated_initial_schema.sql) in your code editor.
5. Paste the complete SQL code and click **Run**.
6. Verify under **Table Editor** that the 5 tables exist:
   - `profiles`
   - `questions`
   - `student_question_order`
   - `answers`
   - `submissions`

### Step 2.2: (Optional) Question Bank Initialization
- **To start with an empty question bank (0 questions)**: Skip this step! You will create and publish questions directly from the website's Admin Dashboard.
- **To pre-load all 72 authentic yearbook memory questions**: In Supabase **SQL Editor**, open [`supabase/seed_questions.sql`](file:///c:/Users/HP/Desktop/MCA%20Choosening/supabase/seed_questions.sql) and click **Run**.

### Step 2.3: Provision the Initial Administrator Account
Supabase handles user authentication in `auth.users`. Passwords must be hashed via the Supabase Admin API. The provisioning script creates ONLY the single Initial Admin account (0 students).
1. In your Supabase Dashboard, go to **Project Settings** (gear icon) $\to$ **API**.
2. Under **Project API keys**, reveal and copy your `service_role` secret key.
3. In your local `.env.local` file (never commit this file), set:
   ```env
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-publishable-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-secret-key>
   INITIAL_ADMIN_EMAIL=admin@mca2527.college
   INITIAL_ADMIN_PASSWORD=Admin@MCA2025!
   ```
4. Run the provisioning script from your terminal:
   ```bash
   npx tsx scripts/provision_accounts.ts
   ```
5. Confirm in your Supabase Dashboard under **Authentication** $\to$ **Users** that the `admin@mca2527.college` account is created and linked to `profiles`.
6. Remove `SUPABASE_SERVICE_ROLE_KEY` from your local `.env.local` when done.

### Step 2.4: Deploy the Admin Edge Function (Required for managing students through website)
To create student accounts and manage passwords directly from the browser Admin Dashboard UI:
1. Link your Supabase project using Supabase CLI:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   ```
2. Deploy the Edge Function:
   ```bash
   npx supabase functions deploy admin-manage-user --no-verify-jwt
   ```
   *(Note: The function validates caller authorization and admin role inside the handler code).*


---

## 3. Supabase Authentication & URL Configuration

To ensure redirect links and password resets work properly between environments:

1. In Supabase Dashboard, navigate to **Authentication** $\to$ **URL Configuration**.
2. **Site URL**:
   Set this to your production Vercel URL, for example:
   ```
   https://mca-memories.vercel.app
   ```
3. **Redirect URLs (Allow list)**:
   Add both production and local development patterns:
   - `https://mca-memories.vercel.app/**`
   - `https://*-<your-vercel-team>.vercel.app/**` *(for Vercel preview deployments)*
   - `http://localhost:5173/**` *(for local development)*
   - `http://localhost:3000/**`
4. Click **Save**.

---

## 4. Vercel Deployment Configuration

### Step 4.1: Import Project to Vercel
1. Push your repository to GitHub / GitLab / Bitbucket.
2. In the [Vercel Dashboard](https://vercel.com/dashboard), click **Add New...** $\to$ **Project**.
3. Select your repository and import it.

### Step 4.2: Build & Output Settings
The project includes a pre-configured [`vercel.json`](file:///c:/Users/HP/Desktop/MCA%20Choosening/vercel.json) file:
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Single Page Application Routing**: Rewrites `/(.*)` to `/index.html`
- **Asset Caching**: 1-year immutable caching for static bundles in `/assets/*`

### Step 4.3: Environment Variables in Vercel
In the Vercel project settings, expand the **Environment Variables** section and configure:

| Variable Name | Environment | Value Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Production, Preview, Development | Your Supabase project URL (e.g. `https://xyz.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Production, Preview, Development | Your public Supabase anon / publishable key |

> ⚠️ **CRITICAL SECURITY NOTE**: 
> **NEVER** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel environment variables. Vite injects any variable referenced or bundled into client-side JavaScript. The service-role key belongs only in the Supabase Edge Function environment or local provisioning scripts.

### Step 4.4: Deploy
Click **Deploy**. Vercel will run `tsc -b && vite build` and serve the optimized static bundle.

---

## 5. Verification Checklist

After deployment, test the following checklist:

- [ ] **Login Screen**: Enter student roll number (e.g., `MCA2501`) and password. Verify successful authentication.
- [ ] **Questionnaire Load**: Verify questions 1 through 72 appear in a randomized order per student.
- [ ] **Classmate Selection (Rules A, B, C)**:
  - Select a classmate: Card highlights in solid burgundy with checkmark; selection indicator shows name.
  - Navigate away and return: Selection remains persisted from database.
  - Try selecting the same classmate on another question: Rule B prevents duplicate selection.
  - Try selecting self: Rule C blocks self-selection.
- [ ] **Clear / Unselect**: Test unselecting a selection via "Clear Selection" button.
- [ ] **Review Marker**: Test marking a question for review; check question navigator badge.
- [ ] **Final Submission (Rule D)**: Ensure submission is blocked with fewer than 59 answers. Complete 59 answers and submit; confirm read-only lock state.
- [ ] **Admin Dashboard**: Login as `admin`.
  - Check submission statistics and student completion counters.
  - Test question and student management.
  - Test "Download Excel Workbook" and inspect all 4 worksheets (Summary Report, Detailed Memory Responses, Student & Question Analysis, Student Selection Summary).
