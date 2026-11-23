create schema if not exists lc_pro_private;
revoke all on schema lc_pro_private from public, anon, authenticated;
create table lc_pro_private.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamptz,
  trial_ended_at timestamptz,
  paid_until timestamptz
);
alter table lc_pro_private.memberships enable row level security;
revoke all on lc_pro_private.memberships from public, anon, authenticated;
create function public.lc_pro_status() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('plan',case when m.paid_until>now() then 'paid' when m.trial_ended_at>now() then 'trial' else 'free' end,
    'can_start',m.trial_started_at is null and auth.uid() is not null and not coalesce(m.paid_until>now(),false),
    'ends_at',case when m.paid_until>now() then m.paid_until else m.trial_ended_at end)
  from (select auth.uid() as id) u left join lc_pro_private.memberships m on m.user_id=u.id;
$$;
create function public.lc_pro_trial(p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Doğrulanmış üyelik gerekli' using errcode='42501'; end if;
  if p_action='start' then
    insert into lc_pro_private.memberships as m(user_id,trial_started_at,trial_ended_at)
    values(uid,now(),now()+interval '7 days')
    on conflict(user_id) do update set trial_started_at=excluded.trial_started_at, trial_ended_at=excluded.trial_ended_at
    where m.trial_started_at is null and coalesce(m.paid_until,'-infinity'::timestamptz)<=now();
  elsif p_action='end' then
    update lc_pro_private.memberships set trial_ended_at=now() where user_id=uid and trial_ended_at>now();
  else raise exception 'Geçersiz işlem' using errcode='22023'; end if;
  return public.lc_pro_status();
end $$;
create function public.lc_pro_lessons() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if (public.lc_pro_status()->>'plan') not in ('trial','paid') then raise exception 'Pro erişimi gerekli' using errcode='42501'; end if;
  return $items$[{"level":"B1","title":"Peronda yön sormak","text":"When Deniz reached Platform Six, the display still showed the earlier train. A guard pointed to Platform Four and said the new train would leave in ten minutes.","q":"Why should Deniz go to Platform Four?","options":["Her train will leave from there.","The guard needs help there.","Her train has already left."],"answer":0,"why":"“The new train would leave” ifadesi yeni kalkış yerini ve henüz zaman olduğunu bildiriyor.","task":"Kendi yolculuğun için “Which platform …?” ile bir soru yaz."},{"level":"B2","title":"Bir sonucu ölçmek","text":"The library stayed open later during exam week. Evening attendance doubled, yet the number of books borrowed hardly changed. Several students said they came for a quiet place to revise.","q":"Which conclusion does the evidence support?","options":["Students borrowed twice as many books.","The longer hours supported study on site.","Every visitor came only to read."],"answer":1,"why":"Ziyaretler artarken ödünç kitap sayısı sabit kalıyor. Öğrencilerin açıklaması çalışma alanı yorumunu destekliyor.","task":"“Although” ile ziyaret ve ödünç alma sayılarını karşılaştır."},{"level":"C1","title":"Kavram ve örnek","text":"A single generous act may illustrate a principle, yet it cannot by itself establish how the principle applies in every case. To test the claim, the seminar examined a case in which two obligations conflicted.","q":"What role does the conflicting case play?","options":["It proves generosity is impossible.","It repeats the first example.","It tests the scope of the principle."],"answer":2,"why":"“In every case” genellik iddiasını belirtir. Çatışan örnek ilkenin uygulanma sınırını sınar.","task":"“Illustrate” ve “establish” arasındaki ayrımı birer örnekle göster."}]$items$::jsonb;
end $$;
revoke all on function public.lc_pro_status(),public.lc_pro_trial(text),public.lc_pro_lessons() from public,anon;
grant execute on function public.lc_pro_status(),public.lc_pro_trial(text),public.lc_pro_lessons() to authenticated;
create table public.lc_account_deletion_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now()
);
alter table public.lc_account_deletion_requests enable row level security;
revoke all on public.lc_account_deletion_requests from public, anon, authenticated;
grant select on public.lc_account_deletion_requests to authenticated;
create policy lc_read_own_deletion on public.lc_account_deletion_requests for select to authenticated using(user_id=(select auth.uid()));
create function public.lc_request_account_deletion() returns timestamptz
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); received timestamptz;
begin
 if uid is null then raise exception 'Üyelik gerekli' using errcode='42501'; end if;
 insert into public.lc_account_deletion_requests(user_id) values(uid) on conflict(user_id) do nothing;
 select requested_at into received from public.lc_account_deletion_requests where user_id=uid;
 return received;
end $$;
revoke all on function public.lc_request_account_deletion() from public,anon;
grant execute on function public.lc_request_account_deletion() to authenticated;