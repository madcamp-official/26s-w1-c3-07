import { createClient } from '@supabase/supabase-js'

// publishable key는 공개되어도 되는 키라 테스트 프론트엔드에서는 하드코딩
const SUPABASE_URL = 'https://zilvdbwoieplhrpjqnlo.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_weTFwp-2uAH8Eq2HA-nSgg_b-KXvl3m'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
