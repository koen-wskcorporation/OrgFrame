begin;

-- Replace legacy table-based embedding storage with Supabase Vector Buckets.
-- This migration only removes legacy database artifacts if they exist.

drop function if exists public.match_document_embeddings(vector, integer, text[]);
drop function if exists public.delete_document_embeddings_by_source(text, text);
drop table if exists public.document_embeddings;

commit;
