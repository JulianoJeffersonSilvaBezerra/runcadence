# Checklist de Teste de Campo - Sprint 1 (PaceUp)

## Preparo

1. Build web:
- `npm run build`

2. Sync Android:
- `npm run android:sync`

3. APK debug (opcional por terminal):
- `npm run android:apk`

4. Abrir no Android Studio:
- `npm run android:open`

## Permissoes no celular

1. Localizacao: permitir sempre.
2. Notificacoes: permitir.
3. Ignorar otimizacao de bateria para o app (se possivel).

## Cenarios obrigatorios

1. Ceu aberto (10-15 min).
2. Urbano com predios (10-15 min).
3. Tela apagada/background continuo (15-30 min).

## O que registrar por sessao

1. Distancia PaceUp (filtrada).
2. Distancia PaceUp (bruta).
3. Pace medio PaceUp.
4. Pace instantaneo medio observado.
5. Distancia Strava.
6. Pace medio Strava.
7. Quantidade de pontos aceitos e rejeitados.

## Criterios de aceite Sprint 1

1. Background:
- Distancia e tempo continuam subindo com tela apagada.

2. Pausa e retomada:
- Pausar interrompe o crescimento de distancia.
- Retomar continua da mesma sessao sem zerar rota/tempo.

3. Mapa:
- Rota desenhada ao vivo.
- Inicio e fim marcados.

4. Precisao:
- Diferenca de distancia para Strava <= 3% em media.
- Sem saltos visiveis grandes no trajeto.

5. Estabilidade:
- Sem crash durante treino.
- Encerrar treino salva historico com rota.

## Leitura rapida de diagnostico no app

1. `Distancia bruta` x `Distancia filtrada`:
- Gap alto indica ruído de GPS.

2. `Qualidade de pontos`:
- Muitos rejeitados em ceu aberto indicam thresholds muito agressivos.

3. `Pace instantaneo`:
- Oscilacao extrema com velocidade estavel indica necessidade de maior suavizacao.

## Ajuste fino recomendado

1. Se distancia final ficar menor que Strava em todos os testes:
- Reduzir rejeicao por salto (limite dinamico mais permissivo).

2. Se distancia final ficar maior que Strava:
- Aumentar exigencia de acuracia e manter bloqueio de segmentos rapidos.

3. Se pace instantaneo estiver muito nervoso:
- Aumentar `INSTANT_PACE_ALPHA` para suavizacao mais forte (valor menor).
