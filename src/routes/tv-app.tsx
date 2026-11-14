import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {Tv,Download,ArrowRight,Cast,ChevronLeft,Check} from "lucide-react";
import {ANDROID_APK_URL} from "@/components/layout/InstallAppButton";
export const Route=createFileRoute("/tv-app")({component:TvAppPage,head:()=>({meta:[{title:"ZANG FLIX na TV"}]})});
function TvAppPage(){
 const [tv,setTv]=useState(()=>typeof document!=="undefined"&&document.documentElement.dataset["zfPlatform"]==="tv");
 const toggle=()=>{
  const next=!tv;try{localStorage.setItem("zf-tv-mode",String(next));}catch{}
  setTv(next);window.dispatchEvent(new Event("zf-tv-mode-change"));
 };
 return <main className="zf-tv-app-page">
  <Link to="/" className="zf-tv-app-back"><ChevronLeft size={18}/> Início</Link>
  <div className="zf-tv-app-intro"><span>ZANG FLIX</span><h1>Sua tela grande.<br/>Seu cinema.</h1><p>Filmes, séries e canais ao vivo. No seu controle.</p></div>
  <div className="zf-tv-install-grid">
   <section><Tv size={28}/><h2>Instale na sua TV</h2><p>Android TV · Google TV · Fire TV</p>
    <a data-tv-initial-focus href={ANDROID_APK_URL.replace("ZANG-FLIX-Android.apk","ZANG-FLIX-TV.apk")} className="ydo-btn-primary"><Download size={18}/> Baixar aplicativo para TV</a>
    <ol><li>Abra esta página no navegador da TV.</li><li>Baixe o aplicativo e confirme a instalação.</li><li>Abra ZANG FLIX no menu de aplicativos.</li></ol>
    <small>A instalação de APK precisa ser permitida para o navegador utilizado. Em aparelhos sem navegador, transfira o APK do celular para a TV.</small>
   </section>
   <section><Cast size={28}/><h2>Conecte pelo celular</h2><p>Chromecast · AirPlay · TVs compatíveis</p>
    <p>Abra um canal e toque em Transmitir para a TV. Os dois aparelhos precisam estar na mesma rede.</p>
    <Link to="/tv" className="ydo-btn-secondary">Escolher um canal <ArrowRight size={17}/></Link>
   </section>
   <section><Tv size={28}/><h2>Abra pelo navegador</h2><p>Samsung · LG · Outras Smart TVs</p>
    <p>Na TV, acesse <strong>zangflix.vercel.app</strong> e ative o modo TV.</p>
    <button type="button" className="ydo-btn-secondary" aria-pressed={tv} onClick={toggle}>{tv?<Check size={18}/>:<Tv size={18}/>} {tv?"Modo TV ativo · desativar":"Ativar modo TV"}</button>
    <small>Setas para navegar. OK para selecionar. Voltar para retornar. APK não é instalável em TVs Samsung ou LG.</small>
   </section>
  </div>
 </main>;
}
