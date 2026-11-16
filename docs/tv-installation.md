# ZANG FLIX — instalação por sistema de TV

## TCL com Google TV / Android TV

- O APK Android TV existente está no release https://github.com/killersfromsagres/your-daily-oi/releases/tag/android-latest, no arquivo `ZANG-FLIX-TV.apk`.
- Baixe do repositório, transfira à TV via USB ou ferramenta de transferência e autorize a instalação de apps externos para o gerenciador de arquivos escolhido.
- Abra o app pelo menu de aplicativos. O APK já declara LEANBACK_LAUNCHER, banner e navegação por controle.
- Esse APK é uma distribuição assinada com chave de depuração em CI, não publicada na Play Store. Uma assinatura estável de release será necessária para atualizações oficiais.
- TCL Roku TV é diferente: não instala APK Android e exige outro aplicativo Roku, desenvolvido e publicado separadamente.

Referências oficiais: https://support.tcl.com/en_US/how-to-download-apps-and-games-on-your-tcl-android-tv e https://developer.roku.com/develop/getting-started/setup-guide.

## LG webOS TV: pacote IPK para desenvolvedor

- `tv/lg-webos/appinfo.json` e `index.html` fornecem aplicativo **hosted webOS**, modelo oficialmente suportado pela LG. Abre `https://zangflix.vercel.app/?zf-tv-app=webos` com modo TV do site.
- `.github/workflows/webos-package.yml` gera `ZANG-FLIX-webOS.ipk` usando o CLI oficial LG e o publica na tag https://github.com/killersfromsagres/your-daily-oi/releases/tag/webos-latest.
- Para instalar em TV real, ative o aplicativo Developer Mode da LG e conecte TV e computador na mesma rede.
- Instale o CLI `npm install -g @webos-tools/cli`. Configure o aparelho com `ares-setup-device`, siga a autenticação descrita na documentação LG, baixe o IPK e rode `ares-install -d <tv-configurada> ZANG-FLIX-webOS.ipk`.
- Inicie com `ares-launch -d <tv-configurada> com.zangflix.tv`. Para distribuição ao público é necessário passar pelo LG Seller Lounge.
- Um clique no navegador da LG **não instala** um arquivo IPK. O Developer Mode e o PC são necessários para esta versão de testes.

Fontes LG: https://webostv.developer.lge.com/develop/getting-started/web-app-types e https://webostv.developer.lge.com/develop/getting-started/build-your-first-web-app.

## Samsung Tizen TV: projeto de desenvolvimento, ainda sem WGT distribuível

- Samsung não executa APK Android. Instalação por Tizen Studio exige pacote WGT, certificado Samsung e modo desenvolvedor habilitado na TV.
- `tv/samsung-tizen/` é um esqueleto **para desenvolvimento**, com `config.xml` de perfil TV e tela inicial local. Não é um aplicativo de TV aprovado para publicação.
- Importe o projeto pelo Tizen Studio, copie `public/favicon.png` para `tv/samsung-tizen/icon.png`, gere ID e certificados apropriados no Tizen Studio e teste em uma TV real.
- A Samsung restringe aplicações hospedadas/redirecionadas para a loja; criar um WGT distribuível exigirá empacotar interface e recursos locais, validar controle remoto, player e direitos de mídia e enviar à Samsung Apps TV Seller Office.
- Para acesso imediato, em modelos com navegador, abra `https://zangflix.vercel.app` e use o Modo TV.

Fontes Samsung: https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html e https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html.

## Botão Baixar app

- No navegador web desktop ou móvel aparece uma ação discreta no topo; em iPhone orienta Adicionar à Tela de Início.
- Dentro do APK Android/Android TV e PWA standalone, o botão é automaticamente ocultado.
- Dentro do shell webOS, o marcador de sessão `zf-tv-app=webos` faz ocultação equivalente.
- Um navegador não tem API confiável para determinar que outro APK já está instalado no mesmo aparelho. Assim, o botão some **dentro do app**, não necessariamente de uma aba Chrome independente depois de instalar.
- Para garantir disponibilidade dos vídeos em lojas de TV, são necessários fontes autorizadas, DRM e direitos de distribuição adequados, além da compatibilidade de codecs com o modelo da TV.
