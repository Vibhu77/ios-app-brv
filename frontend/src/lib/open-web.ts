// Open a URL in an in-app browser (SFSafariViewController / Chrome Custom
// Tab) so the user stays in the app and can return cleanly.
import * as WebBrowser from "expo-web-browser";

export async function openWeb(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    /* no-op: if the browser can't open, fail silently */
  }
}
