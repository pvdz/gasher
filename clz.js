(_ => {

  let TARGET_BUCKET_COUNT = 32; // into how many buckets should the input split?
  let PADDING_PARTS = 3;
  let PREFIX_P = 15;
  let EVOLVE_INTERVAL = 5000;
  let TIMEOUT_DELAY = 250;
  let MAX_PROB = 9;

  // these are the values we are trying to hash.
  let TARGET_VALUES = [];
  // generate the binary flags to match each individual bit 0~30
  for (let i = 0; i < TARGET_BUCKET_COUNT; ++i) {
    TARGET_VALUES[i] = (1 << i >>> 0);
  }

  //// create a hashing for a particular Trie
  //// a-z 0-9 $ _ - #
  //TARGET_VALUES = [
  //  97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122,
  //  48, 49, 50, 51, 52, 53, 54, 55, 56, 57,
  //  36, 95, 45, 35,
  //];
  //TARGET_BUCKET_COUNT = TARGET_VALUES.length;

  // symbols to generate formulae with
  let VALUES = ['x', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0x1f', '11', '12', '13', '14', '15'];//, '1e2', '1e3', '1e4', '1e5', '1e6', '1e7', '1e8', '1e9'];
  let PREFIXES = ['-', '~', '!', '~~'];
  let INFIXES = [/*'*', '/', '+', '-',*/ '%', '&', '|', '^', '<<', '>>', '>>>'];

  $values.value = VALUES;
  $prefixes.value = PREFIXES;
  $infixes.value = INFIXES;

  let testCounter = 0;
  let paused = true;
  let skipMutation = false;

  let bestCounter = 0;
  let bestScore = 0;
  let bestCode = '';
  let bestDnaScore = 0;
  let bestDnaScoreEver = 0;

  let MIN_ZERO = 1;
  let MIN_ONE = 2;

  let BUCKET_MODE_RNG = 0;
  let BUCKET_MODE_UNSIGNED_MOD = 1;
  let BUCKET_MODE_SIGNED_MOD = 2;
  let BUCKET_MODE_MOD_ABS = 3;
  let BUCKET_MODE_AND = 4;
  let BUCKET_MODE_SHIFT_AND = 5;

  let UNBOUND = 1;
  let FORCE_32BIT = 2;
  let FORCE_UNSIGNED = 3;

  let bestDna = createDna(
    VALUES.map(rng.bind(undefined, MAX_PROB)),
    PREFIXES.map(rng.bind(undefined, MAX_PROB)),
    INFIXES.map(rng.bind(undefined, MAX_PROB)),
    FORCE_32BIT,
    MIN_ZERO,
    BUCKET_MODE_RNG
  );

  $valueb.value = bestDna.valueProb;
  $prefixeb.value = bestDna.prefixProb;
  $infixeb.value = bestDna.infixProb;
  $unbound.checked = bestDna.bitBounds === UNBOUND;
  $word.checked = bestDna.bitBounds === FORCE_32BIT;
  $unsigned.checked = bestDna.bitBounds === FORCE_UNSIGNED;

  function createDna(valueProb, prefixProb, infixProb, bitBounds, probBounds, clampMode) {
    return {
      valueProb,
      prefixProb,
      infixProb,
      bitBounds, // none, 32bit signed, 32bit unsigned
      probBounds, // zero, one
      clampMode, // shift mod, and
      bestScore: 0,
      lastScore: 0,
      scores: new Array(TARGET_BUCKET_COUNT+1).fill(0), // (score offsets at 1) track how many time each offspring score was seen
      scoresCount: 0,
      valuesExpanded: null,
      prefixesExpanded: null,
      infixesExpanded: null,
    }
  }

  // randomizer abstractions
  function rng(max) {
    return Math.floor(Math.random() * (max | 0));
  }
  function ris(n) {
    return rng(n) === 1;
  }
  function rac(arr) {
    return arr[rng(arr.length)];
  }
  function rap(arr) {
    return rng(arr.length);
  }

  // generators
  function generateValue($v, forceX) {
    return forceX ? 'x' : rac($v);
  }
  function generatePrefix($p, s, last, bitBounds) {
    if (!ris(last)) return s;
    let prefixed = '(' + rac($p) + s + ')';
    if (bitBounds === FORCE_UNSIGNED) prefixed = '(' + prefixed + ' >>> 0)';
    else if (bitBounds === FORCE_32BIT) prefixed = '(' + prefixed + ' |0)';
    return generatePrefix($p, prefixed, last / 2);
  }
  function generateInfix($i, left, right, bitBounds) {
    let infix = rac($i);
    let infixed = '(' + left + infix + right + ')';

    if (bitBounds === FORCE_UNSIGNED) infixed = '(' + infixed + ' >>> 0)';
    else if (bitBounds === FORCE_32BIT) infixed = '(' + infixed + ' |0)';

    return infixed;
  }
  // generate a formula to test. keep adding until x is part of the formula or there are n parts
  function generateCode($v, $p, $i, bitBounds) {
    let s = '';
    let xed = false;
    for (let i = 0, n = rng(PADDING_PARTS); i < n; ++i) {
      let v = generateValue($v);
      if (v === 'x') xed = true;
      v = generatePrefix($p, v, PREFIX_P, bitBounds);

      if (i) s = generateInfix($i, s, v, bitBounds);
      else s = v;
    }

    if (!xed) {
      let v = generateValue($v, true);
      v = generatePrefix($p, v, PREFIX_P, bitBounds);
      s = s ? generateInfix($i, s, v) : v;
    }
    for (let i = 0, n = rng(PADDING_PARTS); i < n; ++i) {
      let v = generateValue($v);
      v = generatePrefix($p, v, PREFIX_P, bitBounds);
      s = generateInfix($i, s, v, bitBounds);
    }
    return s;
  }

  function run() {
    if (!paused) {
      let dna = offspring(bestDna);
      let childScore = sequencer(dna);
      let bestScore = sequencer(bestDna, true);

      C.innerHTML = testCounter + ': Best ever: '+bestDnaScoreEver+', Current best: ' + bestDnaScore + ', last best: ' + bestScore + ', vs child score: ' + childScore;

      if (bestScore > bestDnaScore) {
        bestDnaScore = bestScore;
        if (bestScore > bestDnaScoreEver) bestDnaScoreEver = bestScore;
      } // improved itself?
      if (childScore > (bestScore + bestDnaScore) / 2) { // just >bestScore was too aggressive
        bestDna = dna;
        bestDnaScore = childScore;
        bestCounter = 0;
        if (childScore > bestDnaScoreEver) bestDnaScoreEver = childScore;

        $valueb.value = bestDna.valueProb;
        $prefixeb.value = bestDna.prefixProb;
        $infixeb.value = bestDna.infixProb;
      }
    }
    setTimeout(run, TIMEOUT_DELAY);
  }
  function sequencer(dna, forBest) {
    if (!forBest) {
      $valuep.value = dna.valueProb;
      $prefixep.value = dna.prefixProb;
      $infixep.value = dna.infixProb;
    }

    let values = dna.valuesExpanded;
    if (!values) dna.valuesExpanded = values = expand(VALUES, dna.valueProb);
    let prefixes = dna.prefixesExpanded;
    if (!prefixes) dna.prefixesExpanded = prefixes = expand(PREFIXES, dna.prefixProb);
    let infixes = dna.infixesExpanded
    if (!infixes) dna.infixesExpanded = infixes = expand(INFIXES, dna.infixProb);

    let dnaCompoundScore = 0;
    let scores = dna.scores;
    let scoresCount = dna.scoresCount;

    for (let i=0; i<EVOLVE_INTERVAL; ++i) {
      // test the offspring this dna generates
      let score = testOffspring(values, prefixes, infixes, dna, i === EVOLVE_INTERVAL-1);
      ++scores[score];
      ++scoresCount;
      dnaCompoundScore += score;
    }

    dna.scoresCount = scoresCount;

    let dnaScore = dnaCompoundScore / EVOLVE_INTERVAL;
    if (forBest) {
      let str = getUiString(dnaScore, scores, scoresCount, dnaScore > bestDnaScore) + '[accumulated in '+bestCounter+' batches]';
      E.innerHTML = 'Best:\n' + str;
    } else {
      let str = getUiString(dnaScore, scores, scoresCount, dnaScore > bestDnaScore) + '[streak: '+bestCounter+']';
      D.innerHTML = (str + '\n' + D.innerHTML).slice(0, 10000);
    }
    return dnaScore;
  }
  function offspring(parentDna) {
    ++bestCounter;

    // first clone it
    let dna = createDna(
      parentDna.valueProb.slice(0),
      parentDna.prefixProb.slice(0),
      parentDna.infixProb.slice(0),
      parentDna.bitBounds,
      parentDna.probBounds,
      parentDna.clampMode
    );

    if (skipMutation) {
      skipMutation = false;
    } else {
      mutate(dna);
    }

    return dna;
  }
  function mutate(dna) {
    let probBounds = dna.probBounds;
    // then mutate the clone
    while (evolve(dna.valueProb, probBounds) + evolve(dna.prefixProb, probBounds) + evolve(dna.infixProb, probBounds) === 0);

    limitZeroes(dna.valueProb, dna.valueProb.length - 3);
    limitZeroes(dna.prefixProb, dna.prefixProb.length - 2);
    limitZeroes(dna.infixProb, dna.infixProb.length - 4);
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
          if (probs[i] === 0 && ris(3)) probs[i] = 1;
        }
      }
    } while (zeroes >= max);
  }
  function evolve(arr, probBounds) {
    let p = rap(arr);

    // very small chance to completely set/unset (drastic mutation, trying to move from plateaus)
    if (ris(200)) arr[p] = ris(2) ? 0 : MAX_PROB;
    // the rng(50) is basically a mutation
    else arr[p] = arr[p] + ((ris(50) ? 3 : 1) * (rng(2) ? 1 : -1));
    let min = probBounds===MIN_ZERO?0:1;
    if (arr[p] < min) arr[p] = min+1;
    else if (arr[p] > MAX_PROB) arr[p] = MAX_PROB-1;
  }
  function expand(values, probs) {
    var arr = [];
    for (let i = 0; i < values.length; ++i) {
      for (let j = 0; j < probs[i]; ++j) {
        arr.push(values[i])
      }
    }
    if (arr.length === 0) arr.push(rac(values));
    return arr;
  }
  function testOffspring(values, prefixes, infixes, dna, last) {
    ++testCounter;

    // we generate a new beast
    let code;
    do {
      code = generateCode(values, prefixes, infixes, dna.bitBounds);
    } while (code.indexOf('NaN') >= 0); // division by zero (x/0 x%0) would make zero unfavorable

    let clampMode = dna.clampMode;
    if (!clampMode) clampMode = rng(5) + 1;
    if (clampMode === BUCKET_MODE_UNSIGNED_MOD) code = '((' + code + ') >>> 0) % ' + TARGET_BUCKET_COUNT;
    else if (clampMode === BUCKET_MODE_SIGNED_MOD) code = 'Math.abs(((' + code + ')|0) % ' + TARGET_BUCKET_COUNT + ')';
    else if (clampMode === BUCKET_MODE_MOD_ABS) code = 'Math.abs(((' + code + ')|0) % ' + TARGET_BUCKET_COUNT + ') % ' + TARGET_BUCKET_COUNT;
    else if (clampMode === BUCKET_MODE_AND) code = '(' + code + ') & 0x1f'; // not generic.. 0x1f is 31 which works for 31 buckets but not 32 or 30 etc.
    else if (clampMode === BUCKET_MODE_SHIFT_AND) code = '((' + code + ') >> '+rng(TARGET_BUCKET_COUNT-5)+') & 0x1f'; // not generic just like BUCKET_MODE_AND
    else THROW('bug');
    let func = Function('x', 'return ' + code + ';');

    // we test the beast. collect how many flags end up in the same "bucket".
    // the more buckets the better. the goal is each flag its own bucket.
    let currentBuckets = {};
    let bucketCount = 0;
    TARGET_VALUES.map(flag => { // this gets deopt
      let y = func(flag);
      let count = currentBuckets[y];
      if (!count) {
        ++bucketCount;
        currentBuckets[y] = 1;
      } else {
        currentBuckets[y] = count + 1;
      }
    });

    // this is our goal
    if (bucketCount === TARGET_BUCKET_COUNT) document.body.style.backgroundColor = 'green';

    // update right textarea if this result beats our best
    if (bucketCount > bestScore) {
      bestScore = bucketCount;
      bestCode = code;

      B.value = offspringToString(code, func, currentBuckets, bucketCount, dna);
    } else if (bucketCount === bestScore && bucketCount >= TARGET_BUCKET_COUNT-1) {
      B.value += '\n\n' + offspringToString(code, func, currentBuckets, bucketCount, dna);
    }

    if (last) {
      A.value = offspringToString(code, func, currentBuckets, bucketCount, dna);
    }

    return bucketCount;
  }
  function offspringToString(code, func, buckets, score, dna) {
    // BIT_COUNT/bucketCount are for stats. how many buckets did we use. we'd like bucketCount/BIT_COUNT to be 1 for a perfect hash
    return '' +
      '########' +
      '## (' + score + ' / ' + TARGET_BUCKET_COUNT + ')\n' +
      '## var code = ' + code + ';\n' +
      '## var min  = ' + ujs2(code) + ';\n' +
      '## iteration ' + testCounter + '\n' +
      '## Results per flag: [' + TARGET_VALUES.map(func).join(',') + ']' + '\n' +
      '## Buckets: ' + JSON.stringify(buckets).replace(/"/g, '') + '\n' +
      '## DNA; ' + JSON.stringify(dna).replace(/"/g, '') + ']\n' +
      '########' +
      '';
  }
  function getUiString(dnaScore, dnaScores, dnaOffsprings, isBetterDna) {
    let bs = dnaScores.map((n,i)=>!i?'':n >= 100 ? (((n/dnaOffsprings)<0.1?' ':'') + Math.floor(n/dnaOffsprings*100) + '%') : n===0?' - ':((n<10?' ':'')+(n + 'x'))).join(' ');
    let str = (isBetterDna?':)':':(') + ' (' + dnaScore.toPrecision(4) + ' avg / '+bestDnaScore.toPrecision(4)+' best) [' + bs + '] ';
    return str;
  }

  $loadui.onclick = _ => sequencer(createDna(
    $valuep.value.trim().split(/\s*,?\s*/g).map(parseFloat),
    $prefixep.value.trim().split(/\s*,?\s*/g).map(parseFloat),
    $infixep.value.trim().split(/\s*,?\s*/g).map(parseFloat),
    $unsigned.checked ? FORCE_UNSIGNED : $word.checked ? FORCE_32BIT : UNBOUND,
    MIN_ZERO
  ));

  $best.onclick = _ => sequencer(bestDna);
  $toggle.onclick = _ => $toggle.value = (paused = !paused) ? 'unpause' : 'pause';
  $rng.onclick = _ => sequencer(createDna(
    VALUES.map(_ => rng(MAX_PROB)),
    PREFIXES.map(_ => rng(MAX_PROB)),
    INFIXES.map(_ => rng(MAX_PROB)),
    rng(3)+1,
    MIN_ZERO
  ));
  $word.onclick = e => console.log(force32bit = e.target.checked);
  $unsigned.onclick = e => forceUnsigned = e.target.checked;

  run();
})();