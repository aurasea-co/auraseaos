-- Three trigger functions populate the denormalized email column on
-- branch_members / organization_members by reading auth.users:
--   fill_branch_member_email
--   fill_organization_member_email
--   organization_members_set_email_from_auth
--
-- They were created as SECURITY INVOKER (the default), so during an
-- INSERT they run as the calling role. Supabase's service_role does
-- NOT have SELECT on auth.users — only supabase_auth_admin does — so
-- writes via the service_role fail with "permission denied for table
-- users". This blocks the invitation-accept flow (and any other
-- service-side write to these tables).
--
-- Convert them to SECURITY DEFINER so they run as their owner
-- (postgres), which always has access to auth.users, and pin
-- search_path to avoid search-path injection.

ALTER FUNCTION public.fill_branch_member_email() SECURITY DEFINER;
ALTER FUNCTION public.fill_branch_member_email() SET search_path = public, auth;

ALTER FUNCTION public.fill_organization_member_email() SECURITY DEFINER;
ALTER FUNCTION public.fill_organization_member_email() SET search_path = public, auth;

ALTER FUNCTION public.organization_members_set_email_from_auth() SECURITY DEFINER;
ALTER FUNCTION public.organization_members_set_email_from_auth() SET search_path = public, auth;
