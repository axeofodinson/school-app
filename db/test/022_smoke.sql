-- Smoke test for db/022_stem_projects.sql. Run AFTER db/test/017_smoke.sql
-- (reuses its fixtures). Throwaway local Postgres only (TEST_PLAN.md DB-1).
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';

-- second student + teacher assignment
insert into students(id,student_code,full_name) values ('70000000-0000-0000-0000-000000000002','A-2','Test Student 2');
insert into enrollments(id,student_id,class_id,year_id)
select 'e0000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002',class_id,year_id
  from enrollments where student_id='70000000-0000-0000-0000-000000000001';
insert into teacher_assignments(teacher_id,class_id,subject_id,year_id) values
 ('00000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');

-- licence guard: stemp21 content without licence_note must fail
do $$ begin
  begin
    insert into projects(title_en, source) values ('Unlicensed', 'stemp21');
    raise exception 'LICENCE_CHECK_MISSING';
  exception when check_violation then null; end;
end $$;

insert into projects(id,title_en,grade_min,grade_max,sdg_theme,team_size_max,status,source,licence_note) values
 ('b0000000-0000-0000-0000-000000000001','Water filter',6,9,6,3,'approved','stemp21','Written permission, 2026-11 (placeholder)');
insert into project_concepts values ('b0000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001');
insert into project_rubric_criteria(id,project_id,title_en,max_points,concept_id) values
 ('c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Design',10,'60000000-0000-0000-0000-000000000001'),
 ('c0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','Testing',10,null);

-- project assessment must link a project (and only project types may)
do $$ begin
  begin
    insert into assessments(year_id,class_id,subject_id,title,type)
    values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','x','project');
    raise exception 'PROJECT_LINK_CHECK_MISSING';
  exception when check_violation then null; end;
end $$;

insert into assessments(id,year_id,class_id,subject_id,title,type,status,project_id,total_marks) values
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Water filter','project','published','b0000000-0000-0000-0000-000000000001',20);
insert into project_teams(id,assessment_id,name) values ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Team A');
insert into project_team_members(team_id,assessment_id,enrollment_id)
select 'd0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',id from enrollments
 where student_id in ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002');

-- teacher scores the whole team once
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select score_project('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
  '{"c0000000-0000-0000-0000-000000000001": 8, "c0000000-0000-0000-0000-000000000002": 7}', 'Good work', true) as students_graded;
select e.student_id, s.score from submissions s join enrollments e on e.id = s.enrollment_id
 where s.assessment_id='a0000000-0000-0000-0000-000000000001' order by 1;

-- individual correction → audited
select score_project('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
  '{"c0000000-0000-0000-0000-000000000002": 9}', 'Retested', false, 'Re-tested filter') as corrected;
select count(*) as grade_edit_rows from submission_grade_edits;

-- over max must fail
do $$ begin
  begin
    perform score_project('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002',
      '{"c0000000-0000-0000-0000-000000000001": 11}');
    raise exception 'RANGE_CHECK_MISSING';
  exception when others then if sqlerrm <> 'score_out_of_range' then raise; end if; end;
end $$;

-- student cannot score
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  begin
    perform score_project('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','{}');
    raise exception 'AUTHZ_MISSING';
  exception when others then if sqlerrm <> 'not_authorized' then raise; end if; end;
end $$;

-- RLS as student: sees own scores only
reset role;
grant usage on schema public, auth to authenticated; grant select on all tables in schema public to authenticated;
set role authenticated;
select count(*) as student1_visible_score_rows from project_scores;
reset role;
select 'OK 022 smoke' as result;
