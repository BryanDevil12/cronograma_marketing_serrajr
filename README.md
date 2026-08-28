# Cronograma Marketing Serra Jr.

Dashboard web para planejar e acompanhar o cronograma mensal de conteúdo dos assessores de marketing da **Serra Jr. Engenharia** (empresa júnior).

## O que é

Um calendário anual (2026) onde cada dia pode receber um ou mais eventos de conteúdo — posts de feed, stories, vídeos, publicações no LinkedIn, TikTok, YouTube, X, aniversários e observações internas. Para cada evento é possível registrar:

- Tipo de conteúdo (com ícone e cor própria)
- Responsável (quem produz) e Revisor (quem corrige)
- Detalhes/descrição
- Visualizações e engajamento (para acompanhar performance após a publicação)

O dashboard também mostra estatísticas do mês (total de posts, visualizações e engajamento). O calendário sempre abre no mês atual.

## Páginas

- **[index.html](index.html)** — visualização pública, somente leitura. É o que a equipe usa para consultar a pauta do mês.
- **[admin.html](admin.html)** — área administrativa protegida por senha, usada para criar/editar/excluir eventos, gerenciar os membros da equipe e exportar os dados atualizados.

## Como usar

Basta abrir o arquivo desejado em qualquer navegador — é uma aplicação React standalone, sem necessidade de instalação, build ou servidor. Todas as bibliotecas (React, Tailwind, jsPDF) são carregadas via CDN.

Os dados ficam salvos no `localStorage` do navegador, então as alterações feitas no admin persistem apenas no computador/navegador onde foram feitas. Para publicar as mudanças para todos, use o botão **Exportar Dados** no admin e atualize o bloco `rawInitialDB` / `defaultTeamMembers` no início do `<script>` de ambos os arquivos, depois faça commit.

### Funcionalidades principais

- Navegação mês a mês pelo calendário de 2026, abrindo automaticamente no mês atual
- (Admin) Adicionar, editar e excluir eventos por dia
- (Admin) Gerenciar a lista de assessores da equipe
- Ocultar dias sem eventos
- Exportar relatórios em PDF
- Gerar mensagem formatada para enviar a pauta do mês no grupo do WhatsApp

## Publicar via GitHub Pages

Em **Settings > Pages**, selecione a branch `main` e a pasta raiz (`/`) para publicar o dashboard em um link público, acessível pela equipe sem precisar baixar o arquivo.
