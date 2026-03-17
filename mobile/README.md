# Mapa Rede Verde Mobile

Aplicativo mobile oficial do projeto, construido com `Expo` e `Expo Router`.

## Papel do app mobile

O app existe para o uso em campo:

- login
- mapa com localizacao atual
- criacao e edicao de pontos
- aprovacao e revisao operacional
- consulta rapida de pontos e detalhes

A web em `Next.js` continua sendo a frente oficial para administracao e publicacao na Vercel.

## Ambiente

Crie `mobile/.env.local` a partir de `mobile/.env.example` e preencha:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

## Rodando localmente

```bash
cd mobile
npm install
npx expo start
```

Atalhos uteis:

- `a`: abre no Android
- `w`: abre na web
- `r`: recarrega

## Observacoes

- o mobile e uma frente propria, nao um substituto da web
- as regras de dados continuam centralizadas no backend compartilhado
- quando a modelagem mudar no backend, web e mobile devem ser atualizados juntos
