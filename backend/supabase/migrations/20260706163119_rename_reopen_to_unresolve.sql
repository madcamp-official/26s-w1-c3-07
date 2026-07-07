-- "reopen"이라는 이름이 실제 동작(status를 unresolved로 되돌림)에 비해 모호해서,
-- 이미 쓰고 있는 상태값 이름(resolved/unresolved)과 대칭되는 "unresolve"로 변경.
alter function reopen_resolved_post_on_question_reply() rename to unresolve_post_on_question_reply;
alter trigger trg_reopen_resolved_post_on_question_reply on posts rename to trg_unresolve_post_on_question_reply;
