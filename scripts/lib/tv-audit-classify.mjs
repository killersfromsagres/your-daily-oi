// Classify only observations, not playable streams. A MIME label is not a manifest.
export function classifyHTTP(status,mime,prefix=""){
  if(status===401||status===403)return "access-denied";
  if(status===404||status===410)return "not-found";
  if(status===429)return "rate-limited";
  if(status>=500)return "origin-error";
  if(status>=400)return "other-http-error";
  if(status!==200&&status!==206)return "unconfirmed-http-status";
  if(mime==="HTML"||/<!doctype html|<html/i.test(prefix))return "html-not-video";
  if(/^\s*#EXTM3U(?:\s|$)/.test(prefix)&&/#EXT-X-|#EXTINF:/.test(prefix))return "manifest-candidate";
  if(/^\s*(?:<\?xml[^>]*>\s*)?<MPD(?:\s|>)/i.test(prefix))return "manifest-candidate";
  if(mime==="HLS"||mime==="DASH")return "invalid-or-incomplete-manifest";
  if(mime==="JSON")return "json-not-video";
  if(mime==="TS"||mime==="MP4")return "media-candidate";
  return "unconfirmed-2xx";
}
