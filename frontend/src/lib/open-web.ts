// Open a URL in an in-app browser (SFSafariViewController / Chrome Custom
// Tab) so the user stays in the app and can return cleanly.
import * as WebBrowser from "expo-web-browser";

// ---- Brevo web destinations (single place to correct any link) ----
export const WEB_HOME_URL = "https://app.brevo.com/";
export const WEB_ACCOUNT_URL = "https://app.brevo.com/profile/information";
export const WEB_LANGUAGE_TZ_URL = "https://app.brevo.com/account/localization";
export const WEB_DATE_FORMAT_URL = "https://app.brevo.com/settings/advanced";
export const WEB_ATTRIBUTES_URL = "https://my.brevo.com/lists/add-attributes";
export const WEB_CAMPAIGN_REPORT_URL = "https://app.brevo.com/marketing-campaign/report/<id>";
export const WEB_CAMPAIGN_EDIT_URL = "https://app.brevo.com/marketing-campaign/edit/<id>";
export const HELP_CENTER_URL = "https://help.brevo.com/hc/en-us";
export const TERMS_URL = "https://www.brevo.com/legal/termsofuse";
export const PRIVACY_URL = "https://www.brevo.com/legal/privacypolicy";

export const webCampaignReportUrl = (id: number | string) => WEB_CAMPAIGN_REPORT_URL.replace("<id>", String(id));
export const webCampaignEditUrl = (id: number | string) => WEB_CAMPAIGN_EDIT_URL.replace("<id>", String(id));

export async function openWeb(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    /* no-op: if the browser can't open, fail silently */
  }
}
