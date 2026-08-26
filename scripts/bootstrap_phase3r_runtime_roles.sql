\set ON_ERROR_STOP on

-- pg_dump does not include cluster-level roles. The Production archive contains
-- RLS policies and grants that reference these fixed NOLOGIN group roles, so a
-- fresh managed PostgreSQL cluster must create them before pg_restore.
DO $roles$
DECLARE
    role_name text;
    role_state record;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['market_engine_app', 'market_engine_worker']
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
            EXECUTE format(
                'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
                role_name
            );
        END IF;

        SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole
        INTO role_state
        FROM pg_catalog.pg_roles
        WHERE rolname = role_name;

        IF role_state.rolcanlogin
           OR role_state.rolsuper
           OR role_state.rolcreatedb
           OR role_state.rolcreaterole THEN
            RAISE EXCEPTION
                'unsafe pre-existing role attributes for %: login=%, super=%, createdb=%, createrole=%',
                role_name,
                role_state.rolcanlogin,
                role_state.rolsuper,
                role_state.rolcreatedb,
                role_state.rolcreaterole;
        END IF;
    END LOOP;
END
$roles$;

DO $membership$
BEGIN
    EXECUTE format(
        'GRANT market_engine_app, market_engine_worker TO %I WITH INHERIT FALSE, SET TRUE',
        current_user
    );
END
$membership$;

SELECT role.rolname, role.rolcanlogin, role.rolsuper, role.rolcreatedb,
       role.rolcreaterole, role.rolinherit,
       membership.inherit_option, membership.set_option
FROM pg_catalog.pg_roles AS role
JOIN pg_catalog.pg_auth_members AS membership ON membership.roleid=role.oid
JOIN pg_catalog.pg_roles AS member ON member.oid=membership.member
WHERE role.rolname IN ('market_engine_app', 'market_engine_worker')
  AND member.rolname=current_user
ORDER BY role.rolname;
