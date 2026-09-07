begin;

select plan(1);

select is(
  (select public from storage.buckets where id = 'lecture-slides'),
  true,
  'lecture slide screenshots are publicly readable'
);

select * from finish();

rollback;
