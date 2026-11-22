-- Fix: creating departments, programs, classes, courses, students, enrollments and teacher
-- assignments fails.
--
-- Symptom: every INSERT into those tables errors, e.g.
--   42703 record "new" has no field "department_id"      (departments)
--   42703 record "new" has no field "head_membership_id" (courses, student_records)
--
-- Cause: public.verify_same_institution_refs() (Phase 3) is ONE trigger function shared by many
-- tables, but it used conditions like
--   IF TG_TABLE_NAME = 'departments' AND NEW.head_membership_id IS NOT NULL
-- PL/pgSQL does not short-circuit record field access, so on any table that lacks that column the
-- function crashes before the table-name test can help.
--
-- Fix: test the table name first, and read a field only inside its own table's branch.
-- Originally documented on branch feature/enterprise-hardening (docs/db-fixes/001), where it was
-- verified inside a rolled-back transaction on the live project. Idempotent.

create or replace function public.verify_same_institution_refs()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $body$
begin
  if TG_TABLE_NAME = 'departments' then
    if NEW.head_membership_id is not null and not exists (
      select 1 from public.institution_memberships m
      where m.id = NEW.head_membership_id and m.institution_id = NEW.institution_id) then
      raise exception 'Department head membership must belong to the same institution' using errcode = '23503';
    end if;

  elsif TG_TABLE_NAME = 'programs' then
    if NEW.department_id is not null and not exists (
      select 1 from public.departments d
      where d.id = NEW.department_id and d.institution_id = NEW.institution_id) then
      raise exception 'Program department must belong to the same institution' using errcode = '23503';
    end if;

  elsif TG_TABLE_NAME = 'academic_classes' then
    if NEW.program_id is not null and not exists (
      select 1 from public.programs p
      where p.id = NEW.program_id and p.institution_id = NEW.institution_id) then
      raise exception 'Class program must belong to the same institution' using errcode = '23503';
    end if;

  elsif TG_TABLE_NAME = 'courses' then
    if NEW.department_id is not null and not exists (
      select 1 from public.departments d
      where d.id = NEW.department_id and d.institution_id = NEW.institution_id) then
      raise exception 'Course department must belong to the same institution' using errcode = '23503';
    end if;
    if NEW.program_id is not null and not exists (
      select 1 from public.programs p
      where p.id = NEW.program_id and p.institution_id = NEW.institution_id) then
      raise exception 'Course program must belong to the same institution' using errcode = '23503';
    end if;
    if NEW.class_id is not null and not exists (
      select 1 from public.academic_classes c
      where c.id = NEW.class_id and c.institution_id = NEW.institution_id) then
      raise exception 'Course class must belong to the same institution' using errcode = '23503';
    end if;

  elsif TG_TABLE_NAME = 'teacher_assignments' then
    if not exists (
      select 1 from public.institution_memberships m
      where m.id = NEW.membership_id and m.institution_id = NEW.institution_id
        and m.status = 'active' and m.role in ('teacher', 'institution_admin')) then
      raise exception 'Assigned member must be an active teacher or admin in this institution' using errcode = '23514';
    end if;
    if NEW.academic_term_id is not null and not exists (
      select 1 from public.academic_terms t
      where t.id = NEW.academic_term_id and t.institution_id = NEW.institution_id
        and t.session_id = NEW.academic_session_id) then
      raise exception 'Term must belong to the same institution and session' using errcode = '23503';
    end if;
    if NEW.class_section_id is not null and not exists (
      select 1 from public.class_sections s
      where s.id = NEW.class_section_id and s.institution_id = NEW.institution_id) then
      raise exception 'Class section must belong to the same institution' using errcode = '23503';
    end if;

  elsif TG_TABLE_NAME = 'student_records' then
    if NEW.email is not null then
      NEW.email := lower(trim(NEW.email));
    end if;
    if NEW.membership_id is not null and not exists (
      select 1 from public.institution_memberships m
      where m.id = NEW.membership_id and m.institution_id = NEW.institution_id) then
      raise exception 'Student membership must belong to the same institution' using errcode = '23503';
    end if;

  elsif TG_TABLE_NAME = 'student_enrollments' then
    if NEW.academic_term_id is not null and not exists (
      select 1 from public.academic_terms t
      where t.id = NEW.academic_term_id and t.institution_id = NEW.institution_id
        and t.session_id = NEW.academic_session_id) then
      raise exception 'Enrollment term must belong to the same institution and session' using errcode = '23503';
    end if;
  end if;

  return NEW;
end
$body$;
