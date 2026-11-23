import {createFileRoute,Link} from "@tanstack/react-router";
import {useEffect,useRef,useState, type KeyboardEvent} from "react";
import {TvMinimal as Tv,Download,ArrowRight,Cast,ChevronLeft,Check,MonitorPlay,ShieldCheck,ExternalLink,Smartphone,Info,Globe,Gamepad2} from "lucide-react";
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
const WEB_URL="https://zangflix.lovable.app/tv-home";
type DeviceInfo = {
  id:TvInstallPlatform;
  name:string;
  subtitle:string;
  logo:string;
  status:string;
  statusType:"ready"|"test"|"browser"|"unavailable";
  accent:string;
};
const TCL_LOGO="https://upload.wikimedia.org/wikipedia/commons/2/2a/Logo_of_the_TCL_Corporation.svg";
const devices:DeviceInfo[]=[
  {id:"tcl-android",name:"TCL",subtitle:"Google TV / Android TV",logo:TCL_LOGO,status:"App TV dedicado",statusType:"ready",accent:"tcl"},
  {id:"samsung",name:"Samsung",subtitle:"Samsung Tizen",logo:"/tv-brands/samsung.svg",status:"Versão web",statusType:"browser",accent:"samsung"},
  {id:"lg",name:"LG",subtitle:"LG webOS",logo:"/tv-brands/lg.svg",status:"IPK de testes",statusType:"test",accent:"lg"},
  {id:"tcl-roku",name:"TCL Roku",subtitle:"Roku OS",logo:"/tv-brands/roku.svg",status:"App Roku pendente",statusType:"unavailable",accent:"roku"},
];

