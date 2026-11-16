/** Helps the TV installation page select the correct operating system. */
export type TvInstallPlatform = "tcl-android" | "tcl-roku" | "samsung" | "lg";
export function detectTvInstallPlatform(userAgent: string): TvInstallPlatform {
  const ua = userAgent.toLowerCase();
  if (/roku|rokuos/.test(ua)) return "tcl-roku";
  if (/tizen|samsungbrowser.+tv|smart-tv.+samsung/.test(ua)) return "samsung";
  if (/webos|web0s|netcast|lg browser/.test(ua)) return "lg";
  return "tcl-android";
}
