# Mapa Rede Verde

Plataforma multi-tenant de gestao ambiental com uma estrategia de duas frentes:

- `frontend/`: web oficial em `Next.js`, publicada na Vercel
- `mobile/`: app mobile em `Expo`, voltado para operacao em campo
- `backend/`: schema Supabase, migrations, RLS e seeds

## Estrategia recomendada

Este repositorio segue a linha:

- `Next.js` continua como frente web oficial
- `Expo` vira a frente mobile oficial
- ambos compartilham o mesmo backend no Supabase
- alteracoes de regra de negocio e dados continuam centralizadas no backend

Esse modelo evita replatform desnecessaria da web e permite evoluir a experiencia mobile sem perder a Vercel como deploy principal do produto web.

## Stack

- Web: Next.js App Router, React, TypeScript, Google Maps JavaScript API
- Mobile: Expo, Expo Router, React Native, react-native-maps
- Backend: Supabase Auth, PostgreSQL, PostGIS, Row Level Security
- Deploy web: Vercel

## Bootstrapping do backend

1. Crie o projeto no Supabase e valide a extensao `postgis`.
2. Execute as migrations em ordem.
3. Configure os projetos web e mobile com as chaves do Supabase.

## Rodando a web

1. Crie `frontend/.env.local` a partir de `frontend/.env.example`.
2. Preencha:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
3. Rode:

```bash
cd frontend
npm install
npm run dev
```

## Rodando o mobile

1. Crie `mobile/.env.local` a partir de `mobile/.env.example`.
2. Preencha:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
3. Rode:

```bash
cd mobile
npm install
npx expo start
```

## Navegacao por grupo

- O mapa aceita `?grupo=<codigo-do-grupo>` para abrir filtrado em um grupo especifico.
- Quando um grupo vem pela URL, o seletor pode ficar recolhido e o usuario pode usar `Trocar grupo`.
- No cadastro de ponto, o grupo da URL entra como padrao.
- O mapa tem busca por endereco e lista paginada de pontos do filtro, ordenada pela distancia em relacao ao centro atual.
