# Avaliação da Aplicação Web: Interface e Usabilidade

## Objetivo
Esta avaliação prioriza a experiência de uso (UX), clareza da interface (UI) e facilidade de execução das tarefas principais da plataforma.

---

## Resumo executivo

**Nota geral atual (UX/UI): 7,5 / 10**

### Pontos fortes
- Navegação principal clara por contexto de usuário (Mapa, Pontos, Notificações, Administração).
- Boa orientação contextual no fluxo de mapa (instruções para desktop e mobile).
- Filtros ativos com resumo visual e ações de "ver"/"limpar".
- Persistência de escopo de grupo em URL/cookie, reduzindo atrito em sessões recorrentes.
- Fluxo de autenticação completo em uma experiência única (login/cadastro/recuperação).

### Pontos críticos
1. **Acessibilidade de teclado/foco visual insuficiente** em vários controles globais.
2. **Dependência de clique direito no mapa** para criação rápida (não é natural para todos os perfis).
3. **Complexidade alta de filtros** para usuários com menos familiaridade.
4. **Mobile com controles críticos escondidos** atrás de modal.
5. **Feedback de ações muito efêmero** (toasts), com pouca persistência no layout.

---

## Avaliação por área

## 1) Navegação e arquitetura da informação

### O que funciona
- Menu superior com rótulos simples e previsíveis.
- Exibição condicional por perfil reduz ruído de opções que o usuário não pode usar.

### Oportunidade
- Incluir subtítulo contextual persistente no topo do conteúdo para reforçar "onde estou" e "o que posso fazer" em cada seção (especialmente no mobile).

**Impacto esperado:** menor tempo de orientação inicial para novos usuários.

---

## 2) Mapa (fluxo principal)

### O que funciona
- Call to action de "Novo ponto" está presente.
- Distância na listagem ajuda priorização de campo.
- Seleção de grupo com modal melhora foco em um escopo por vez.

### Oportunidades
- Tratar clique direito como atalho avançado e não como estratégia principal de descoberta.
- Exibir microfeedback persistente no cabeçalho do mapa após ações importantes (ex.: "Ponto enviado para aprovação").
- Manter filtros rápidos essenciais visíveis no mobile sem precisar abrir modal.

**Impacto esperado:** redução de erros de execução e menor fricção em uso recorrente.

---

## 3) Listagens e filtros (Mapa e Workspace)

### O que funciona
- Sistema de filtros é robusto e detalhado.
- Existe síntese dos filtros aplicados.

### Oportunidades
- Dividir em níveis:
  - **Filtros rápidos:** classificação, pendentes, meus pontos.
  - **Filtros avançados:** tags e espécies.
- Oferecer presets salvos (ex.: "Pendentes do meu grupo", "Todos os meus pontos").

**Impacto esperado:** menor carga cognitiva e menor tempo para chegar no resultado desejado.

---

## 4) Formulários (criação/edição de ponto)

### O que funciona
- Fluxo é completo e contempla espécies, tags, coordenadas e mídia.
- Mensagens e textos de apoio são didáticos.

### Oportunidades
- Reforçar hierarquia visual por etapas numeradas (ex.: 1. Dados, 2. Localização, 3. Fotos).
- Reduzir densidade inicial (colapsar blocos avançados por padrão).
- Exibir confirmação persistente de sucesso com link direto para o ponto criado/editado.

**Impacto esperado:** menor abandono e menor retrabalho no envio.

---

## 5) Acessibilidade (prioridade alta)

### Achados
- Há poucos estilos de foco visível globais para teclado.
- Falta padronização explícita de foco/estado ativo para links e botões principais.

### Recomendações
- Definir padrão global de `:focus-visible` para botões, links de navegação, inputs e checkboxes.
- Garantir comportamento de `Esc`, foco inicial e retorno de foco em modais.
- Revisar contraste de elementos secundários e estados desabilitados.

**Impacto esperado:** melhora imediata da usabilidade para teclado, acessibilidade e compliance.

---

## Plano recomendado (priorizado por esforço x impacto)

## Sprint curta (quick wins)
1. Padronizar foco visível global.
2. Tornar feedback de ações críticas persistente na própria tela.
3. Expor 2–3 filtros rápidos no mobile sem modal.

## Sprint seguinte
1. Reorganizar filtros em rápido vs avançado.
2. Melhorar onboarding contextual no mapa (tooltips curtos na primeira sessão).
3. Criar estados vazios mais orientados à ação.

## Evolução estrutural
1. Presets de filtros por perfil.
2. Métricas de UX (tempo para criar ponto, taxa de erro por fluxo, abandono por etapa).
3. Revisão de acessibilidade com checklist WCAG.

---

## Métricas para acompanhar melhoria
- Tempo médio para criar um ponto (objetivo: reduzir).
- Taxa de conclusão do formulário de ponto.
- Uso de filtros por sessão.
- Taxa de retrabalho (edições logo após criação).
- Taxa de sucesso em tarefas mobile.

---

## Conclusão
A aplicação já tem uma base sólida de produto e cobertura funcional.

O maior ganho agora está em **simplificar a experiência para uso frequente**, principalmente por:
- foco em acessibilidade,
- redução de complexidade percebida,
- e feedback mais persistente nas ações críticas.

Com as melhorias sugeridas, é realista levar a experiência para **8,5+/10** em ciclos curtos.
