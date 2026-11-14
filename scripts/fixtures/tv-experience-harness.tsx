import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LivePlayer} from '../../src/components/player/LivePlayer';
import {installTvRemoteNavigation} from '../../src/lib/tv-remote';
import type {CanalTV} from '../../src/lib/canais';
const sources=[{url:'https://media.example/channel.mp4',nome:'HD'}];
localStorage.setItem('zangflix:sem-cors',JSON.stringify(['media.example']));
localStorage.setItem('zangflix:live-volume','0.6');
document.documentElement.dataset.zfPlatform=new URL(location.href).searchParams.get('mode')==='mobile'?'mobile':'tv';
function Fixture(){
 const [id,setId]=useState('band'),[switches,setSwitches]=useState(0);
 const channel:CanalTV={id,nome:id==='band'?'Band':'TV teste',fontes:sources,categoria:'Teste'};
 useEffect(()=>installTvRemoteNavigation(),[]);
 return <main><div style={{height:'75vh',position:'relative'}}><LivePlayer canal={channel} onNextCanal={()=>setSwitches(v=>v+1)} onPrevCanal={()=>setSwitches(v=>v+1)}/></div>
  <div className="test-nav"><button onClick={()=>setId('canal-teste')}>Trocar canal</button><button>Filmes</button><button>Séries</button><output data-channel-switches>{switches}</output></div>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
