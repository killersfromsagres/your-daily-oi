import {createFileRoute,Link} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {TvMinimal as Tv,Download,ArrowRight,Cast,ChevronLeft,Check,MonitorPlay,ShieldCheck,ExternalLink,Smartphone,Info,Globe} from "lucide-react";
import {detectDeviceProfile} from "@/lib/device-profile";
import {detectTvInstallPlatform, type TvInstallPlatform} from "@/lib/tv-install";
import {ANDROID_APK_URL} from "@/components/layout/InstallAppButton";

export const Route=createFileRoute("/tv-app")({
  component:TvAppPage,
  head:()=>({meta:[{title:"Instalar ZANG FLIX na TV | TCL, Samsung e LG"},
    {name:"description",content:"Instale o ZANG FLIX em TCL Google TV e Android TV, prepare a versão LG webOS ou use a versão TV em Samsung Tizen."}]}),
});

const TV_APK_URL=ANDROID_APK_URL.replace("ZANG-FLIX-Android.apk","ZANG-FLIX-TV.apk");
const LG_RELEASE="https://github.com/killersfromsagres/your-daily-oi/releases/download/webos-latest/ZANG-FLIX-webOS.ipk";
const WEB_URL="https://zangflix.vercel.app/tv-app";
const devices:{id:TvInstallPlatform,name:string,subtitle:string}[]=[
  {id:"tcl-android",name:"TCL / Android TV",subtitle:"Google TV · Fire TV"},
  {id:"samsung",name:"Samsung",subtitle:"Tizen OS"},
  {id:"lg",name:"LG",subtitle:"webOS"},
  {id:"tcl-roku",name:"TCL Roku",subtitle:"Roku OS"},
];

