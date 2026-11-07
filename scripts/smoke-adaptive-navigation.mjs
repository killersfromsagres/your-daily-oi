// scripts/smoke-adaptive-navigation.mjs — Bun + Cloudflare Worker + headless Chrome device simulations.
import { spawn, spawnSync } from "node:child_process";
const PORT = 4198, BASE = "http://127.0.0.1:" + PORT;
const chrome = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]
  .find(name => spawnSync("which", [name]).status === 0);
if (!chrome) throw Error("Chrome/Chromium required for adaptive layout smoke tests.");
const worker = spawn("bunx", ["wrangler@4","--cwd",".output","dev","--local",
  "--ip","127.0.0.1","--port",String(PORT)], {stdio:["ignore","pipe","pipe"]});
let logs = "";
for (const stream of [worker.stdout,worker.stderr]) stream.on("data", part => {
  logs = (logs + String(part)).slice(-2500);
});
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
try {
  let ready = false;
  for (let i=0; i<65; i++) {
    if (worker.exitCode !== null) throw Error("Worker stopped: " + logs);
    try {
      const res = await fetch(BASE + "/api/version", {signal:AbortSignal.timeout(1200)});
      if (res.ok) {ready=true;break;}
    } catch {}
    await sleep(300);
  }
  if (!ready) throw Error("Worker did not start: " + logs);
  const cases = [
    { name:"mobile", width:390, height:844,
      ua:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      expected:"mobile" },
    { name:"web", width:1440, height:960, ua:null, expected:"web" },
    { name:"tv", width:1920, height:1080,
      ua:"Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.1 TV Safari/537.36",
      expected:"tv" },
  ];
  for (const scenario of cases) {
    const args = ["--headless=new","--no-sandbox","--disable-gpu",
      "--disable-dev-shm-usage","--disable-background-networking","--disable-extensions",
      "--virtual-time-budget=10500","--window-size="+scenario.width+","+scenario.height,
      "--dump-dom",BASE + "/busca"];
    if (scenario.ua) args.splice(args.length-2,0,"--user-agent="+scenario.ua);
    const result=spawnSync(chrome,args,{encoding:"utf8",timeout:42000,maxBuffer:18*1024*1024});
    const html=result.stdout||"";
    const profile=html.match(/data-zf-platform="(mobile|web|tv)"/)?.[1];
    const indicators={
      profile,
      hasLogo:html.includes("ydo-logo"),
      hasMenuTrigger:html.includes("ydo-mobile-menu-trigger"),
      hasDock:html.includes("Navegação principal no celular") && html.includes("zf-mobile-dock"),
      hasGames:html.includes("Jogos do Dia"),
      hasTvLabel:html.includes("MODO TV"),
      adaptiveStyles:html.includes("adaptive-navigation"),
    };
    console.log(JSON.stringify({event:"adaptive-layout-smoke",scenario:scenario.name,exit:result.status,...indicators}));
    if (result.status!==0||profile!==scenario.expected||!indicators.hasLogo||
      !indicators.hasMenuTrigger||!indicators.hasDock||!indicators.hasGames||
      !indicators.hasTvLabel||!indicators.adaptiveStyles) {
      throw Error("Adaptive layout hydration failed for " + scenario.name + ": " + String(result.stderr).slice(-1100));
    }
  }

  // The homepage is the heaviest mobile route. Verify it hydrates without
  // mounting all eight original-resolution backdrops at once.
  const phoneUA = cases[0].ua;
  const homeArgs = ["--headless=new","--no-sandbox","--disable-gpu",
    "--disable-dev-shm-usage","--disable-background-networking","--disable-extensions",
    "--virtual-time-budget=12500","--window-size=390,844",
    "--user-agent="+phoneUA,"--dump-dom",BASE + "/"];
  const home = spawnSync(chrome, homeArgs, {
    encoding:"utf8",timeout:50000,maxBuffer:20*1024*1024,
  });
  const homeDom = home.stdout || "";
  const heroImages = [...homeDom.matchAll(/<img[^>]*class="ydo-hero-img"[^>]*>/g)].map(match=>match[0]);
  const performanceSummary = {
    event:"mobile-home-stability",
    exit:home.status,
    heroImages:heroImages.length,
    hasOriginalBackdrop:heroImages.some(tag=>tag.includes("/original/")),
    trophyNavigation:homeDom.includes("lucide-trophy"),
    hasMobileMenu:homeDom.includes("zf-mobile-dock"),
  };
  console.log(JSON.stringify(performanceSummary));
  if(home.status!==0||heroImages.length>1||performanceSummary.hasOriginalBackdrop||
    !performanceSummary.trophyNavigation||!performanceSummary.hasMobileMenu){
    throw Error("Mobile homepage performance regression: "+String(home.stderr).slice(-700));
  }
} finally {
  worker.kill("SIGTERM");
}
