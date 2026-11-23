\set ON_ERROR_STOP 1
-- fixtures
insert into auth.users(id) values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b');
update profiles set role='teacher' where id='00000000-0000-0000-0000-00000000000a';
insert into academic_years(id,label,is_current) values ('10000000-0000-0000-0000-000000000001','SMOKE-YEAR',false);
insert into classes(id,name,grade_level) values ('20000000-0000-0000-0000-000000000001','Class 9 SMOKE',9);
insert into subjects(id,class_id,name) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Math');
insert into chapters(id,subject_id,title) values ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Algebra');
insert into topics(id,chapter_id,title_en) values ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Linear equations');
insert into concepts(id,topic_id,title_en) values ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Solving equations');
insert into students(id,student_code,full_name) values ('70000000-0000-0000-0000-000000000001','A-1','Test Student');
update profiles set role='student', student_id='70000000-0000-0000-0000-000000000001' where id='00000000-0000-0000-0000-00000000000b';
insert into enrollments(student_id,class_id,year_id) values ('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into questions(id,chapter_id,concept_id,body,answer) values
 ('80000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','{"stem":{"en":"2x=4, x=?"},"options":[{"key":"A","text":"1"},{"key":"B","text":"2"}]}','{"correct":"B"}'),
 ('80000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','{"stem":{"en":"x+1=3"},"options":[{"key":"A","text":"2"},{"key":"B","text":"3"}]}','{"correct":"A"}');
select status, current_version from questions where id='80000000-0000-0000-0000-000000000001';
-- edit => version 2, old snapshot kept
update questions set body = body || '{"edited":true}' where id='80000000-0000-0000-0000-000000000001';
update questions set status='reviewed' where id='80000000-0000-0000-0000-000000000001'; -- no content change: no bump
select question_id, version from question_versions order by 1,2;
-- immutability
do $$ begin begin update question_versions set body='{}'; raise exception 'MUTABLE!'; exception when others then if sqlerrm like 'MUTABLE%' then raise; end if; end; end $$;
-- exam
insert into assessments(id,year_id,class_id,subject_id,title,type,status,mode,duration_seconds,settings) values
 ('90000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Surprise','exam','published','live_exam',600,'{"grace_seconds":30}');
insert into assessment_questions(assessment_id,question_id) values ('90000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001'),('90000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select (start_exam_session('90000000-0000-0000-0000-000000000001')->'questions')::text like '%correct%' as answers_leaked;
select count(*) as sessions_after_double_start from (select start_exam_session('90000000-0000-0000-0000-000000000001')) x, exam_sessions;
select save_exam_answer(id,'80000000-0000-0000-0000-000000000001','{"correct":"B"}') from exam_sessions;
select save_exam_answer(id,'80000000-0000-0000-0000-000000000001','{"correct":"B"}') from exam_sessions; -- retry
select save_exam_answer(id,'80000000-0000-0000-0000-000000000002','{"correct":"B"}') from exam_sessions;
select submit_exam_session(id) from exam_sessions;
select submit_exam_session(id) from exam_sessions; -- idempotent
select save_exam_answer(id,'80000000-0000-0000-0000-000000000002','{"correct":"A"}') from exam_sessions; -- after submit
select count(*) late_events from exam_events where kind='late_answer';