function TvAppPage(){
 const [selected,setSelected]=useState<TvInstallPlatform>("tcl-android");
 const [tv,setTv]=useState(false);
 useEffect(()=>{
  const update=()=>{
   let forced=false;try{forced=localStorage.getItem("zf-tv-mode")==="true";}catch{}
   setTv(detectDeviceProfile({
     userAgent:navigator.userAgent,viewportWidth:innerWidth,
     coarsePointer:window.matchMedia?.("(pointer:coarse)")?.matches??false,
     touchPoints:navigator.maxTouchPoints||0,tvMode:forced,
   })==="tv");
  };
  setSelected(detectTvInstallPlatform(navigator.userAgent));
  update();window.addEventListener("zf-tv-mode-change",update);
  return()=>window.removeEventListener("zf-tv-mode-change",update);
 },[]);
 const toggle=()=>{
  const next=!tv;
  try{localStorage.setItem("zf-tv-mode",String(next));}catch{}
  setTv(next);
  window.dispatchEvent(new Event("zf-tv-mode-change"));
 };
 return <main className="zf-tv-app-page">
  <Link to="/" className="zf-tv-app-back"><ChevronLeft size={18}/> Voltar ao início</Link>
  <div className="zf-tv-app-intro">
   <span>UMA EXPERIÊNCIA EM QUALQUER TELA</span>
   <h1>ZANG FLIX<br/><em>na sua TV.</em></h1>
   <p>Escolha o sistema da televisão. Mostraremos o método compatível, sem downloads errados.</p>
  </div>

  <section className="zf-tv-install-guide" aria-labelledby="zf-tv-install-title">
   <div className="zf-tv-install-lead">
     <Tv size={23} aria-hidden/>
     <div><h2 id="zf-tv-install-title">Instalar na televisão</h2><p>Selecione a marca ou sistema.</p></div>
   </div>
   <div className="zf-tv-device-options" aria-label="Sistema da televisão">
    {devices.map(device=><button key={device.id} type="button"
       className={"zf-tv-device-option"+(selected===device.id?" is-selected":"")}
       aria-pressed={selected===device.id}
       onClick={()=>setSelected(device.id)}>
       <strong>{device.name}</strong><small>{device.subtitle}</small>
     </button>)}
   </div>

   <div className="zf-tv-install-detail">
    {selected==="tcl-android"&&<div>
      <div className="zf-tv-install-type"><ShieldCheck size={17}/> APK Android TV compatível</div>
      <h3>TCL Google TV / Android TV</h3>
      <p>O ZANG FLIX já possui um APK com ícone e acesso pelo menu de aplicativos Android TV. Não está publicado na Play Store; o arquivo deve ser transferido e instalado com autorização da TV.</p>
      <a data-tv-initial-focus className="zf-tv-install-cta" href={TV_APK_URL}><Download size={18}/> Baixar APK para TV <ArrowRight size={17}/></a>
      <ol><li>Baixe o APK no celular ou computador, usando o link acima.</li>
       <li>Envie o arquivo à TV por pendrive ou transferência na mesma rede.</li>
       <li>Na TV, autorize a instalação de aplicativos externos para o gerenciador de arquivos e abra o APK.</li>
       <li>Abra ZANG FLIX em <strong>Aplicativos</strong>; navegue usando as setas e o botão OK.</li></ol>
      <small className="zf-tv-install-note"><Info size={15}/> A disponibilidade de instalação depende do Android/Google TV da sua TCL. Não instale APKs em Roku, Tizen ou webOS.</small>
    </div>}

    {selected==="samsung"&&<div>
      <div className="zf-tv-install-type"><MonitorPlay size={17}/> Sistema Samsung Tizen</div>
      <h3>Samsung Smart TV</h3>
      <p>Samsung não instala APK Android. Um aplicativo nativo requer projeto Tizen, assinatura com certificado Samsung e testes na TV. A loja exige aprovação; apps que apenas abrem um site sofrem restrições.</p>
      <a className="zf-tv-install-cta" href={WEB_URL}><Globe size={18}/> Abrir versão TV no navegador <ArrowRight size={17}/></a>
      <ol><li>Abra o navegador da Samsung e digite <strong>zangflix.vercel.app</strong>.</li>
       <li>Acesse <strong>Modo TV</strong> nesta página para navegar com o controle.</li>
       <li>Para instalar um aplicativo Tizen de desenvolvimento, use o projeto em <strong>tv/samsung-tizen</strong> com o Tizen Studio no computador e um certificado Samsung.</li></ol>
      <a className="zf-tv-install-resource" href="https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html" target="_blank" rel="noopener noreferrer">Procedimento oficial Samsung <ExternalLink size={14}/></a>
      <small className="zf-tv-install-note"><Info size={15}/> A versão Tizen ainda depende de assinatura, validação em uma TV física e eventual aprovação na loja; não existe instalação direta pelo navegador.</small>
    </div>}

    {selected==="lg"&&<div>
      <div className="zf-tv-install-type"><MonitorPlay size={17}/> Projeto LG webOS hospedado</div>
      <h3>LG Smart TV (webOS)</h3>
      <p>Foi preparada uma versão webOS que inicia a experiência ZANG FLIX pela internet. O pacote IPK é para instalação de desenvolvimento e precisa do <strong>Developer Mode</strong> da LG e de um computador; não se instala como APK.</p>
      <a className="zf-tv-install-cta" href={LG_RELEASE} target="_blank" rel="noopener noreferrer"><Download size={18}/> Versão webOS para testes <ExternalLink size={16}/></a>
      <ol><li>Na TV, instale e ative o aplicativo oficial <strong>Developer Mode</strong>.</li>
       <li>Baixe o pacote <strong>ZANG-FLIX-webOS.ipk</strong> na página de versões do projeto.</li>
       <li>Conecte o computador à TV usando o SDK webOS e instale o IPK via <strong>ares-install</strong>.</li>
       <li>Abra ZANG FLIX pelo menu da TV. Para distribuição pública, é necessária aprovação na loja LG.</li></ol>
      <a className="zf-tv-install-resource" href="https://webostv.developer.lge.com/develop/getting-started/developer-mode-app" target="_blank" rel="noopener noreferrer">Instruções oficiais da LG <ExternalLink size={14}/></a>
      <small className="zf-tv-install-note"><Info size={15}/> A compilação e o teste no hardware LG são passos separados; a presença do pacote não significa aprovação na loja.</small>
    </div>}

    {selected==="tcl-roku"&&<div>
      <div className="zf-tv-install-type"><Tv size={17}/> TCL com sistema Roku OS</div>
      <h3>TCL Roku TV</h3>
      <p>Uma TCL Roku não roda aplicativos Android. O sistema usa aplicativos próprios desenvolvidos para Roku; portanto, o APK existente não funciona aqui.</p>
      <ol><li>Se desejar instalar um aplicativo nativo, será necessário desenvolver e testar uma versão Roku separada.</li>
       <li>Como alternativa, conecte um dispositivo Android TV/Google TV por HDMI para utilizar o APK existente.</li>
       <li>Se o objetivo for transmitir do celular, utilize apenas um protocolo suportado por ambos os aparelhos e pela fonte do vídeo.</li></ol>
      <a className="zf-tv-install-resource" href="https://developer.roku.com/develop/getting-started/setup-guide" target="_blank" rel="noopener noreferrer">Guia oficial do Roku Developer <ExternalLink size={14}/></a>
    </div>}
   </div>
  </section>

  <div className="zf-tv-install-grid zf-tv-install-extra">
   <section>
     <Cast size={25}/><h2>Transmitir pelo celular</h2>
     <p>Use o botão de transmissão no player quando a TV e a fonte forem compatíveis. Celular e televisão devem estar na mesma rede.</p>
     <Link to="/tv" className="ydo-btn-secondary">Abrir canais <ArrowRight size={17}/></Link>
   </section>
   <section>
     <Tv size={25}/><h2>Modo controle remoto</h2>
     <p>Uma navegação otimizada para a tela grande com setas, OK e Voltar. Não exige download para testar no navegador da TV.</p>
     <button type="button" className="ydo-btn-secondary" aria-pressed={tv} onClick={toggle}>
       {tv?<Check size={17}/>:<MonitorPlay size={17}/>} {tv?"Modo TV ativo · desativar":"Ativar modo TV"}
     </button>
   </section>
   <section>
     <Smartphone size={25}/><h2>Instalar no celular</h2>
     <p>O Android utiliza um APK diferente dos pacotes webOS e Tizen. No navegador do celular, o botão discreto de download fica no topo.</p>
     <a className="ydo-btn-secondary" href={ANDROID_APK_URL}><Download size={17}/> APK para Android</a>
   </section>
  </div>
  <p className="zf-tv-install-legal">A instalação do aplicativo não garante a reprodução de fontes indisponíveis, com DRM ou sem autorização de distribuição.</p>
 </main>;
}
