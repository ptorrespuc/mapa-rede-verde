# Playwright E2E

Base de testes E2E do `Mapa Rede Verde`, inspirada no padrao da sua skill `playwright-tests`, mas adaptada para `Next.js + Supabase`.

## Estrutura

- `tests/_shared`
  - `test-base.ts`: exporta `test` e `expect` e aplica espera final de `500ms`
  - `login.ts`: helper de login via UI
  - `app-config.ts`: carrega variaveis de ambiente do Playwright
  - `supabase-admin.ts`: bootstrap de usuarios e grupos de teste via Supabase service role
- `tests/POINTS/<FEATURE>`
  - suites por area e feature

## Variaveis de ambiente

Use `.env.playwright.example` como base:

- `PLAYWRIGHT_BASE_URL`
- `PLAYWRIGHT_PORT`
- `PW_SUPABASE_URL`
- `PW_SUPABASE_ANON_KEY`
- `PW_SUPABASE_SERVICE_ROLE_KEY`
- `PW_DEFAULT_PASSWORD`
- `PW_ENTITY_PREFIX`

As chaves do Supabase sao necessarias quando o teste precisar criar usuarios, grupos ou vinculos direto no banco/autenticacao.

Os helpers carregam automaticamente, nesta ordem, os arquivos:

- `.env.playwright.local`
- `.env.playwright`
- `.env.local`

## Padrao operacional

- video sempre ligado em `playwright.config.ts`
- trace em falha
- screenshot em falha
- suites por area/feature
- evitar `waitForTimeout`, exceto a espera final centralizada no `test-base`

## Comandos

```powershell
npm run test:list
npm run test:e2e
npm run test:points
npm run test:points:pending-review
npm run test:points:pending-review:real
npx playwright show-report
```

## Bootstrap Supabase

O helper `tests/_shared/supabase-admin.ts` permite:

- criar usuario confirmado no Auth
- garantir perfil em `public.users`
- criar grupo de teste
- associar usuario ao grupo
- montar um cenario simples com aprovador e colaborador

Exemplo de uso:

```ts
import { createGroupApproverScenario } from "@/tests/_shared/supabase-admin";

const scenario = await createGroupApproverScenario();
```

## Observacao

Os testes atuais cobrem:

- harness de UI para fotos e revisao pendente
- fluxo E2E real com aprovador e colaborador em `tests/POINTS/PendingReview/real-photo-reclassification.spec.ts`

O fluxo real cria usuarios e grupo temporarios no Supabase, executa a jornada completa e limpa os dados ao final.
