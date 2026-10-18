// The life of one redeal effect, apart from three.js so it can be tested in Node:
// start, step by step, end (normally, cut short, on a fault, or by the watchdog).
// Whatever ends it, the cards are snapped to their true poses and `busy(false)` is
// told, so the page never stays shut to commands.
//
//   createFxRun({ busy(on), write(sim), snap(), done(), report(text), now, later })
//   run.start(sim)            begin; busy(true)
//   run.step(dt) -> boolean   advance; false once it is over (or faulted)
//   run.end({ fault })        stop now: snap, busy(false), done()
//   run.watch()               the watchdog: ends the run if it outstays its time
//   run.active()

export const FX_MS = 3000; // the longest effect (tests hold each under 3 s)
export const FX_GRACE_MS = 3000; // and what a slow or hidden page may add

export function createFxRun({ busy, write, snap, done, report = console.error, now = () => performance.now(), later = (f, ms) => setTimeout(f, ms) }) {
  let cur = null;

  function end({ fault = false } = {}) {
    if (!cur) return;
    const { sim } = cur;
    cur = null;
    try {
      // Only a finished run has slots to be off: a run cut short is not an error.
      if (!fault && sim.done()) {
        const err = sim.finish();
        if (err > 1e-3 || !Number.isFinite(err)) report(`redeal animation ended ${err} cm from its slots`);
      }
    } catch (e) {
      report(e);
    }
    try {
      snap();
    } catch (e) {
      report(e);
    } finally {
      busy(false);
      done?.();
    }
  }

  function watch() {
    if (cur && now() - cur.began > FX_MS + FX_GRACE_MS) end();
  }

  return {
    start(sim) {
      const began = now();
      cur = { sim, began };
      busy(true);
      // A hidden tab runs no frames: a timer (slowed, not stopped) is the backstop.
      later(() => {
        if (cur && cur.began === began) watch();
      }, FX_MS + FX_GRACE_MS + 50);
    },
    step(dt) {
      if (!cur) return false;
      watch();
      if (!cur) return false;
      try {
        cur.sim.step(dt);
        if (cur.sim.done()) {
          end();
          return false;
        }
        if (!cur.sim.valid()) {
          report("redeal animation went out of bounds");
          end({ fault: true });
          return false;
        }
        write(cur.sim);
      } catch (e) {
        report(e);
        end({ fault: true });
        return false;
      }
      return true;
    },
    end,
    watch,
    active: () => cur !== null,
  };
}
