import { performance } from "perf_hooks";

// Mock Data Generation
const NUM_WORKSHOPS = 10000;
const NUM_VIEWED = 500;

interface Workshop {
    id: string;
    name: string;
}

const allWorkshops: Workshop[] = Array.from({ length: NUM_WORKSHOPS }, (_, i) => ({
    id: `workshop_${i}`,
    name: `Workshop Name ${i}`,
}));

// Pick some random IDs to be "viewed"
const viewedIds: string[] = [];
for (let i = 0; i < NUM_VIEWED; i++) {
    const randomIndex = Math.floor(Math.random() * NUM_WORKSHOPS);
    viewedIds.push(allWorkshops[randomIndex].id);
}

// 1. Baseline Implementation
function runBaseline() {
    const start = performance.now();

    // Simulate what's currently in HomePageClient.tsx
    const viewedData = viewedIds
        .map((id) => allWorkshops.find((w) => w.id === id))
        .filter((w): w is Workshop => w !== undefined);

    const end = performance.now();
    return { time: end - start, count: viewedData.length };
}

// 2. Optimized Implementation
function runOptimized() {
    const start = performance.now();

    // Optimized approach using Map
    const workshopMap = new Map(allWorkshops.map(w => [w.id, w]));
    const viewedData = viewedIds
        .map((id) => workshopMap.get(id))
        .filter((w): w is Workshop => w !== undefined);

    const end = performance.now();
    return { time: end - start, count: viewedData.length };
}

// Warmup
runBaseline();
runOptimized();

// Run tests
let totalBaseline = 0;
let totalOptimized = 0;
const iterations = 100;

for (let i = 0; i < iterations; i++) {
    totalBaseline += runBaseline().time;
    totalOptimized += runOptimized().time;
}

console.log(`--- Benchmark Results (${iterations} iterations) ---`);
console.log(`Workshops: ${NUM_WORKSHOPS}, Viewed IDs: ${NUM_VIEWED}`);
console.log(`Baseline (O(N^2) array.find): ${(totalBaseline / iterations).toFixed(3)} ms / run`);
console.log(`Optimized (O(N) Map lookup): ${(totalOptimized / iterations).toFixed(3)} ms / run`);
console.log(`Improvement: ${((totalBaseline / totalOptimized)).toFixed(1)}x faster`);
