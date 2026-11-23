begin;
do $test$
declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); before_end text; blocked boolean:=false;
begin
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values(uid,uid::text||'@example.invalid',now(),'{}','{}');
perform set_config('request.jwt.claim.sub',uid::text,true);
if public.lc_pro_status()->>'plan'<>'free' then raise exception 'free'; end if;
begin perform public.lc_pro_lessons(); exception when insufficient_privilege then blocked:=true; end;
if not blocked then raise exception 'free access'; end if;
before_end:=public.lc_pro_trial('start')->>'ends_at';
if public.lc_pro_trial('start')->>'ends_at'<>before_end or jsonb_array_length(public.lc_pro_lessons())<>3 then raise exception 'retry/lessons'; end if;
perform set_config('request.jwt.claim.sub',other_uid::text,true);
if public.lc_pro_status()->>'plan'<>'free' then raise exception 'isolation'; end if;
perform set_config('request.jwt.claim.sub',uid::text,true);
if public.lc_request_account_deletion() is distinct from public.lc_request_account_deletion() then raise exception 'deletion retry'; end if;
if public.lc_pro_trial('end')->>'plan'<>'free' then raise exception 'end'; end if;
if public.lc_pro_trial('start')->>'can_start'<>'false' then raise exception 'restart'; end if;
if public.lc_pro_status()->>'plan'<>'free' then raise exception 'after restart'; end if;
if has_function_privilege('anon','public.lc_pro_lessons()','execute') or has_table_privilege('authenticated','lc_pro_private.memberships','update') then raise exception 'grants'; end if;
end $test$;
rollback;