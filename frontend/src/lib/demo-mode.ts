// DEMO DATA mode. Lets every screen be checked without Brevo sign-in.
// Enabled ONLY when the env flag is set AND we're in a dev bundle, so it can
// never be active in a production build. When on, the `brevo` client is swapped
// for an in-memory fake and the app makes no calls to our backend at all.
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === "1" && __DEV__;

// Sentinel session token used by the "Use sample data" login path.
export const DEMO_TOKEN = "demo-session";
