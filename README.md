# PaceUp

Aplicativo de corrida que usa música, BPM e GPS para ajudar o corredor a controlar o pace em tempo real.

## Visão geral

O PaceUp foi criado com a ideia de transformar a música em uma ferramenta prática de treino.

Em vez de usar a música apenas como entretenimento, o app utiliza o BPM da faixa, a passada estimada e os dados de GPS para calcular o ritmo da corrida e ajudar o usuário a manter um pace-alvo.

## Principais funcionalidades

- Cálculo de pace em tempo real com GPS
- Estimativa de cadência com base em velocidade e passada
- Ajuste de velocidade da música para influenciar o ritmo da corrida
- Editor manual de BPM
- Modo de treino por pace-alvo
- Modo de treino guiado pela música
- Metronomo integrado
- Coach por voz
- Treino de tiro com blocos personalizados
- Histórico de treinos
- Estrutura preparada para sincronização com backend

## Tecnologias utilizadas

- React
- TypeScript
- Vite
- Capacitor
- Geolocation API
- Web Audio API
- Supabase

## Estrutura do projeto

O projeto inclui módulos voltados para:

- corrida em tempo real
- cálculo de pace
- calibração de passada
- música e BPM
- treino de tiro
- mapa com rota GPS
- histórico de sessões

## Objetivo do projeto

Este projeto foi desenvolvido como estudo prático de desenvolvimento de aplicações em tempo real, com foco em:

- lógica aplicada ao esporte
- processamento de dados de corrida
- experiência do usuário
- integração entre áudio, GPS e métricas de desempenho

## Status

Em desenvolvimento.

Melhorias em andamento:

- refinamento da experiência mobile
- evolução do acompanhamento em segundo plano
- melhoria da precisão dos dados
- organização do projeto para apresentação profissional

## Como rodar o projeto

### Versão web

```bash
npm install
npm run dev
