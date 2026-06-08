# Atividade X - Analise Experimental de Ordenacao

Este repositorio contem os scripts usados para executar a atividade de
comparacao experimental de algoritmos de ordenacao.

Algoritmos escolhidos:

- Selection Sort: caso medio e pior caso `O(n^2)`.
- Merge Sort: caso medio e pior caso `O(n log n)`.
- Quick Sort com pivo pseudoaleatorio: caso medio `O(n log n)` e pior caso
  `O(n^2)`.

Os vetores de entrada sao gerados com semente fixa, garantindo que todos os
algoritmos recebam exatamente os mesmos valores para cada tamanho testado.

## Como executar

Use o runtime Node.js disponivel no ambiente:

```bash
npm run benchmark
```

O benchmark gera `data/benchmark-results.json`, com os dados experimentais
coletados durante as execucoes.
