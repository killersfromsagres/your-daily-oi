/** A non-secret 64-bit lookup key. Never persist tokenized provider URLs in audit reports. */
export function movieSourceFingerprint(url:string): string {
  let a=0x811c9dc5,b=0x9e3779b9;
  for(let i=0;i<url.length;i++){
    const code=url.charCodeAt(i);
    a=Math.imul(a^code,0x01000193);
    b=Math.imul(b^code,0x85ebca6b);
  }
  return (a>>>0).toString(16).padStart(8,"0")+(b>>>0).toString(16).padStart(8,"0");
}
