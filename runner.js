let PADDING_PARTS_DEFAULT = 6;
let PREFIX_P = 15;
let INITIAL_BATCH_SIZE = 1000;
let TIMEOUT_DELAY = 250;
let MAX_PROB = 9;

let MIN_ZERO = 1;
let MIN_ONE = 2;
let MIN_SOME = 3;

let CLAMP_MODE_RNG = 0;
let CLAMP_MODE_UNSIGNED_MOD = 1;
let CLAMP_MODE_SIGNED_MOD = 2;
let CLAMP_MODE_MOD_ABS = 3;
let CLAMP_MODE_AND = 4;
let CLAMP_MODE_SHIFT_AND = 5;
let CLAMP_MODE_ALL = 6;
let CLAMP_MODE_CUSTOM = 7;

let UNBOUND = 1;
let FORCE_32BIT = 2;
let FORCE_UNSIGNED = 3;

onmessage = function(e) {
  console.log('ww:', e);
  main(
    e.data.$targetBucketCount,
    e.data.$inputValues,
    e.data.$values,
    e.data.$prefixes,
    e.data.$infixes,
    e.data.$bitBounds,
    e.data.$probFloor,
    e.data.$clampMode,
    e.data.$valueProbs,
    e.data.$prefixProbs,
    e.data.$infixProbs,
    e.data.$parts || PADDING_PARTS_DEFAULT,
    e.data.$clampbefore || '',
    e.data.$clampafter || ''
  );
};
let main = ($targetBucketCount, $inputValues, $values, $prefixes, $infixes, $bitBounds, $probFloor, $clampMode, $valueProbs, $prefixProbs, $infixProbs, $paddingParts, $clampBefore, $clampAfter) => {
  let testCounter = 0;
  let offspringCounter = 0;

  // you have
  // - the overall best (dna of the best score seen, period)
  // - the current best (dna of the last dna to beat the best dna score/ever of the same run)
  // - the last clone

  let overallBestDna = null;
  let lastBestDna = null;
  let lastDna = null;

  let dnaUid = 0;
  let bestOffspringCode = '';
  let bestOffspringCodeScore = 0;
  let lastOffspringCode = '';
  let lastOffspringScore = 0;

  if (!$valueProbs) $valueProbs = $values.map(rng_getIntUnder.bind(undefined, MAX_PROB + 1));
  while ($valueProbs.length < $values.length) $valueProbs.push(0);
  if (!$prefixProbs) $prefixProbs = $prefixes.map(rng_getIntUnder.bind(undefined, MAX_PROB + 1));
  while ($prefixProbs.length < $prefixes.length) $prefixProbs.push(0);
  if (!$infixProbs) $infixProbs = $infixes.map(rng_getIntUnder.bind(undefined, MAX_PROB + 1));
  while ($infixProbs.length < $infixes.length) $infixProbs.push(0);

  overallBestDna = lastBestDna = dna_create(
    $valueProbs,
    $prefixProbs,
    $infixProbs,
    $bitBounds,
    $probFloor,
    $clampMode,
    0
  );

  let lastTime = Date.now();
  let lastTests = 0;
  let lastOffsprings = 0;
  let batchSize = INITIAL_BATCH_SIZE;
  while (true) {
    // step the (last) best to try and fuzz new winners with that dna
    let lastBestAvgScore = main_testDna(lastBestDna, batchSize);

    // generate new dna and test that as well
    let dna = lastDna = dna_cloneAndMutate(lastBestDna, batchSize);
    let cloneAvgScore = main_testDna(dna, batchSize);

    let isBetter = cloneAvgScore > (lastBestAvgScore + overallBestDna.bestAvgOffspringScore) / 2;
    let isVeryBetter = cloneAvgScore > overallBestDna.bestAvgOffspringScore

    if (isBetter) {
      lastBestDna = dna;
    }
    if (isVeryBetter) {
      overallBestDna = dna;
    }

    let timeNow = Date.now();
    let delta = timeNow - lastTime;

    postMessage({
      totalTests: testCounter,
      lastTests: testCounter - lastTests,
      totalOffsprings: offspringCounter,
      lastOffsprings: offspringCounter - lastOffsprings,
      batchSize: batchSize,

      bestOffspringCode: bestOffspringCode,
      bestOffspringScore: bestOffspringCodeScore,
      lastOffspringCode: lastOffspringCode,
      lastOffspringScore: lastOffspringScore,

      overallBestDna: overallBestDna,
      lastBestDna: lastBestDna,
      lastDna: dna,
    });


    if (delta < 900 || delta > 1100) {
      batchSize = Math.max(500, Math.floor(batchSize * (1000 / delta)));
    }
    lastTime = timeNow;
    lastTests = testCounter;
    lastOffsprings = offspringCounter;
  }

  function dna_create(valueProb, prefixProb, infixProb, bitBounds, probBounds, clampMode, batchSize) {
    return {
      uid: ++dnaUid,
      valueProb,
      prefixProb,
      infixProb,
      bitBounds, // none, 32bit signed, 32bit unsigned
      probBounds, // zero, one
      clampMode, // shift mod, and

      batchSize: batchSize,

      cloned: 0,

      bestOffspringScore: 0,
      lastBestOffspringScore: 0,
      bestAvgOffspringScore: 0,
      lastAvgOffspringScore: 0,

      lastScores: null,
      lastCount: 0,
      allScores: null,
      allCount: 0,

      valuesExpanded: null,
      prefixesExpanded: null,
      infixesExpanded: null,
    }
  }
  function dna_mutate(dna) {
    let probBounds = dna.probBounds;
    // then mutate the clone
    while (dna_evolve(dna.valueProb, probBounds) + dna_evolve(dna.prefixProb, probBounds) + dna_evolve(dna.infixProb, probBounds) === 0);

    if (probBounds === MIN_SOME) {
      limitZeroes(dna.valueProb, dna.valueProb.length - 3);
      limitZeroes(dna.prefixProb, dna.prefixProb.length - 2);
      limitZeroes(dna.infixProb, dna.infixProb.length - 4);
    }
  }
  function dna_evolve(arr, probBounds) {
    let p = rng_arrIndex(arr);

    // very small chance to completely set/unset (drastic mutation, trying to move from plateaus)
    if (rng_isOneIn(200)) arr[p] = rng_isOneIn(2) ? 0 : MAX_PROB;
    // the rng(50) is basically a mutation
    else arr[p] = arr[p] + ((rng_isOneIn(50) ? 3 : 1) * (rng_getIntUnder(2) ? 1 : -1));
    let min = probBounds===MIN_ONE?1:0;
    if (arr[p] < min) arr[p] = min+1;
    else if (arr[p] > MAX_PROB) arr[p] = MAX_PROB-1;
  }
  function dna_cloneAndMutate(parentDna, batchSize) {
    ++parentDna.cloned;

    // first clone it
    let dna = dna_create(
      parentDna.valueProb.slice(0),
      parentDna.prefixProb.slice(0),
      parentDna.infixProb.slice(0),
      parentDna.bitBounds,
      parentDna.probBounds,
      parentDna.clampMode,
      batchSize
    );

    dna_mutate(dna);

    return dna;
  }

  // randomizer abstractions
  function rng_getIntUnder(max) {
    return Math.floor(Math.random() * (max | 0));
  }
  function rng_isOneIn(n) {
    return rng_getIntUnder(n) === 1;
  }
  function rng_arrValue(arr) {
    return arr[rng_getIntUnder(arr.length)];
  }
  function rng_arrIndex(arr) {
    return rng_getIntUnder(arr.length);
  }

  // generators
  function gen_value($v, forceX) {
    return forceX ? 'x' : rng_arrValue($v);
  }
  function gen_prefix($p, s, last, bitBounds) {
    if (!rng_isOneIn(last)) return s;
    let prefixed = '(' + rng_arrValue($p) + s + ')';
    if (bitBounds === FORCE_UNSIGNED) prefixed = '(' + prefixed + ' >>> 0)';
    else if (bitBounds === FORCE_32BIT) prefixed = '(' + prefixed + ' |0)';
    return gen_prefix($p, prefixed, last / 2);
  }
  function gen_infix($i, left, right, bitBounds) {
    let infix = rng_arrValue($i);
    let infixed = '(' + left + infix + right + ')';

    if (bitBounds === FORCE_UNSIGNED) infixed = '(' + infixed + ' >>> 0)';
    else if (bitBounds === FORCE_32BIT) infixed = '(' + infixed + ' |0)';

    return infixed;
  }
  // generate a formula to test. keep adding until x is part of the formula or there are n parts
  function gen_code($v, $p, $i, bitBounds) {
    let parts = Math.max(2, rng_getIntUnder($paddingParts) >> 1);
    let s = '';
    let xed = false;
    for (let i = 0; i < parts; ++i) {
      let v = gen_value($v);
      if (v === 'x') xed = true;
      v = gen_prefix($p, v, PREFIX_P, bitBounds);

      if (i) s = gen_infix($i, s, v, bitBounds);
      else s = v;
    }

    if (!xed) {
      let v = gen_value($v, true);
      v = gen_prefix($p, v, PREFIX_P, bitBounds);
      s = s ? gen_infix($i, s, v) : v;
    }
    for (let i = 0; i < parts; ++i) {
      let v = gen_value($v);
      v = gen_prefix($p, v, PREFIX_P, bitBounds);
      s = gen_infix($i, s, v, bitBounds);
    }
    return s;
  }

  function main_testDna(dna, batchSize) {
    let values = dna.valuesExpanded;
    if (!values) dna.valuesExpanded = values = expand($values, dna.valueProb);
    let prefixes = dna.prefixesExpanded;
    if (!prefixes) dna.prefixesExpanded = prefixes = expand($prefixes, dna.prefixProb);
    let infixes = dna.infixesExpanded
    if (!infixes) dna.infixesExpanded = infixes = expand($infixes, dna.infixProb);

    let dnaCompoundScore = 0;

    let thisScores = new Array($targetBucketCount+1).fill(0); // (score offsets at 1) track how many time each offspring score was seen
    let thisCount = 0;
    let allScores = dna.allScores;

    dna.lastBestOffspringScore = 0;

    for (let i=0; i<batchSize; ++i) {
      // test the offspring this dna generates
      let score = testOffspring(values, prefixes, infixes, dna, i === batchSize-1);
      ++thisScores[score];
      if (allScores) ++allScores[score];
      ++thisCount;
      dnaCompoundScore += score;
    }

    dna.lastScores = thisScores;
    if (!allScores) dna.allScores = thisScores;
    dna.lastCount = thisCount;
    dna.allCount += thisCount;

    let avgScore = dnaCompoundScore / batchSize;
    dna.lastAvgOffspringScore = avgScore;
    if (avgScore > dna.bestAvgOffspringScore) dna.bestAvgOffspringScore = avgScore;

    return avgScore;
  }
  function limitZeroes(probs, max) {
    let zeroes = 0;
    do {
      zeroes = 0;
      for (let i = 0; i < probs.length && zeroes < max; ++i) {
        if (probs[i] === 0) ++zeroes;
      }
      if (zeroes >= max) {
        for (let i = 0; i < probs.length; ++i) {
          if (probs[i] === 0 && rng_isOneIn(3)) probs[i] = 1;
        }
      }
    } while (zeroes >= max);
  }
  function expand(values, probs) {
    var arr = [];
    for (let i = 0; i < values.length; ++i) {
      for (let j = 0; j < probs[i]; ++j) {
        arr.push(values[i])
      }
    }
    if (arr.length === 0) arr.push(rng_arrValue(values));
    return arr;
  }
  function testOffspring(values, prefixes, infixes, dna, last) {
    ++offspringCounter;

    // we generate a new beast
    let code;
    do {
      code = gen_code(values, prefixes, infixes, dna.bitBounds);
    } while (code.indexOf('NaN') >= 0); // division by zero (x/0 x%0) would make zero unfavorable

    // code = 'case ' + i + ': if (str) return "'+code+'"; else return '+code+';\n';

    let clampMode = dna.clampMode;
    if (!clampMode) clampMode = rng_getIntUnder(5) + 1;

    if (clampMode === CLAMP_MODE_CUSTOM) {
      code = '((' + $clampBefore + code + $clampAfter + ') | 0) % ' + $targetBucketCount;
    }

    let func = Function('x', 'return ' + code);
    let outs = $inputValues.map(iv => func(iv));

    let offspringScore = 0;
    let offspringCode = '';
    let score = 0;

    if (clampMode === CLAMP_MODE_ALL || clampMode === CLAMP_MODE_UNSIGNED_MOD) {
      ++testCounter;
      score = getCodeScore(outs.map(v => (v >>> 0) % $targetBucketCount));
      if (score > offspringScore) {
        offspringScore = score;
        offspringCode = '((' + code + ') >>> 0) % ' + $targetBucketCount;
      }
    }

    if (clampMode === CLAMP_MODE_ALL || clampMode === CLAMP_MODE_SIGNED_MOD) {
      ++testCounter;
      score = getCodeScore(outs.map(v => Math.abs((v|0) % $targetBucketCount)));
      if (score > offspringScore) {
        offspringScore = score;
        offspringCode = 'Math.abs(((' + code + ')|0) % ' + $targetBucketCount + ')';
      }
    }

    if (clampMode === CLAMP_MODE_ALL || clampMode === CLAMP_MODE_MOD_ABS) {
      ++testCounter;
      score = getCodeScore(outs.map(v => Math.abs((v|0) % $targetBucketCount) % $targetBucketCount));
      if (score > offspringScore) {
        offspringScore = score;
        offspringCode = 'Math.abs(((' + code + ')|0) % ' + $targetBucketCount + ') % ' + $targetBucketCount;
      }
    }

    // not generic.. 0x1f is 31 which works for 31 buckets but not 32 or 30 etc.
    if (clampMode === CLAMP_MODE_ALL || clampMode === CLAMP_MODE_AND) {
      ++testCounter;
      score = getCodeScore(outs.map(v => (v & $targetBucketCount) % $targetBucketCount));
      if (score > offspringScore) {
        offspringScore = score;
        offspringCode = '((' + code + ') & ' + $targetBucketCount + ') % ' + $targetBucketCount;
      }
    }

    // not generic just like CLAMP_MODE_AND
    if (clampMode === CLAMP_MODE_ALL || clampMode === CLAMP_MODE_SHIFT_AND) {
      ++testCounter;
      let r = rng_getIntUnder($targetBucketCount) % 32;
      score = getCodeScore(outs.map(v => ((v >> r) & $targetBucketCount) % $targetBucketCount));
      if (score > offspringScore) {
        offspringScore = score;
        offspringCode = '(((' + code + ') >> '+r+') & ' + $targetBucketCount + ') % ' + $targetBucketCount;
      }
    }

    if (clampMode === CLAMP_MODE_CUSTOM) {
      ++testCounter;
      // code already updated above
      score = getCodeScore(outs.map(func));
      if (score > offspringScore) {
        offspringScore = score;
        offspringCode = code;
      }
    }
    if (clampMode === CLAMP_MODE_ALL && ($clampBefore || $clampAfter)) {
      ++testCounter;
      let f = Function('x', 'return ((' + $clampBefore + code + $clampAfter + ') | 0) % ' + $targetBucketCount);
      score = getCodeScore(outs.map(f));
      if (score > offspringScore) {
        offspringScore = score;
        offspringCode = $clampBefore + code + $clampAfter;
      }
    }

    if (offspringScore > dna.lastBestScore) {
      dna.lastBestScore = offspringScore;
      dna.lastBestCode = offspringCode;
    }
    if (offspringScore > dna.bestScore) {
      dna.bestScore = offspringScore;
      dna.bestCode = offspringCode;
    }

    // update right textarea if this result beats our best
    if (offspringScore >= bestOffspringCodeScore) {
      bestOffspringCodeScore = offspringScore;
      bestOffspringCode = offspringCode;
    }

    lastOffspringCode = offspringCode;
    lastOffspringScore = offspringScore;

    if (offspringScore > dna.bestOffspringScore) dna.bestOffspringScore = offspringScore;
    if (offspringScore > dna.lastBestOffspringScore) dna.lastBestOffspringScore = offspringScore;

    return offspringScore;
  }
  function getCodeScore(arr) {
    // we test the beast. collect how many flags end up in the same "bucket".
    // the more buckets the better. the goal is each flag its own bucket.
    let currentBuckets = {};
    let bucketCount = 0;
    for (let i = 0, n = arr.length; i < n; ++i) {
      let y = arr[i];
      let count = currentBuckets[y];
      if (!count) {
        ++bucketCount;
        currentBuckets[y] = 1;
      } else {
        currentBuckets[y] = count + 1;
      }
    }
    return bucketCount;
  }

};
