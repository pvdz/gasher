# The Gasher

A hasher built on a fuzzer implemented as a genetic algorithm. You can use it to generate an expression which maps the values to a perfect minimal hash.

# Demo

You can find a live demo at https://gasher.github.io/qfox/web.html

# UI

Most things in the UI have a `title`, hinted with a `help` cursor when you hover over it.

At the top you see a spinner. It's not super relevant anymore but before the gasher was running on the main thread and the spinner would show you when the thread was busy. Now everything runs in a webworker so the spinner should pretty much always spin.

The top input is for entering some expression that returns the list of input values. These are the values to hash. You can enter a regular array or some JS that returns an array. This code is evaluated as is. By default the number of elements of this array is the target number of unique outcomes to find. You can override that below.

The next section are values, prefixes, infixes, and their weights. The fuzzer puts these together as regular JS expressions. So it starts with a value. It may prefix a prefix string to that, like turning `5` into `~5`. Then this composition gets an infix (operator with two operands) and another value is generated. From there on out that infix and value step is appended for so many times. Somewhere along the line at least one `x` is enforced (because that's the point) and the result will be something like `(((((((((7*9) |0)|x)^9) |0)*7) |0)) >>> 0) % 33`. Super ugly, of course, and I've added an ulgifyjs step to try and reduce the formula statically (but only for displaying), in this last example it would end up as `((7*(9^(63|x)|0)|0)>>>0)%33`. When we actually look at it we can reduce that further, of course, because we know the inputs but it doesn't hurt to have it anyways. The uglify step only runs in the UI end so not in the actual Gasher part of the code.

Next are weight constraints; can they all, some, or none be zero? This tries to combat bias as described above.

With bounds you can make the fuzzer wrap each step in code that boxes the result to 32bit signed or unsigned (or none at all). In some environments you may not have or want signed numbers.

There are a few ways to clamp the outputs to buckets ranges for the result. For example, if the target has 33 unique values we'll be looking for a table that maps the numbers `0 through 32` to the original input values. That means the output for the generated codes should result in a number below `33`. There are various ways to clamp that and you can choose how to, or add your own method. You can also have Gasher try all of them, which means there'll be fewer trials per DNA because they'll use all varaitions of clamping.

Lastly you can pick the cap of how many particles are added to the generated code. This is a cap and it will actually use a uniformly distributed random number of particles up to this number. You can override the number of buckets to target. Let's say for my example I wanted to try and find a table of `34` elements then I'd have to put that here. And the "append" controls the output field. By default it will replace the output if it found an equal or better score and only once it reached the goal it will append the results because you may be interested in more than one result. The "append" field allows you to set the appending behavior sooner, by default one below the target.

The buttons; "restart from last" will stop the Gasher and start a new one using the "current" weights. "restart from best" will also restart but use the "best" weights (the ones you can't edit). "pause ui" stops the ui from updating but the webworker still does its thing. "randomize" will fill the "current" inputs with random weight values so you can (re)start with random values. "stop" (and "start") should be quite self evident ;)

The Gasher will track the overall best score, the current best score, and the last score. Overall means the best DNA ever seen which is different from the current best score because it allows it's "best" dna to regress a little to try and move away from [local plateaus](https://en.wikipedia.org/wiki/Local_search_(constraint_satisfaction)). The top two lines in the output represent the code score (the integers) and the DNA score (the floats). The list shows you only the last checked DNA score, even though it will continously check the best DNA alongside with a new DNA. 

Code is throw together quickly. Beware.
