var myWorker;
var lastOffspringBestScore = 0;
var lastOffspringBestCode = '';
var lastBestDna = null;
var targetBucketCount = 0;
var appendAfter = 1;
let paused = false;

$valuestohash.onkeyup = function() {
  try {
    let inputValues = new Function('return ' + $valuestohash.value)();
    $actualinputstohash.value = '[' + inputValues.join(', ') + ']';
    $actualinputlen.value = inputValues.length;
    $valuestohash.className = '';
  } catch (e) {
    $valuestohash.className = 'bad';
  }
};

function start(valueProbString, prefixProbString, infixProbString) {
  stop();

  console.log('starting');
  $toggle.value = 'stop';

  let inputValues;
  try {
    inputValues = new Function('return ' + $valuestohash.value)();
    $actualinputstohash.value = '[' + inputValues.join(', ') + ']';
    $actualinputlen.value = inputValues.length;
  } catch (e) {
    $valuestohash.className = 'bad';
    return;
  }

  lastOffspringBestScore = 0;
  appendAfter = parseInt($appendafter.value, 10) || 0;

  Array.from(document.querySelectorAll('input')).map(e => e.type !== 'button' && (e.disabled = true));
  $clear.disabled = true;
  $rng.disabled = true;
  $spinner.style.opacity = 1;

  targetBucketCount = parseInt($targetbucketcount.value, 10) || inputValues.length;
  $bucketcount.innerHTML = '          bucket-count    ' + new Array(targetBucketCount).fill(0).map((_, i) => ' '.repeat(3 - (i+1+'').length) + (i+1)).join(' ') + '   batch  codes  tests';

  myWorker = new Worker('runner.js');

  myWorker.postMessage({
    $targetBucketCount: targetBucketCount,
    $inputValues: inputValues,
    $values: $values.value.split(/\s*,\s*/g),
    $prefixes: $prefixes.value.split(/\s*,\s*/g),
    $infixes: $infixes.value.split(/\s*,\s*/g),
    $bitBounds: parseFloat(document.querySelector('[name="bound"]:checked').value),
    $probFloor: parseFloat(document.querySelector('[name="min"]:checked').value),
    $clampMode: parseFloat(document.querySelector('[name="clampmode"]:checked').value),
    // if these are empty then they'll be randomly initialized
    $valueProbs: valueProbString && valueProbString.split(/\s*,\s*/g).map(parseFloat),
    $prefixProbs: prefixProbString && prefixProbString.split(/\s*,\s*/g).map(parseFloat),
    $infixProbs: infixProbString && infixProbString.split(/\s*,\s*/g).map(parseFloat),
    $parts: parseInt($parts.value, 10),
    $clampbefore: $clampbefore.value,
    $clampafter: $clampafter.value,
  });
  myWorker.onmessage = function (e) {
    let data = e.data;
    //console.log('main:', data);

    let totalOffsprings = data.totalOffsprings;

    let bestOffspringCode = data.bestOffspringCode;
    let bestOffspringScore = data.bestOffspringScore;
    let lastOffspringCode = data.lastOffspringCode;
    let lastOffspringScore = data.lastOffspringScore;

    let overallBestDna = data.overallBestDna;
    let lastBestDna = data.lastBestDna;
    let lastDna = data.lastDna;

    if (bestOffspringScore > lastOffspringBestScore) {
      lastOffspringBestScore = bestOffspringScore;
      lastOffspringBestCode = bestOffspringCode;

      if (!paused) {
        B.value =
          'Score: ' + bestOffspringScore + ' / ' + targetBucketCount + '\n' +
          '\n' +
          'totalOffsprings: ' + totalOffsprings + '\n' +
          'Code: ' + bestOffspringCode + '\n' +
          'Min:  ' + ujs2(bestOffspringCode) + '\n' +
          '';
      }
    } else if (!paused && bestOffspringScore === lastOffspringBestScore && bestOffspringCode !== lastOffspringBestCode && bestOffspringScore >= (targetBucketCount - appendAfter)) {
      lastOffspringBestCode = bestOffspringCode;

      B.value +=
        '\n\n' +
        'totalOffsprings: ' + totalOffsprings + '\n' +
        'Code: ' + bestOffspringCode + '\n' +
        'Min:  ' + ujs2(bestOffspringCode) + '\n' +
        '';
    }

    if (!paused) {
      $valuep.value = data.lastDna.valueProb;
      $prefixep.value = data.lastDna.prefixProb;
      $infixep.value = data.lastDna.infixProb;
      $valueb.value = data.overallBestDna.valueProb;
      $prefixeb.value = data.overallBestDna.prefixProb;
      $infixeb.value = data.overallBestDna.infixProb;

      A.value =
        'totalOffsprings: ' + totalOffsprings + '\n' +
        'batchSize: ' + data.batchSize + '\n'+
        '\n' +
        'Last: ' + lastOffspringCode + '\n' +
        'Min:  ' + ujs2(lastOffspringCode) + '\n' +
        'Score: ' + lastOffspringScore + ' / ' + targetBucketCount + '\n' +
        '';

      C.innerHTML =
        'Overall best: ' + overallBestDna.bestOffspringScore + ', ' +
        'current best: ' + lastBestDna.bestOffspringScore + ', ' +
        'last clone: ' + lastDna.bestOffspringScore + '\n' +
        'overall best avg: ' + overallBestDna.lastAvgOffspringScore.toPrecision(5) + ' / ' + overallBestDna.bestAvgOffspringScore.toPrecision(5) + ', ' +
        'current best avg: ' + lastBestDna.lastAvgOffspringScore.toPrecision(5) + ' / ' + lastBestDna.bestAvgOffspringScore.toPrecision(5) + ', ' +
        'last clone avg: ' + lastDna.lastAvgOffspringScore.toPrecision(5) + ' / ' + lastDna.bestAvgOffspringScore.toPrecision(5) +
        '';
    }

    if (!paused) {
      D.innerHTML = (getUiString(lastDna, lastBestDna.bestAvgOffspringScore, data.lastOffsprings, data.lastTests) + '\n' + D.innerHTML).slice(0, 10000);
    }
  };
}
function stop() {
  if (myWorker) {
    console.log('stopping');
    myWorker.terminate();
    myWorker = null;
  }
  Array.from(document.querySelectorAll('input')).map(e => [$actualinputstohash, $actualinputlen, $valueb, $prefixeb, $infixeb].indexOf(e) < 0 && (e.disabled = false));
  $clear.disabled = false;
  $rng.disabled = false;
  $toggle.value = 'start from current';
  $spinner.style.opacity = 0;
}
function getUiString(dna, bestScore, lastOffsprings, lastTests) {
  let bs = dna.lastScores.map(function (n, i) {
    return !i ? '' : n >= 100 ? (((n / dna.lastCount) < 0.1 ? ' ' : '') + Math.floor(n / dna.lastCount * 100) + '%') : n === 0 ? ' - ' : ((n < 10 ? ' ' : '') + (n + 'x'));
  }).join(' ');
  return '(' + dna.lastAvgOffspringScore.toPrecision(4) + ' avg / ' + bestScore.toPrecision(4) + ' best) [' + bs + '] ' + dna.batchSize + ' : ' + lastOffsprings + ' : ' + lastTests;
}