function TvAppPage(){
 const [selected,setSelected]=useState<TvInstallPlatform>("tcl-android");
 const [tv,setTv]=useState(false);
 const optionsRef=useRef<HTMLDivElement>(null);
 const selectedDevice=devices.find(device=>device.id===selected) || devices[0];
 const onDeviceKeys=(event:KeyboardEvent<HTMLDivElement>)=>{
  const step=event.key==="ArrowRight"||event.key==="ArrowDown"?1:
    event.key==="ArrowLeft"||event.key==="ArrowUp"?-1:0;
  if(!step)return;
  const focused=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-tv-device]");
  if(!focused)return;
  event.preventDefault();
  const index=devices.findIndex(device=>device.id===focused.dataset.tvDevice);
  const next=devices[(index+step+devices.length)%devices.length];
  setSelected(next.id);
  optionsRef.current?.querySelector<HTMLButtonElement>('[data-tv-device="'+next.id+'"]')?.focus();
 };
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
  <section className="zf-tv-premium-hero" aria-labelledby="zf-tv-hero-title">
   <div className="zf-tv-hero-copy">
    <div className="zf-tv-eyebrow"><Tv size={14} aria-hidden="true"/> ZANG FLIX TV · NOVA EXPERIÊNCIA</div>
    <h1 id="zf-tv-hero-title">Sua TV merece<br/><em>outra experiência.</em></h1>
    <p>Uma interface desenhada do zero para o controle remoto: foco visível, busca direta, categorias mais simples e carregamento reduzido. Escolha o sistema correto para instalar.</p>
    <div className="zf-tv-hero-actions">
     <a href="#zf-tv-install-title" className="zf-tv-hero-primary">Escolher minha TV <ArrowRight size={17}/></a>
     <Link to="/tv-home" className="zf-tv-hero-secondary"><Gamepad2 size={17}/> Prévia da interface TV <ArrowRight size={16}/></Link>
    </div>
    <div className="zf-tv-hero-facts">
     <span><Check size={15}/> Foco visível em cada cartão</span>
     <span><Check size={15}/> Sugestões selecionáveis</span>
     <span><Check size={15}/> APK exclusivo TCL</span>
    </div>
   </div>
   <div className="zf-tv-visual" aria-hidden="true">
    <div className="zf-tv-visual-orbit zf-tv-visual-orbit-a"/>
    <div className="zf-tv-visual-orbit zf-tv-visual-orbit-b"/>
    <div className="zf-tv-hardware">
     <div className="zf-tv-screen">
      <div className="zf-tv-screen-head"><strong>ZANG<span>FLIX</span></strong><span>INÍCIO　 FILMES　 SÉRIES　 TV</span></div>
      <div className="zf-tv-screen-feature"><span>DESTAQUE</span><strong>Seu cinema<br/>sem limites.</strong><i>EXPLORAR <ArrowRight size={9}/></i></div>
      <div className="zf-tv-screen-rail"><span>Continue explorando</span><div><i/><i/><i/><i/></div></div>
     </div>
     <div className="zf-tv-hardware-stand"/>
    </div>
    <div className="zf-tv-remote"><div className="zf-tv-remote-dot"/><div className="zf-tv-remote-cross"><span>▲</span><div><span>◀</span><b>OK</b><span>▶</span></div><span>▼</span></div><div className="zf-tv-remote-home">⌂</div></div>
    <small className="zf-tv-visual-caption">PRÉVIA ILUSTRATIVA DA INTERFACE</small>
   </div>
  </section>

  <section className="zf-tv-install-guide" aria-labelledby="zf-tv-install-title">
   <div className="zf-tv-install-lead">
     <div className="zf-tv-install-lead-icon"><Tv size={23} aria-hidden="true"/></div>
     <div><span className="zf-tv-section-label">CONFIGURAÇÃO EM POUCOS PASSOS</span>
      <h2 id="zf-tv-install-title">Qual é a sua televisão?</h2>
      <p>Escolha a marca e o sistema para visualizar o método de instalação disponível.</p></div>
   </div>
   <div className="zf-tv-app-platform-note">
      <span><Gamepad2 size={18}/> CONTROLE REMOTO</span>
      <strong>Setas para navegar. OK para selecionar. Voltar para retornar.</strong>
      <Link to="/tv-home">Conhecer interface TV <ArrowRight size={16}/></Link>
   </div>
   <div className="zf-tv-device-options" ref={optionsRef} onKeyDown={onDeviceKeys} aria-label="Escolher sistema da televisão">
    {devices.map(device=><button key={device.id} type="button" data-tv-device={device.id}
       className={"zf-tv-device-option zf-tv-device-"+device.accent+(selected===device.id?" is-selected":"")}
       aria-pressed={selected===device.id}
       aria-controls="zf-tv-install-panel"
       onClick={()=>setSelected(device.id)}>
       <span className="zf-tv-device-brand">
         <img src={device.logo} alt="" loading="lazy" width={94} height={45}
            onError={event=>{event.currentTarget.style.display="none";const fallback=event.currentTarget.nextElementSibling as HTMLElement|null;if(fallback)fallback.style.display="block"}}/>
         <b aria-hidden="true">{device.name}</b>
       </span>
       <span className="zf-tv-device-copy"><strong>{device.name}</strong><small>{device.subtitle}</small></span>
       <span className={"zf-tv-device-status is-"+device.statusType}>{device.status}</span>
       <span className="zf-tv-device-selected"><Check size={15}/></span>
     </button>)}
   </div>

   <div className="zf-tv-install-detail" id="zf-tv-install-panel" aria-live="polite">
    <div className="zf-tv-install-panel-heading">
     <span>PLATAFORMA SELECIONADA</span>
     <div><strong>{selectedDevice.name}</strong><small>{selectedDevice.status}</small></div>
    </div>
    <div className="zf-tv-install-detail-animated" key={selected}>
    {selected==="tcl-android"&&<div>
      <div className="zf-tv-install-type"><ShieldCheck size={17}/> APK Android TV compatível</div>
      <h3>TCL Google TV / Android TV</h3>
      <p>Uma edição exclusiva para TCL com Google TV ou Android TV, separada do aplicativo de celular. Ela inicia na interface TV, com navegação por setas, categorias compactas e busca com foco visível. Instalação manual, fora da Play Store.</p>
      <a data-tv-initial-focus className="zf-tv-install-cta" href={TV_APK_URL}><Download size={18}/> Baixar APK para TV <ArrowRight size={17}/></a>
      <ol><li>Baixe o APK no celular ou computador, usando o link acima.</li>
       <li>Envie o arquivo à TV por pendrive ou transferência na mesma rede.</li>
       <li>Na TV, autorize a instalação de aplicativos externos para o gerenciador de arquivos e abra o APK.</li>
       <li>Abra <strong>ZANG FLIX TV</strong> em Aplicativos. Setas movimentam o foco, OK escolhe e Voltar retorna.</li></ol>
      <small className="zf-tv-install-note"><Info size={15}/> A disponibilidade de instalação depende do Android/Google TV da sua TCL. Não instale APKs em Roku, Tizen ou webOS.</small>
    </div>}

    {selected==="samsung"&&<div>
      <div className="zf-tv-install-type"><MonitorPlay size={17}/> Sistema Samsung Tizen</div>
      <h3>Samsung Smart TV</h3>
      <p>Samsung não instala APK Android. Um aplicativo nativo requer projeto Tizen, assinatura com certificado Samsung e testes na TV. A loja exige aprovação; apps que apenas abrem um site sofrem restrições.</p>
      <a className="zf-tv-install-cta" href={WEB_URL}><Globe size={18}/> Abrir versão TV no navegador <ArrowRight size={17}/></a>
      <ol><li>Abra o navegador da Samsung e acesse <strong>zangflix.lovable.app/tv-home</strong>.</li>
       <li>Navegue usando as setas, OK e Voltar, conforme a compatibilidade do navegador.</li>
       <li>Para instalar um aplicativo Tizen de desenvolvimento, use o projeto em <strong>tv/samsung-tizen</strong> com o Tizen Studio no computador e um certificado Samsung.</li></ol>
      <a className="zf-tv-install-resource" href="https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html" target="_blank" rel="noopener noreferrer">Procedimento oficial Samsung <ExternalLink size={14}/></a>
      <small className="zf-tv-install-note"><Info size={15}/> A versão Tizen ainda depende de assinatura, validação em uma TV física e eventual aprovação na loja; não existe instalação direta pelo navegador.</small>
    </div>}

    {selected==="lg"&&<div>
      <div className="zf-tv-install-type"><MonitorPlay size={17}/> Projeto LG webOS hospedado</div>
      <h3>LG Smart TV (webOS)</h3>
      <p>Foi preparada uma versão webOS que abre a nova interface TV pela internet. O pacote IPK é para instalação de desenvolvimento e precisa do <strong>Developer Mode</strong> da LG e de um computador; não se instala como APK.</p>
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
   </div>
  </section>

  <section className="zf-tv-controls-spotlight" aria-labelledby="zf-tv-controls-title">
    <div><span className="zf-tv-section-label">PENSADO PARA O CONTROLE</span>
      <h2 id="zf-tv-controls-title">Você sempre sabe onde está.</h2>
      <p>Um contorno de alto contraste identifica o item selecionado ao navegar entre filmes e sugestões. Você não precisa de cursor de mouse.</p>
      <Link to="/tv-home">Testar a interface TV <ArrowRight size={16}/></Link>
    </div>
    <div className="zf-tv-controls-steps" aria-label="Controles principais">
      <div><strong>01</strong><span>↑ ↓ ← →</span><small>Explore categorias e títulos</small></div>
      <div><strong>02</strong><span>OK</span><small>Abra o item selecionado</small></div>
      <div><strong>03</strong><span>VOLTAR</span><small>Feche a pesquisa ou retorne</small></div>
    </div>
  </section>
  <div className="zf-tv-below-heading"><span>MAIS POSSIBILIDADES</span><h2>Do seu jeito. Na sua tela.</h2></div>
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
  <p className="zf-tv-install-legal">As marcas são exibidas apenas para identificar compatibilidade, sem afiliação com o ZANG FLIX. A instalação não garante a reprodução de fontes indisponíveis, protegidas por DRM ou sem autorização de distribuição.</p>
 </main>;
}
