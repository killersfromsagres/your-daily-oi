// Shared declarations for the dynamically imported VOD and live media engines.
export {};
declare global {
  interface Window {
    Hls?: {
      new(config?:Record<string,unknown>):{
        loadSource:(url:string)=>void;
        attachMedia:(video:HTMLVideoElement)=>void;
        destroy:()=>void;
        startLoad:()=>void;
        recoverMediaError:()=>void;
        on:(event:string,callback:(...args:any[])=>void)=>void;
        audioTracks:Array<{lang?:string;name?:string}>;
        audioTrack:number;
        subtitleTrack:number;
        liveSyncPosition?:number;
      };
      isSupported:()=>boolean;
      Events:{ERROR:string;MANIFEST_PARSED:string;AUDIO_TRACKS_UPDATED:string};
      ErrorTypes:{NETWORK_ERROR:string;MEDIA_ERROR:string};
      DefaultConfig?:{loader:any};
    };
    mpegts?:{
      createPlayer:(config:Record<string,unknown>,options?:Record<string,unknown>)=>{
        attachMediaElement:(video:HTMLVideoElement)=>void;
        load:()=>void;play:()=>Promise<void>;pause:()=>void;unload:()=>void;destroy:()=>void;
      };
      isSupported:()=>boolean;
    };
    shaka?:any;
  }
}
