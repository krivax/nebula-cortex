# Nebula Reflex — avaliação local

Regras: **pt-v2**. Conjunto sintético de desenvolvimento v1: 165 pedidos em português. Criado durante a implementação, sem dados de usuários. As regras foram ajustadas usando esse conjunto: não é um teste independente nem estima desempenho em produção. Todos os especialistas foram considerados disponíveis no conjunto original.

Regras locais: 165/165 escolhas iguais à categoria esperada. Abstenções: 20. Tempo da função local: p50 0.004 ms; p95 0.019 ms. Isso exclui IPC, disco, interface e rede. Custo de API: zero.

| Categoria | Casos | Escolhas esperadas | F1 |
|---|---:|---:|---:|
| coordinator | 5 | 5 | 100.0% |
| development | 20 | 20 | 100.0% |
| configuration | 20 | 20 | 100.0% |
| browser | 20 | 20 | 100.0% |
| computer | 20 | 20 | 100.0% |
| writing | 20 | 20 | 100.0% |
| research | 20 | 20 | 100.0% |
| vision | 20 | 20 | 100.0% |
| abstain | 20 | 20 | 100.0% |

## Divergências no conjunto original

Nenhuma nesta execução.

A primeira versão teve 161/165 correspondências. As quatro divergências (development-10, development-18, writing-15 e writing-17) motivaram ajustes em verbos, objetivo principal e restrições. Esta melhora mede regressão nesse conjunto conhecido, não generalização.

## Casos adicionais de regressão

37/37 casos corresponderam ao agente e, quando especificada, à pergunta esperada. Estes casos também foram criados durante a implementação. Incluem objetivos com assuntos de outra especialidade, anexos, código e citações, etapas distintas, objetivos vagos e especialistas indisponíveis. O filtro de disponibilidade é exercitado diretamente.

| Grupo | Casos | Correspondências |
|---|---:|---:|
| objective | 24 | 24 |
| steps | 6 | 6 |
| availability | 4 | 4 |
| context | 3 | 3 |

Nenhuma divergência nos casos adicionais nesta execução.

## Decisão

O modo local já permite testar a orientação sem custo. Ainda depende de regras limitadas de linguagem: mantenha revisão humana e abstenção. Clef-flash permanece opcional: o adaptador foi testado com HTTP sintético no formato oficial, sem medir o modelo hospedado. Não há evidência própria de que Clef supera estas regras. Antes de promovê-lo, comparar uma amostra nova revisada por usuários, medir erros, abstenções, calibração, latência completa e custo. Os limiares atuais (pontuação configurável, margem 0,15) são provisórios.
