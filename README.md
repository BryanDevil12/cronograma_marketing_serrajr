# Cronograma Marketing Serra Jr.

Dashboard web para planejar e acompanhar o cronograma mensal de conteúdo dos assessores de marketing da **Serra Jr. Engenharia** (empresa júnior).

## O que é

Um calendário anual (2026) onde cada dia pode receber um ou mais eventos de conteúdo — posts de feed, stories, vídeos, publicações no LinkedIn, TikTok, YouTube, X, aniversários e observações internas. Para cada evento é possível registrar:

- Tipo de conteúdo (com ícone e cor própria)
- Responsável (membro da equipe)
- Detalhes/descrição
- Visualizações e engajamento (para acompanhar performance após a publicação)

O dashboard também mostra estatísticas do mês (total de posts, visualizações e engajamento) e permite gerenciar a equipe de assessores.

## Como usar

Basta abrir o arquivo [index.html](index.html) em qualquer navegador — é uma aplicação React standalone, sem necessidade de instalação, build ou servidor. Todas as bibliotecas (React, Tailwind, jsPDF) são carregadas via CDN.

Os dados ficam salvos no `localStorage` do navegador, então as alterações persistem apenas no computador/navegador onde foram feitas.

### Funcionalidades principais

- Navegação mês a mês pelo calendário de 2026
- Adicionar, editar e excluir eventos por dia
- Gerenciar a lista de assessores da equipe
- Ocultar dias sem eventos
- Exportar relatórios em PDF

## Publicar via GitHub Pages

Em **Settings > Pages**, selecione a branch `main` e a pasta raiz (`/`) para publicar o dashboard em um link público, acessível pela equipe sem precisar baixar o arquivo.
