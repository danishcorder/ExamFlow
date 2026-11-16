# ExamFlow — Enterprise Multi-Tenant Examination & Assessment Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-cyan.svg)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack%20Start-1.168-coral.svg)](https://tanstack.com/start)
[![Vite](https://img.shields.io/badge/Vite-8.1-purple.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.2-38bdf8.svg)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20RLS-3ecf8e.svg)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Vitest-34%20Passed-brightgreen.svg)](https://vitest.dev/)

ExamFlow is a commercial, multi-tenant examination and assessment platform designed for schools, colleges, universities, and training institutions. It powers end-to-end examination workflows: multi-tenant administration, academic hierarchy, rich question banks, exam authoring with immutable version snapshots, a resilient student examination engine with autosave and offline recovery, automated MCQ and manual descriptive grading with rubrics, invigilator proctoring review, and commercial SaaS subscription management.

---

## Table of Contents
1. [Core Features & Architecture](#core-features--architecture)
2. [Tech Stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Local Development Setup](#local-development-setup)
5. [Database Setup & Migrations](#database-setup--migrations)
6. [Complete Operational Walkthrough](#complete-operational-walkthrough)
   - [1. Institution & Admin Setup](#1-institution--admin-setup)
   - [2. Academic Structure Configuration](#2-academic-structure-configuration)
   - [3. Teacher & Student Provisioning](#3-teacher--student-provisioning)
   - [4. Question Bank Authoring](#4-question-bank-authoring)
   - [5. Assembling & Publishing Exams](#5-assembling--publishing-exams)
   - [6. Taking Exams (Student Engine)](#6-taking-exams-student-engine)
   - [7. Grading & Feedback (Teacher Dashboard)](#7-grading--feedback-teacher-dashboard)
   - [8. Student Report Cards & Results](#8-student-report-cards--results)
   - [9. Proctoring & Invigilator Review](#9-proctoring--invigilator-review)
   - [10. SaaS Subscriptions & Quotas](#10-saas-subscriptions--quotas)
7. [Deploying on Vercel](#deploying-on-vercel)
8. [Deploying on Node.js / Docker / Cloud Run](#deploying-on-nodejs--docker--cloud-run)
9. [Pushing to GitHub](#pushing-to-github)
10. [Testing & Verification](#testing--verification)
11. [Security, RBAC, and Tenant Isolation](#security-rbac-and-tenant-isolation)

---

## Core Features & Architecture

ExamFlow is built with strict multi-tenant isolation and server-authoritative validation:

- **Multi-Tenant Architecture**: Strict institution isolation enforced directly inside PostgreSQL with Row-Level Security (RLS) policies. Tenant boundaries cannot be bypassed from client-side code.
- **Role-Based Access Control (RBAC)**: Validated on both frontend and server:
  - **Platform Super Admin**: Oversees all institutions, health metrics, and platform governance.
  - **Institution Admin**: Manages institution profile, departments, members, invitations, cohorts, and billing.
  - **Teacher / Examiner**: Authors question banks, constructs exams, monitors participation, and grades descriptive answers.
  - **Student**: Accesses eligible exams, takes timed tests with autosave, and views published reports.
  - **Invigilator**: Monitors proctoring timelines, audits focus loss, and documents review outcomes.
- **Supabase OAuth 2.1 Server**: Built-in authorization server providing OAuth 2.1 compliant authorization code flows with PKCE, consent screens, token exchange, and token introspection.
- **Academic Management**: Full hierarchy supporting academic sessions, terms/semesters, departments, academic programs, classes, sections, and courses.
- **Centralized Question Bank**: Author single-choice MCQs, multi-choice MCQs, and descriptive questions with topic tags, difficulty levels, explanation notes, and attachments.
- **Exam Builder**: Modular section design, question selection from bank, time window scheduling, negative marking rules, question and option shuffling, student cohort assignment, and publishing immutable version snapshots.
- **Student Examination Engine**:
  - Secure exam instructions & start confirmation.
  - Server-authoritative timer and deadline enforcement.
  - Non-blocking autosave with visual status indicators (`saved`, `saving`, `error`).
  - Local storage answer buffering with seamless refresh and disconnection recovery.
  - Idempotent submission preventing duplicate attempts.
- **Grading & Results Engine**:
  - Automatic MCQ grading using server-side answer keys with configurable negative marking.
  - Dedicated **TeacherGradingDashboard** for evaluating descriptive answers, inspecting MCQ scores, assigning rubric criteria, and writing qualitative feedback.
  - Draft grading and result moderation workflows with audit triggers.
  - Secure result publication (students cannot view unpublished grades or answer keys).
  - Student report cards with question-by-question performance breakdowns.
- **Advanced Proctoring & Invigilator Review**:
  - Real-time client signal capture: fullscreen exit events, tab visibility changes, and window blur/focus events.
  - Camera and microphone stream status indicators.
  - **InvigilatorReviewDashboard** with chronological incident timelines and review outcomes (`cleared`, `penalized`, `under_review`).
- **Commercial SaaS Management**:
  - Tiered subscription management (`Free`, `Starter`, `Professional`, `Enterprise`).
  - Enforced quotas on active exams, student enrollments, and teacher accounts.
  - Self-serve upgrade interface for administrators.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [TanStack Start](https://tanstack.com/start) + [React 19](https://react.dev/) |
| **Routing** | [TanStack Router](https://tanstack.com/router) with type-safe route trees |
| **State & Server Cache** | [TanStack React Query v5](https://tanstack.com/query) |
| **Styling & UI** | [Tailwind CSS v4](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) + [Lucide Icons](https://lucide.dev/) |
| **Build & Dev Server** | [Vite 8](https://vitejs.dev/) + [Nitro](https://nitro.unjs.io/) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL 15+, GoTrue Auth, Storage, PostgREST) |
| **Testing** | [Vitest](https://vitest.dev/) + [@testing-library/react](https://testing-library.com/) |

---

## Prerequisites

Before running ExamFlow, ensure you have:

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Package Manager**: `npm` (v10+), `bun`, or `pnpm`
- **Supabase Account**: A free or paid project at [supabase.com](https://supabase.com) (or a local instance via Supabase CLI).

---

## Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/examflow.git
cd examflow
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Open `.env` and fill in your Supabase credentials:
```env
# Application URL (used for OAuth callbacks and server redirects)
APP_URL="http://localhost:3000"

# Supabase Server-side Credentials
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

# Client-side Supabase Credentials (must be prefixed with VITE_)
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-key"
VITE_SUPABASE_PROJECT_ID="your-project-id"
```

> **Security Note**: Never expose `SUPABASE_SERVICE_ROLE_KEY` to frontend code or commit `.env` to GitHub.

---

## Database Setup & Migrations

ExamFlow includes 8 sequential SQL migration files in `supabase/migrations/` that configure tables, foreign keys, RLS policies, indexes, and audit triggers.

### Running Migrations in Order

Navigate to your Supabase Project **SQL Editor** and run the following migration files sequentially:

1. `supabase/migrations/20261115000000_phase2_auth_roles_rls.sql`
   - Configures `profiles`, `platform_admins`, `institutions`, `institution_memberships`, `institution_invitations`, and `institution_audit_logs`.
   - Provisions `create_institution_with_owner` and invitation acceptance RPCs.
2. `supabase/migrations/20261115000001_phase3_academic_management.sql`
   - Configures academic sessions, terms, departments, programs, classes, sections, courses, teacher assignments, and student records.
3. `supabase/migrations/20261115000002_phase4_question_bank.sql`
   - Configures question banks, questions, options, answer keys, attachments, and question sets.
4. `supabase/migrations/20261115000003_phase5_exam_builder.sql`
   - Configures exams, sections, section questions, cohort assignments, versions, and version answer keys.
5. `supabase/migrations/20261116000000_question_banks_and_teacher_student_relations.sql`
   - Configures relationships between courses, question banks, and student cohorts.
6. `supabase/migrations/20261116000001_phase6_examination_engine.sql`
   - Configures `exam_attempts` and `exam_attempt_answers` with atomic save constraints and student RLS.
7. `supabase/migrations/20261116000002_phase7_grading_results.sql`
   - Configures `exam_attempt_grades`, `exam_question_grades`, grade change audit triggers, and result visibility isolation.
8. `supabase/migrations/20261116000003_phase8_proctoring_saas.sql`
   - Configures `exam_proctoring_events`, `exam_attempt_reviews`, and `institution_subscriptions`.

### Create Storage Bucket for Attachments
In your Supabase Dashboard, go to **Storage** and create a new bucket:
- **Bucket Name**: `question-attachments`
- **Public**: Enabled (or Authenticated with read access for authenticated users)

### Verify Database Readiness
Verify connectivity, all 32 required tables, RPC functions, and the storage bucket with:
```bash
npm run db:check
```

Expected output:
```text
Checking Supabase project: https://your-project.supabase.co
OK   Auth (GoTrue): online
OK   Tables: 32/32 present in schema cache
OK   RPCs: 3/3 registered
OK   Storage bucket 'question-attachments': present

PASS: Supabase Auth, PostgREST schema, RPCs, and Storage bucket are ready.
```

### Start Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Complete Operational Walkthrough

### 1. Institution & Admin Setup
1. Open [http://localhost:3000/auth](http://localhost:3000/auth) and sign up with your email.
2. After authentication, navigate to **Onboarding** (`/app/onboarding`) to create your institution (e.g. `Oakridge Academy`, slug `oakridge`).
3. You are automatically provisioned as the **Institution Admin** with owner rights.

### 2. Academic Structure Configuration
Navigate to **Academics** (`/app/academics`):
1. **Academic Session**: Create a session (e.g. `2026-2027 Academic Year`).
2. **Academic Term**: Add a term (e.g. `Fall Semester 2026`).
3. **Department**: Add departments (e.g. `Department of Biological Sciences`).
4. **Courses**: Add courses (e.g. `BIO101 — General Biology`).

### 3. Teacher & Student Provisioning
1. **Invite Teachers**: Navigate to **Members** (`/app/members`) and invite colleague emails with the `Teacher / Examiner` role.
2. **Add Students**: Navigate to **Students** (`/app/students`) to create student records with unique student roll codes (e.g. `BIO-001`, `BIO-002`) and emails.

### 4. Question Bank Authoring
Navigate to **Question Bank** (`/app/question-bank`):
1. Create a Question Bank linked to a course.
2. Click **Add Question**:
   - **Single-Choice MCQ**: Enter title, prompt, add options (A, B, C, D), select the correct option, and assign marks (e.g., 5 marks, -1 negative mark).
   - **Descriptive Question**: Enter title, prompt, expected word count (e.g., 250 words), sample model answer, and grading rubric criteria.

### 5. Assembling & Publishing Exams
Navigate to **Exam Builder** (`/app/exams`):
1. Click **New Exam Draft**:
   - Provide Title (e.g. `Biology Midterm Examination`), Course, Duration (e.g. 60 minutes), Schedule Start & End window.
   - Configure Passing Marks (e.g. 25 marks) or Passing Percentage (e.g. 50%).
   - Configure Negative Marking and Option Shuffling.
2. In the **Exam Builder Studio**:
   - Add sections (e.g. `Section A: Genetics MCQs` and `Section B: Written Response`).
   - Click **Pick Questions** to import questions from your question banks.
   - Assign candidate student cohorts under the **Cohort Assignments** tab.
3. Click **Preview** to inspect the student-safe test render.
4. Click **Publish Exam**: This freezes the exam and generates an immutable version snapshot (`v1`) with encrypted answer keys.

### 6. Taking Exams (Student Engine)
1. Sign in with a student email associated with an enrolled student record.
2. Navigate to `/app/student`:
   - The student sees assigned exams categorized as **Active Now**, **Upcoming**, or **Completed**.
3. Click **Start Exam**:
   - Read instructions and click **I Understand, Begin Exam**.
4. The **Exam Taking Workspace** opens:
   - Server-enforced timer counts down.
   - Answer MCQ questions with radio buttons.
   - Answer descriptive questions with live character/word count.
   - Visual status pill displays `All changes saved` after automatic debounced autosave.
   - Refreshing the browser automatically restores answers from local buffers and the server.
5. Click **Submit Exam**:
   - Confirmation dialog summarizes answered vs. unanswered questions.
   - Once submitted, the attempt is sealed with a digital timestamp receipt.

### 7. Grading & Feedback (Teacher Dashboard)
1. Sign in as a Teacher or Admin and open **Teacher Workspace** (`/app/teacher`) or **Exam Builder** (`/app/exams`).
2. Click **Grade** on the published exam to launch the **TeacherGradingDashboard**:
   - View summary KPIs: Total Submissions, Graded Submissions, Published Results, and Average Score.
   - Filter submissions by **Submitted**, **Graded**, or **Published**, or search by student name/code.
3. Click **Grade / Evaluate** on a student submission:
   - **MCQs**: View candidate choices vs. correct keys, auto-awarded marks, and any negative marking deductions applied.
   - **Descriptive**: Read the candidate's submitted text, view the rubric/sample answer, enter awarded marks, and write qualitative constructive feedback.
   - Click **Save Grade & Feedback**: The score is saved, and the candidate's total score updates immediately.
4. Click **Publish All Results** (or publish individual results) to release scores to students.

### 8. Student Report Cards & Results
1. When results are published, students can open `/app/student` and view their score.
2. The **StudentResultReportCard** displays:
   - Total Marks, Max Marks, Percentage, and Pass/Fail status.
   - Item-by-item breakdown with correct answer keys, marks awarded, and qualitative teacher remarks.

### 9. Proctoring & Invigilator Review
1. While students take exams, the system monitors client events:
   - Window blur (focus loss)
   - Tab visibility changes (`hidden`)
   - Fullscreen exit events
   - Camera/microphone stream connectivity
2. Invigilators access the **InvigilatorReviewDashboard** (`/app/invigilator`):
   - Review flagged attempts and incident counts.
   - Inspect chronological timeline events with exact timestamps.
   - Record invigilator notes and assign outcomes (`cleared`, `penalized`, `under_review`).

### 10. SaaS Subscriptions & Quotas
1. Administrators navigate to **Institution Settings** (`/app/institution`):
   - View current subscription plan tier (`Free`, `Starter`, `Professional`, `Enterprise`).
   - Monitor real-time quota usage: active exams, student enrollments, and teacher accounts.
   - Self-serve upgrade tiers to increase institutional capacity.
2. Platform Super Admins access `/app/super-admin` to audit all tenant institutions and manage active/suspended statuses.

---

## Deploying on Vercel

ExamFlow is powered by TanStack Start and Nitro, allowing seamless deployment to Vercel Serverless Functions.

### Step 1: Push Code to GitHub
Ensure all changes are pushed to your GitHub repository (see [Pushing to GitHub](#pushing-to-github)).

### Step 2: Import into Vercel
1. Log in to [vercel.com](https://vercel.com) and click **Add New > Project**.
2. Select your `examflow` GitHub repository.
3. In **Build & Development Settings**:
   - **Framework Preset**: Select `Other` (or leave default).
   - **Build Command**: `npm run build`
   - **Output Directory**: Leave blank (Nitro automatically outputs to `.output`).
   - **Install Command**: `npm install`

### Step 3: Configure Environment Variables in Vercel
Add the following under **Project Settings > Environment Variables**:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `APP_URL` | Production URL | `https://your-domain.vercel.app` |
| `VITE_SUPABASE_URL` | Supabase Project URL | `https://your-project.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key | `sb_publishable_...` |
| `VITE_SUPABASE_PROJECT_ID` | Supabase Project ID | `your-project-id` |
| `SUPABASE_URL` | Server Supabase URL | `https://your-project.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Server Publishable Key | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Service Role Key | `sb_secret_...` |
| `NITRO_PRESET` | Nitro deployment target | `vercel` |

### Step 4: Deploy
Click **Deploy**. Vercel will build your app and deploy serverless endpoints.

---

## Deploying on Node.js / Docker / Cloud Run

For self-hosted Node.js servers, Docker containers, Google Cloud Run, AWS ECS, or Render:

### 1. Build Production Bundle
```bash
npm run build
```
This produces a standalone server in `.output/server/index.mjs` and static assets in `.output/public/`.

### 2. Start the Production Server
```bash
export PORT=3000
node .output/server/index.mjs
```

### 3. Dockerfile Reference
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

---

## Pushing to GitHub

To push this codebase to a new or existing GitHub repository:

```bash
# 1. Initialize git if not already initialized
git init

# 2. Add all files
git add .

# 3. Commit changes
git commit -m "feat: complete ExamFlow platform with grading, proctoring, and SaaS management"

# 4. Set default branch to main
git branch -M main

# 5. Add remote (replace with your repository URL)
git remote add origin https://github.com/your-username/examflow.git

# 6. Push to GitHub
git push -u origin main
```

---

## Testing & Verification

ExamFlow includes a comprehensive automated test suite covering all architecture tiers.

### Run All Tests
```bash
npm test
```
Or with Vitest directly:
```bash
npx vitest run
```

### Test Suite Coverage (12 Suites, 34 Tests)
- `src/test/teacher-grading-dashboard.test.tsx`: Submissions ledger, search filtering, dedicated grading modal, descriptive feedback, and publication.
- `src/test/grading.test.ts`: Automated MCQ scoring, option key matching, negative marking deduction, and clamping.
- `src/test/examination-engine-ui.test.tsx`: Student exam lobby, autosave, offline disconnection recovery, and deadline expiry.
- `src/test/examination-engine.test.ts`: Server-side attempt validation, timer calculation, and attempt sealing.
- `src/test/exam-builder-form.test.tsx`: Exam draft creation, validation rules, edit prefill, and locked state checks.
- `src/test/exam-builder.test.ts`: Section assembly, question associations, and version snapshot creation.
- `src/test/teacher-exam-dashboard.test.tsx`: Schedule classification (`active`, `upcoming`, `archived`) and metrics.
- `src/test/multi-tenant-auth.test.ts`: Tenant isolation, membership roles, and security boundaries.
- `src/test/academic-management.test.ts`: Sessions, terms, courses, departments, and cohort assignments.
- `src/test/question-bank.test.ts`: Question authoring, option keys, and answer key protection.
- `src/test/oauth-server.test.ts`: Supabase OAuth 2.1 authorization and consent flows.
- `src/test/app-routing.test.tsx`: Route trees, guards, and unauthorized redirects.

### Static Analysis & Type Checking
```bash
npm run lint
```
Runs `tsc --noEmit` across all modules. Must return 0 errors.

---

## Security, RBAC, and Tenant Isolation

1. **PostgreSQL Row-Level Security (RLS)**:
   - Every multi-tenant table contains an `institution_id` foreign key.
   - PostgreSQL policies mandate that queries match the user's active `institution_memberships` record or `platform_admins` verification.
2. **Server-Side Authorization**:
   - Critical server functions verify caller credentials using `verifyInstitutionAccess` before executing database writes.
   - Student attempts validate candidate status on the server before answers are saved or submitted.
3. **Answer Key Protection**:
   - Answer keys are stored in a dedicated `exam_version_answer_keys` table.
   - Answer keys are never sent to students before or during an exam.
   - When results are published, student result queries return only the student's evaluated score and feedback.
4. **Idempotent Submissions**:
   - Finalizing an attempt locks the record (`status = 'submitted'`). Subsequent submission requests return the existing receipt without mutating scores or submission timestamps.

---

## License

This project is licensed under the [MIT License](LICENSE).
