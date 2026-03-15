# Android com Capacitor

Este projeto usa a aplicacao web em `Next.js` como fonte unica de verdade e um shell Android com `Capacitor`.

## Modelo adotado

- Web oficial: `frontend/`
- App Android: shell nativo em `frontend/android/`
- Conteudo do app: carregado da URL publicada em producao
  - `https://mapa-rede-verde.vercel.app`

Isso significa:

- mudancas de interface, regras, textos e fluxos no `Next.js` aparecem no Android depois do deploy web
- na maioria dos casos, **nao** e necessario gerar um novo APK/AAB
- so e preciso rebuild do Android quando houver mudanca nativa

## Quando basta publicar a web

Exemplos:

- layout
- filtros
- telas
- regras de negocio do frontend
- chamadas as APIs do app
- textos e mensagens

Fluxo:

1. alterar o `frontend/`
2. publicar na Vercel
3. o app Android passa a refletir a atualizacao

## Quando e necessario rebuild do Android

Exemplos:

- permissoes nativas novas
- instalacao de plugin Capacitor novo
- mudanca de icone, splash ou nome do app
- mudanca do `appId`
- mudanca da URL/configuracao do shell em `capacitor.config.ts`

Fluxo:

1. alterar o codigo/configuracao
2. executar `npx cap sync android`
3. abrir no Android Studio
4. gerar novo APK/AAB

## Comandos uteis

Dentro de `frontend/`:

```bash
npx cap add android
npx cap sync android
npx cap open android
```

## Observacoes

- o shell usa `server.url` para apontar para a aplicacao publicada
- `mobile-shell/` existe apenas como base local minima para o Capacitor
- se no futuro o projeto precisar de recursos nativos mais fortes, da para adicionar plugins sem abandonar a base web atual
