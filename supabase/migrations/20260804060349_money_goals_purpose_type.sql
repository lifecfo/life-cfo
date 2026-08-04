alter table public.money_goals
  add column purpose_type text not null default 'build_toward'
    check (purpose_type in ('build_toward', 'maintain', 'pay_by_date'));
