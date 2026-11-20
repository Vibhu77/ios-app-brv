// Open a URL in an in-app browser (SFSafariViewController / Chrome Custom
// Tab) so the user stays in the app and can return cleanly.
import * as WebBrowser from "expo-web-browser";

// Brevo web destinations.
export const WEB_HOME_URL = "https://app.brevo.com/";
export const webCampaignReportUrl = (id: number | string) =>
  `https://app.brevo.com/marketing-campaign/report/${id}`;
export const webCampaignEditUrl = (id: number | string) =>
  `https://app.brevo.com/marketing-campaign/edit/${id}`;

export async function openWeb(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    /* no-op: if the browser can't open, fail silently */
  }
}
