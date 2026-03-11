# Mapa Rede Verde

Plataforma multi-tenant de gestao ambiental com:

- `frontend/`: Next.js + TypeScript + Google Maps JavaScript API
- `backend/`: schema Supabase, migrations, RLS e seeds

## Stack

- Frontend: Next.js App Router, React, TypeScript, Google Maps JavaScript API
- Backend: Supabase Auth, PostgreSQL, PostGIS, Row Level Security
- Deploy: Vercel + Supabase

## Bootstrapping

1. Crie o projeto no Supabase e valide a extensao `postgis`.
2. Execute as migrations em ordem:
   - `backend/supabase/migrations/202603090001_initial_schema.sql`
   - `backend/supabase/migrations/202603090002_public_visibility.sql`
   - `backend/supabase/migrations/202603090003_point_species.sql`
   - `backend/supabase/migrations/202603100001_timeline_event_media.sql`
   - `backend/supabase/migrations/202603100002_point_classifications_and_event_types.sql`
   - `backend/supabase/migrations/202603100005_fix_point_function_ambiguity.sql`
   - `backend/supabase/migrations/202603100006_group_code_and_map_selection.sql`
3. Crie `frontend/.env.local` a partir de `frontend/.env.example`.
4. Preencha `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` e as chaves do Supabase.
5. No Google Cloud, habilite tambem a `Geocoding API` se quiser usar a busca por endereco no mapa.
6. Instale as dependencias e rode o frontend:

```bash
cd frontend
npm install
npm run dev
```

## Modelagem atual

- Ponto usa `point_classification_id` como classificacao principal.
- Cada classificacao pode ter seus proprios tipos de evento em `point_event_types`.
- Se uma classificacao nao tiver tipos de evento, a timeline do ponto salva eventos genericos.
- Reclassificacao do ponto gera evento automatico na linha do tempo.

## Navegacao por grupo

- O mapa aceita `?grupo=<codigo-do-grupo>` para abrir filtrado em um grupo especifico.
- Quando um grupo vem pela URL, o seletor pode ficar recolhido e o usuario pode usar `Trocar grupo`.
- No cadastro de ponto, o grupo da URL entra como padrao.
- O mapa tem busca por endereco e lista paginada de pontos do filtro, ordenada pela distancia em relacao ao centro atual.