$toggle.onclick = function() {
  if (myWorker) {
    stop();
  } else {
    start($valuep.value, $prefixep.value, $infixep.value);
  }
};

$restartlast.onclick = function() {
  stop();
  start($valuep.value, $prefixep.value, $infixep.value);
};

$restartbest.onclick = function() {
  stop();
  start($valueb.value, $prefixeb.value, $infixeb.value);
};

$pause.onclick = function() {
  paused = !paused;
  $pause.value = paused ? 'unpause ui' :  'pause ui';
};

$rng.onclick = function() {
  let len = $values.value.split(/\s*,\s*/g).length;
  $valuep.value = new Array(len).fill(0).map(function() {
    return Math.floor(Math.random() * len);
  });

  len = $prefixes.value.split(/\s*,\s*/g).length;
  $prefixep.value = new Array(len).fill(0).map(function() {
    return Math.floor(Math.random() * len);
  });

  len = $infixes.value.split(/\s*,\s*/g).length;
  $infixep.value = new Array(len).fill(0).map(function() {
    return Math.floor(Math.random() * len);
  });
};

$clear.onclick = function() {
  $valuep.value = '';
  $prefixep.value = '';
  $infixep.value = '';
};

$valuestohash.onkeyup(); // parse hardcoded (default) inputs field
