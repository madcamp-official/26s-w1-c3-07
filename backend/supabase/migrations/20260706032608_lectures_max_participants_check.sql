-- max_participants는 미설정(null) 또는 0 이상만 허용 (음수 금지)
alter table lectures
  add constraint lectures_max_participants_non_negative
  check (max_participants is null or max_participants >= 0);
