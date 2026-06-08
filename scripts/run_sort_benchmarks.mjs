import fs from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";

const SIZES = [1_000, 10_000, 100_000];
const RUNS = 3;
const TIMEOUT_SECONDS = 300;
const OUTPUT_PATH = "data/benchmark-results.json";
const BASE_VECTOR_SEED = 0x5eed_2026;
const QUICK_PIVOT_SEED = 0xc0de_2026;
const WARMUP_SIZE = 256;

const algorithms = [
  {
    name: "Selection Sort",
    averageComplexity: "O(n^2)",
    worstComplexity: "O(n^2)",
    operationLabel: "trocas",
    sort: selectionSort,
  },
  {
    name: "Merge Sort",
    averageComplexity: "O(n log n)",
    worstComplexity: "O(n log n)",
    operationLabel: "movimentacoes/escritas",
    sort: mergeSort,
  },
  {
    name: "Quick Sort",
    averageComplexity: "O(n log n)",
    worstComplexity: "O(n^2)",
    operationLabel: "trocas",
    sort: quickSort,
  },
];

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function generateVector(size) {
  const random = mulberry32(BASE_VECTOR_SEED ^ size);
  const vector = new Array(size);

  for (let i = 0; i < size; i += 1) {
    vector[i] = Math.floor(random() * 1_000_000);
  }

  return vector;
}

function assertSorted(values) {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] > values[i]) {
      throw new Error(`Vetor nao ordenado na posicao ${i}`);
    }
  }
}

function checkTimeout(start) {
  const elapsedSeconds = (performance.now() - start) / 1000;

  if (elapsedSeconds > TIMEOUT_SECONDS) {
    throw new Error("TIMEOUT");
  }
}

function selectionSort(input, start) {
  const values = input.slice();
  let swaps = 0;

  for (let i = 0; i < values.length - 1; i += 1) {
    if (i % 128 === 0) {
      checkTimeout(start);
    }

    let minIndex = i;

    for (let j = i + 1; j < values.length; j += 1) {
      if (values[j] < values[minIndex]) {
        minIndex = j;
      }
    }

    if (minIndex !== i) {
      const temp = values[i];
      values[i] = values[minIndex];
      values[minIndex] = temp;
      swaps += 1;
    }
  }

  return { values, operations: swaps };
}

function mergeSort(input, start) {
  const length = input.length;
  let source = input.slice();
  let target = new Array(length);
  let movements = 0;

  for (let width = 1; width < length; width *= 2) {
    checkTimeout(start);

    for (let left = 0; left < length; left += width * 2) {
      const middle = Math.min(left + width, length);
      const right = Math.min(left + width * 2, length);
      let i = left;
      let j = middle;

      for (let k = left; k < right; k += 1) {
        if (i < middle && (j >= right || source[i] <= source[j])) {
          target[k] = source[i];
          i += 1;
        } else {
          target[k] = source[j];
          j += 1;
        }

        movements += 1;
      }
    }

    const temp = source;
    source = target;
    target = temp;
  }

  return { values: source, operations: movements };
}

function quickSort(input, start, size) {
  const values = input.slice();
  const random = mulberry32(QUICK_PIVOT_SEED ^ size);
  const stack = [[0, values.length - 1]];
  let swaps = 0;

  while (stack.length > 0) {
    if (stack.length % 256 === 0) {
      checkTimeout(start);
    }

    const [low, high] = stack.pop();
    if (low >= high) {
      continue;
    }

    const pivotIndex = low + Math.floor(random() * (high - low + 1));
    swaps += swap(values, pivotIndex, high);
    const pivot = values[high];
    let storeIndex = low;

    for (let i = low; i < high; i += 1) {
      if (values[i] < pivot) {
        swaps += swap(values, i, storeIndex);
        storeIndex += 1;
      }
    }

    swaps += swap(values, storeIndex, high);

    const leftSize = storeIndex - 1 - low;
    const rightSize = high - (storeIndex + 1);

    if (leftSize > rightSize) {
      stack.push([low, storeIndex - 1]);
      stack.push([storeIndex + 1, high]);
    } else {
      stack.push([storeIndex + 1, high]);
      stack.push([low, storeIndex - 1]);
    }
  }

  return { values, operations: swaps };
}

function swap(values, a, b) {
  if (a === b) {
    return 0;
  }

  const temp = values[a];
  values[a] = values[b];
  values[b] = temp;
  return 1;
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sampleStandardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }

  const average = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function summarize(runs) {
  const completedRuns = runs.filter((run) => !run.timeout);

  if (completedRuns.length === 0) {
    return {
      averageTimeSeconds: null,
      standardDeviationSeconds: null,
      averageOperations: null,
    };
  }

  return {
    averageTimeSeconds: mean(completedRuns.map((run) => run.timeSeconds)),
    standardDeviationSeconds: sampleStandardDeviation(
      completedRuns.map((run) => run.timeSeconds),
    ),
    averageOperations: Math.round(mean(completedRuns.map((run) => run.operations))),
  };
}

function warmUp(algorithm) {
  const vector = generateVector(WARMUP_SIZE);
  const start = performance.now();
  const { values } = algorithm.sort(vector, start, WARMUP_SIZE);
  assertSorted(values);
}

async function run() {
  const environment = {
    language: `JavaScript (Node.js ${process.version})`,
    operatingSystem: `${os.version()} (${os.release()}, ${os.arch()})`,
    processor: os.cpus()[0]?.model ?? "Nao informado",
    memoryRam: `${(os.totalmem() / 1024 ** 3).toFixed(2)} GB`,
  };

  const results = [];

  for (const size of SIZES) {
    const originalVector = generateVector(size);

    for (const algorithm of algorithms) {
      const runs = [];
      console.log(`Executando ${algorithm.name} com ${size} elementos`);
      warmUp(algorithm);

      for (let runIndex = 1; runIndex <= RUNS; runIndex += 1) {
        const start = performance.now();

        try {
          const { values, operations } = algorithm.sort(originalVector, start, size);
          const elapsed = (performance.now() - start) / 1000;
          assertSorted(values);

          runs.push({
            run: runIndex,
            timeSeconds: Number(elapsed.toFixed(6)),
            operations,
            timeout: false,
          });
        } catch (error) {
          if (error.message !== "TIMEOUT") {
            throw error;
          }

          runs.push({
            run: runIndex,
            timeSeconds: null,
            operations: null,
            timeout: true,
            note: `Interrompido apos ${TIMEOUT_SECONDS} segundos`,
          });
        }
      }

      results.push({
        algorithm: algorithm.name,
        averageComplexity: algorithm.averageComplexity,
        worstComplexity: algorithm.worstComplexity,
        operationLabel: algorithm.operationLabel,
        size,
        runs,
        summary: summarize(runs),
      });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    runsPerCase: RUNS,
    timeoutSeconds: TIMEOUT_SECONDS,
    vectorSeed: BASE_VECTOR_SEED,
    quickPivotSeed: QUICK_PIVOT_SEED,
    note:
      "Para cada tamanho, o mesmo vetor original pseudoaleatorio foi usado como entrada de todos os algoritmos.",
    environment,
    algorithms: algorithms.map(
      ({ name, averageComplexity, worstComplexity, operationLabel }) => ({
        name,
        averageComplexity,
        worstComplexity,
        operationLabel,
      }),
    ),
    results,
  };

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Resultados salvos em ${OUTPUT_PATH}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
