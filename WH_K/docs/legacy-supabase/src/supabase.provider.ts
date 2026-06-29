import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Provider, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT'
export const InjectSupabase = () => Inject(SUPABASE_CLIENT)

export const SupabaseProvider: Provider = {
  provide: SUPABASE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): SupabaseClient =>
    createClient(
      config.getOrThrow('SUPABASE_URL'),
      config.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    ),
}
