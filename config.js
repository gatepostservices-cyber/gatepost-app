// Fill these in after creating the free Supabase project (Project Settings -> API).
// The anon/publishable key is designed to be public; Row Level Security in supabase-setup.sql protects data.
// Leave blank to run in local-only (single device) mode.
window.GATEPOST_CONFIG = {
  SUPABASE_URL: "https://hssevqgkoeuludwoxyuo.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_o5m22_S-wb3D77hqSL5-ew_fLw8b66Y",
  // Optional PostHog error tracking (public project key "phc_..."):
  POSTHOG_KEY: "phc_A62p4FGV5q2Z33E43F9ja6EC8VFgmjieDN9q27NQAXoU",
  POSTHOG_HOST: "https://us.i.posthog.com",
  // Web push VAPID PUBLIC key (safe to publish; the private key stays server-side in Supabase).
  VAPID_PUBLIC_KEY: "BCYUcBnZUTbVOPBQgQ37F-Ds1ru8MWdU4565fl7E6qmJ0UMFtbcQ1lM5b2BDbkESBsqPJvr07yF6aS_ggp1rh3s"
  // NEVER put Twilio or Supabase service_role secrets in this file.
};
