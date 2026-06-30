# Legacy Supabase Reference

These files were copied from the original `WH/warehouse-app` project for reference only.

`WH_K` currently uses the PostgreSQL/Cloud SQL migration flow in `apps/api/database/migrations` via:

```bash
npm run db:migrate -w @warehouse/api
```

Do not run these legacy Supabase migrations against the current `WH_K` database unless the project is intentionally moved back to Supabase.

Original environment variables used by the old Supabase setup:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
