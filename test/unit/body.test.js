// Reading moves from a body, tested against what the real model reported for real videos.
// test/fixtures/body-moves.json holds those numbers. What happens in each clip was checked by
// eye against its frames, and its "about" says what that is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BodyReader, HandWatcher, closeUpBoxes, viewProblem } from '../../core/body/reader.js';

const clips = JSON.parse(readFileSync(new URL('../fixtures/body-moves.json', import.meta.url)));
const photos = JSON.parse(readFileSync(new URL('../fixtures/photo-hands.json', import.meta.url)));

const toBody = ([, image, world]) => (image
  ? {
      image: image.map((p) => (p ? { x: p[0], y: p[1], z: 0, visibility: p[2] } : { x: 0, y: 0, z: 0, visibility: 0 })),
      world: world.map((p) => (p ? { x: p[0], y: p[1], z: p[2] } : { x: 0, y: 0, z: 0 })),
    }
  : null);

/** Plays a clip through a reader. every skips frames, for a slower computer. */
function play(name, { size = 'medium', every = 1, to = Infinity, reader = new BodyReader({ size }) } = {}) {
  const { frames, aspect } = clips[name];
  const seen = [];
  frames.forEach((frame, index) => {
    if (index % every || frame[0] > to) return;
    for (const move of reader.update(toBody(frame), frame[0], aspect)) seen.push({ ...move, at: frame[0] });
  });
  return { seen, reader };
}

const named = (seen, ...names) => seen.filter(({ move }) => names.includes(move));
const ARM_MOVES = ['palm', 'punch', 'uppercut', 'chop', 'doublePush'];

test('three real strikes are three strikes, at the moments they happened', () => {
  const { seen } = play('strikes');
  const strikes = named(seen, ...ARM_MOVES);
  assert.deepEqual(strikes.map(({ side }) => side), ['left', 'right', 'left'], JSON.stringify(seen));
  for (const [strike, when] of strikes.map((strike, index) => [strike, [1.7, 2.2, 2.6][index]])) {
    assert.ok(Math.abs(strike.at - when) < 0.2, `a strike at ${strike.at}, expected ${when}`);
  }
});

test('standing still is nothing, and so are hands held still, even at the smallest setting', () => {
  for (const size of ['small', 'medium', 'big']) {
    const reader = new BodyReader({ size });
    const { seen } = play('strikes', { reader, to: 0.9 });
    assert.deepEqual(seen, [], `standing, ${size}`);
  }
  const { seen } = play('strikes', { size: 'medium' });
  assert.deepEqual(seen.filter(({ at }) => at > 3 && at < 4.8), [], 'hands held out');
});

test('each jumping jack is one Star Burst, and the arms swinging aren\'t strikes', () => {
  const { seen } = play('starJumps');
  assert.equal(named(seen, 'starBurst').length, 3, JSON.stringify(seen));
  assert.deepEqual(named(seen, ...ARM_MOVES), []);
});

test('seven claps are seven claps, at any setting, even with one hand doing the moving', () => {
  for (const size of ['tiny', 'small', 'medium', 'big']) {
    const { seen } = play('claps', { size });
    const claps = named(seen, 'clap').map(({ at }) => at);
    const when = [2.8, 3.9, 5, 6.1, 8.9, 10.5, 11.9];
    assert.equal(claps.length, when.length, `${size}: ${claps}`);
    claps.forEach((at, index) => assert.ok(Math.abs(at - when[index]) < 0.3, `${size}: a clap at ${at}, expected ${when[index]}`));
  }
});

test('hands near each other, or swinging at the sides, aren\'t claps', () => {
  const { seen } = play('claps', { size: 'tiny' });
  assert.deepEqual(named(seen, 'clap').filter(({ at }) => at > 12.5), []);
  assert.deepEqual(named(seen, 'clap').filter(({ at }) => at < 2.5), [], 'standing still');
});

test('a hand going round is a circle, big or small, on the side that did it', () => {
  for (const size of ['tiny', 'small', 'medium']) {
    const circles = named(play('circles', { size }).seen, 'circle');
    const right = circles.filter(({ side }) => side === 'right');
    const left = circles.filter(({ side }) => side === 'left');
    // Two times round for each hand, and a little less than all the way round is enough for one.
    assert.ok(right.length >= 2 && right.length <= 3, `${size}: ${JSON.stringify(circles)}`);
    assert.ok(left.length >= 2 && left.length <= 3, `${size}: ${JSON.stringify(circles)}`);
    for (const { at } of right) assert.ok(at > 2 && at < 8.2, `${size}: the right hand at ${at}`);
    for (const { at } of left) assert.ok(at > 9.5 && at < 14.8, `${size}: the left hand at ${at}`);
  }
});

test('the tracker jumping for a moment doesn\'t lose a circle, on a computer only managing ten frames a second', () => {
  /** When a circle is first seen, with the wrist thrown well off its path for one frame. */
  const firstCircle = (jumpAt) => {
    const reader = new BodyReader({ size: 'small' });
    const { frames, aspect } = clips.circles;
    let seenAt = null;
    frames.filter((frame, index) => index % 3 === 0 && frame[0] > 1.8 && frame[0] < 8).forEach((frame, index) => {
      const body = toBody(frame);
      if (index === jumpAt) {
        for (const wrist of [15, 16]) {
          body.image[wrist] = { ...body.image[wrist], x: body.image[wrist].x + 0.12, y: body.image[wrist].y + 0.22 };
        }
      }
      for (const { move, side } of reader.update(body, frame[0], aspect)) {
        if (move === 'circle' && side === 'right' && seenAt === null) seenAt = frame[0];
      }
    });
    return seenAt;
  };
  const steady = firstCircle(-1);
  assert.ok(steady !== null);
  // Well on the way, it costs next to nothing, and that's what used to lose the whole circle.
  for (const jumpAt of [15, 17, 19]) {
    const seenAt = firstCircle(jumpAt);
    assert.ok(seenAt !== null && seenAt - steady < 0.5, `a jump at frame ${jumpAt}: ${seenAt}, and ${steady} without one`);
  }
  // Even at the worst moment, or early on, when it starts again, the hand is soon round anyway.
  for (const jumpAt of [4, 8, 12, 21]) assert.ok(firstCircle(jumpAt) < 6, `a jump at frame ${jumpAt}`);
});

test('moving from one place to another isn\'t going round, however quickly', () => {
  const reader = new BodyReader({ size: 'tiny' });
  const { frames, aspect } = clips.circles;
  // Standing with the hand down, then the same clip jumped to where the hand is already high up.
  const seen = [];
  const before = frames.filter((frame) => frame[0] < 1.5);
  const after = frames.filter((frame) => frame[0] > 4 && frame[0] < 5.2);
  [...before, ...after].forEach((frame, index) => {
    for (const { move } of reader.update(toBody(frame), index / 30, aspect)) seen.push(move);
  });
  assert.deepEqual(seen.filter((move) => move === 'circle'), []);
});

test('waving from side to side and going up and down aren\'t circles', () => {
  for (const size of ['tiny', 'small', 'medium', 'big']) {
    const circles = named(play('circles', { size }).seen, 'circle');
    assert.deepEqual(circles.filter(({ at }) => at > 15), [], size);
  }
});

test('standing still is no circle and no clap, however long it goes on', () => {
  const reader = new BodyReader({ size: 'tiny' });
  const still = toBody(clips.strikes.frames[5]);
  const seen = [];
  for (let t = 0; t < 30; t += 1 / 30) {
    const wobble = (value, seed) => value + Math.sin(t * 13 + seed) * 0.002;
    const body = {
      image: still.image.map(({ x, y, visibility }, index) => ({ x: wobble(x, index), y: wobble(y, index * 3), z: 0, visibility })),
      world: still.world,
    };
    seen.push(...reader.update(body, t, clips.strikes.aspect));
  }
  assert.deepEqual(named(seen, 'circle', 'clap'), []);
});

/** The same real clip played more slowly, as a child's careful move would be. */
function slowed(name, times, slowStrikes) {
  const { frames, aspect } = clips[name];
  const reader = new BodyReader({ size: 'small' });
  reader.slowStrikes = slowStrikes;
  const seen = [];
  for (const frame of frames) {
    for (const move of reader.update(toBody(frame), frame[0] * times, aspect)) seen.push(move);
  }
  return seen;
}

test('a slow, careful push is only read when a game is listening for one, and is marked as slow', () => {
  const pushes = (seen) => named(seen, 'palm', 'punch', 'doublePush');
  assert.equal(pushes(slowed('strikes', 8, false)).length, 0, 'eight times slower is too slow to tell from anything else');
  const seen = pushes(slowed('strikes', 8, true));
  assert.ok(seen.every(({ slow }) => slow), JSON.stringify(seen));
  assert.ok(seen.length >= 1, JSON.stringify(seen));
});

test('listening for slow pushes doesn\'t change what a quick strike is', () => {
  const quick = (seen) => seen.filter(({ slow, move }) => !slow && ARM_MOVES.includes(move)).map(({ move, side }) => [move, side]);
  assert.deepEqual(quick(slowed('strikes', 1, true)), quick(slowed('strikes', 1, false)));
  assert.equal(quick(slowed('strikes', 1, true)).length, 3);
});

test('how close the body is to a move goes up as it gets closer', () => {
  const during = (clip, name, side, from, to) => {
    const reader = new BodyReader({ size: 'small' });
    let most = 0;
    for (const frame of clips[clip].frames) {
      reader.update(toBody(frame), frame[0], clips[clip].aspect);
      if (frame[0] >= from && frame[0] <= to) most = Math.max(most, reader.effortFor(name, side));
    }
    return most;
  };
  assert.ok(during('squat', 'squat', 'right', 0.2, 1.2) >= 0.9, 'sinking');
  assert.ok(during('claps', 'clap', 'right', 2.3, 3.2) >= 0.9, 'hands coming together');
  assert.ok(during('circles', 'handCircle', 'right', 3, 4.05) >= 0.5, 'part of the way round');
  assert.ok(during('claps', 'clap', 'right', 0, 1.5) < 0.3, 'hands at the sides are nowhere near a clap');
  assert.equal(new BodyReader().effortFor('not a move'), 0);
});

test('a burpee is a reach to the floor and then a jump, three times over', () => {
  const { seen } = play('burpees');
  assert.equal(named(seen, 'sweep').length, 3, JSON.stringify(seen));
  assert.equal(named(seen, 'flying').length, 3, JSON.stringify(seen));
  const order = named(seen, 'sweep', 'flying').map(({ move }) => move);
  assert.deepEqual(order, ['sweep', 'flying', 'sweep', 'flying', 'sweep', 'flying']);
});

test('a squat is counted once, on the way down, and earns its exercise', () => {
  const { seen } = play('squat');
  const squats = named(seen, 'stomp');
  assert.equal(squats.length, 1, JSON.stringify(seen));
  assert.equal(squats[0].exercise, 'squat');
  assert.ok(squats[0].at < 1.6, `it should fire on the way down, not at ${squats[0].at}`);
});

test('everything is still found on a slower computer, at half the frames', () => {
  assert.equal(named(play('starJumps', { every: 2 }).seen, 'starBurst').length, 3);
  assert.equal(named(play('strikes', { every: 2 }).seen, ...ARM_MOVES).length, 3);
  assert.equal(named(play('squat', { every: 2 }).seen, 'stomp').length, 1);
  const burpees = play('burpees', { every: 2 }).seen;
  assert.equal(named(burpees, 'flying').length, 3);
});

test('a smaller setting never finds fewer moves, and a bigger one never finds more', () => {
  const count = (size) => play('strikes', { size }).seen.length;
  assert.ok(count('small') >= count('medium'), `${count('small')} and ${count('medium')}`);
  assert.ok(count('medium') >= count('big'), `${count('medium')} and ${count('big')}`);
});

/** A real standing body, changed to make some particular point. */
function standing(change = () => {}) {
  const body = toBody(clips.strikes.frames[10]);
  change(body);
  return body;
}

const moved = (body, dx, dy = 0) => {
  for (const point of body.image) {
    point.x += dx;
    point.y += dy;
  }
};
const scaled = (body, by) => {
  for (const point of body.image) {
    point.x = 0.5 + (point.x - 0.5) * by;
    point.y = 0.5 + (point.y - 0.5) * by;
  }
};
const aspect = clips.strikes.aspect;

test('reaching up stays different from a star jump at every setting', () => {
  const nose = standing().image[0];
  const hipWidth = Math.abs(standing().image[11].x - standing().image[12].x);
  const armsUp = (body, gap) => {
    body.image[15] = { ...body.image[15], x: body.image[11].x + gap, y: nose.y - 0.14 };
    body.image[16] = { ...body.image[16], x: body.image[12].x - gap, y: nose.y - 0.14 };
    body.image[19] = { ...body.image[19], y: nose.y - 0.16 };
    body.image[20] = { ...body.image[20], y: nose.y - 0.16 };
  };
  for (const size of ['tiny', 'small', 'medium']) {
    const reader = new BodyReader({ size });
    perform(reader, 0.6, () => {});
    const reach = perform(reader, 1, (body) => armsUp(body, hipWidth * 0.5), 0.6);
    assert.equal(reach.filter(({ move }) => move === 'skyCharge').length, 1, `${size}: ${JSON.stringify(reach)}`);
    assert.equal(reach.filter(({ move }) => move === 'starBurst').length, 0, size);
    perform(reader, 0.5, () => {}, 1.6);
    const star = perform(reader, 1, (body) => {
      armsUp(body, hipWidth * 0.5);
      body.image[27] = { ...body.image[27], x: body.image[23].x + hipWidth * 1.1 };
      body.image[28] = { ...body.image[28], x: body.image[24].x - hipWidth * 1.1 };
    }, 2.1);
    assert.equal(star.filter(({ move }) => move === 'starBurst').length, 1, `${size}: ${JSON.stringify(star)}`);
  }
});

test('standing up out of a squat isn\'t a jump, as the feet stay down', () => {
  for (const size of ['small', 'medium', 'big']) assert.deepEqual(named(play('squat', { size }).seen, 'flying'), [], size);
});

/** A real body lifting by this much, both feet by these shares of it, over a third of a second. */
function hopped(reader, amount, leftShare, rightShare, start = 0.6) {
  return perform(reader, 0.4, (body, share) => {
    const up = amount * Math.sin(Math.min(1, share * 1.6) * Math.PI / 2);
    for (const index of [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26]) body.image[index].y -= up;
    for (const index of [27, 29, 31]) body.image[index].y -= up * leftShare;
    for (const index of [28, 30, 32]) body.image[index].y -= up * rightShare;
  }, start);
}

test('a jump counts even if an affected leg doesn\'t lift as much as the other', () => {
  const even = new BodyReader();
  perform(even, 0.6, () => {});
  assert.equal(named(hopped(even, 0.05, 1, 1), 'flying').length, 1, 'both feet');
  const lopsided = new BodyReader();
  perform(lopsided, 0.6, () => {});
  assert.equal(named(hopped(lopsided, 0.05, 1, 0.5), 'flying').length, 1, 'one foot only half as much');
});

test('one foot high with the other down is a kick and not a jump', () => {
  const reader = new BodyReader();
  perform(reader, 0.6, () => {});
  const moves = perform(reader, 0.4, (body, share) => {
    for (const index of [27, 29, 31]) body.image[index].y -= 0.2 * Math.min(1, share * 2);
  }, 0.6);
  assert.deepEqual(named(moves, 'flying'), []);
  assert.ok(named(moves, 'kick', 'knee').length >= 1, JSON.stringify(moves));
});

test('a small hop only counts once what counts has come down for this child', () => {
  const small = () => {
    const reader = new BodyReader();
    perform(reader, 0.6, () => {});
    return reader;
  };
  assert.deepEqual(named(hopped(small(), 0.012, 1, 1), 'flying'), [], 'too small in general');
  const reader = small();
  reader.personal.jump = 0.04;
  assert.equal(named(hopped(reader, 0.012, 1, 1), 'flying').length, 1);
});

test('the meter shows where the body is, in this child\'s own terms', () => {
  const { reader } = play('squat', { to: 2.2 });
  assert.ok(reader.meter <= -1, `deep in a squat: ${reader.meter}`);
  const still = play('strikes', { to: 0.9 }).reader;
  assert.ok(Math.abs(still.meter) < 0.3, `standing still: ${still.meter}`);

  const shallow = new BodyReader();
  perform(shallow, 0.6, () => {});
  perform(shallow, 0.5, (body) => {
    for (const index of [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24]) body.image[index].y += 0.01;
  }, 0.6);
  const before = shallow.meter;
  shallow.personal.squat = 0.03;
  assert.ok(shallow.meter < before, 'the same sink reads as further down once less is asked of this child');
});

test('a child standing in full view is what the check wants', () => {
  assert.equal(viewProblem(standing(), aspect), null);
});

test('the check says what\'s wrong with the view, in terms a child can act on', () => {
  assert.equal(viewProblem(null, aspect), 'no-body');
  assert.equal(viewProblem(standing((body) => scaled(body, 2.4)), aspect), 'step-back', 'too close');
  assert.equal(viewProblem(standing((body) => moved(body, 0, 0.27)), aspect), 'step-back', 'feet cut off');
  assert.equal(viewProblem(standing((body) => scaled(body, 0.4)), aspect), 'come-closer', 'too far');
  // The picture isn't mirrored, so a child towards the camera's right is on the left of the mirror.
  assert.equal(viewProblem(standing((body) => moved(body, 0.45)), aspect), 'move-right');
  assert.equal(viewProblem(standing((body) => moved(body, -0.33)), aspect), 'move-left');
  assert.equal(viewProblem(standing((body) => {
    body.image[27].visibility = 0.1;
    body.image[28].visibility = 0.1;
  }), aspect), 'show-all', 'feet hidden');
});

test('several playing with their top halves only have to be clear of the picture\'s edges, where one sits in the middle', () => {
  const onlyTop = { upperBodyOnly: true };
  const together = { upperBodyOnly: true, group: true };
  // Someone with the middle of their shoulders so far across the screen, from 0 at its left to 1 at its right.
  const at = (across, dy = 0) => standing((body) => {
    const middle = (body.image[11].x + body.image[12].x) / 2;
    moved(body, 1 - across - middle, dy);
  });
  assert.equal(viewProblem(at(0.5), aspect, onlyTop), null);
  assert.equal(viewProblem(at(0.5), aspect, together), null);
  // An eighth of the way in from either side, where the outer two of four are: too far over for one child.
  assert.equal(viewProblem(at(0.125), aspect, onlyTop), 'move-right');
  assert.equal(viewProblem(at(0.875), aspect, onlyTop), 'move-left');
  assert.equal(viewProblem(at(0.125), aspect, together), null);
  assert.equal(viewProblem(at(0.875), aspect, together), null);
  // Right at the edge, an arm would be out of the picture, whoever it is.
  assert.equal(viewProblem(at(0.06), aspect, together), 'move-right');
  assert.equal(viewProblem(at(0.94), aspect, together), 'move-left');
  // And each still needs room above the head, and to be near enough.
  assert.equal(viewProblem(at(0.3, -0.1), aspect, together), 'step-back');
  assert.equal(viewProblem(standing((body) => scaled(body, 0.4)), aspect, together), 'come-closer');
});

test('a close-up of each hand covers the wrist and stays inside the picture', () => {
  const body = standing();
  const boxes = closeUpBoxes(body, aspect);
  assert.deepEqual(boxes.map(({ side }) => side), ['left', 'right']);
  for (const box of boxes) {
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1 && box.y + box.height <= 1);
    const wrist = body.image[box.side === 'left' ? 15 : 16];
    assert.ok(wrist.x > box.x && wrist.x < box.x + box.width, 'wrist across');
    assert.ok(wrist.y > box.y && wrist.y < box.y + box.height, 'wrist down');
    assert.ok(Math.abs(box.width * aspect - box.height) < 1e-9, 'square in the real picture');
  }
  const off = standing((body2) => {
    body2.image[15].x = 0.001;
    body2.image[15].y = 0.001;
  });
  const [box] = closeUpBoxes(off, aspect);
  assert.ok(box.x >= 0 && box.y >= 0, 'a hand at the edge still gives a box inside the picture');
});

const realHand = (name, index = 0) => ({ side: 'right', found: true, world: photos[name].hands[index].world });

test('a hand reads as open only after agreeing twice, and never from a fist', () => {
  const watcher = new HandWatcher();
  watcher.add(realHand('left_hands'), 1);
  assert.equal(watcher.stateOf('right', 1), null, 'one lucky frame isn\'t enough');
  watcher.add(realHand('left_hands'), 1.05);
  assert.equal(watcher.stateOf('right', 1.05), 'open');

  for (const pose of ['fist', 'pointing_up', 'victory', 'thumb_up']) {
    const closed = new HandWatcher();
    closed.add(realHand(pose), 1);
    closed.add(realHand(pose), 1.05);
    assert.equal(closed.stateOf('right', 1.05), 'closed', pose);
  }
});

test('an open reading goes stale, and losing the hand means not knowing', () => {
  const watcher = new HandWatcher();
  watcher.add(realHand('left_hands'), 1);
  watcher.add(realHand('left_hands'), 1.05);
  assert.equal(watcher.stateOf('right', 1.3), 'open');
  assert.equal(watcher.stateOf('right', 2), null, 'too long ago to count');
  watcher.add({ side: 'right', found: false }, 2.1);
  watcher.add(realHand('left_hands'), 2.15);
  assert.equal(watcher.stateOf('right', 2.15), null, 'the count starts again after losing it');
  assert.equal(watcher.stateOf('left', 2.15), null, 'and the other hand was never seen');
});

test('a strike takes the hand\'s state: open makes a palm strike, closed a punch', () => {
  const strikeWith = (name) => {
    const reader = new BodyReader();
    // Keeps the watcher fresh all the way through the clip.
    const { frames, aspect: clipAspect } = clips.strikes;
    const seen = [];
    for (const frame of frames) {
      if (name) {
        reader.hands.add({ ...realHand(name), side: 'left' }, frame[0]);
        reader.hands.add({ ...realHand(name), side: 'right' }, frame[0]);
      }
      seen.push(...reader.update(toBody(frame), frame[0], clipAspect));
    }
    return seen;
  };
  const open = strikeWith('left_hands').filter(({ move }) => ARM_MOVES.includes(move));
  assert.ok(open.length >= 3);
  assert.ok(open.every(({ hand }) => hand === 'open'), JSON.stringify(open));
  assert.ok(open.every(({ move }) => move !== 'punch'));
  const fist = strikeWith('fist').filter(({ move }) => ARM_MOVES.includes(move));
  assert.ok(fist.some(({ move }) => move === 'punch'), JSON.stringify(fist));
  assert.ok(fist.every(({ hand }) => hand === 'closed'));
  const unknown = strikeWith(null).filter(({ move }) => ARM_MOVES.includes(move));
  assert.ok(unknown.every(({ hand }) => hand === null), 'a hand that can\'t be read isn\'t called open');
  assert.ok(unknown.every(({ move }) => move !== 'punch'), 'nor is it called a fist');
});

/** A few seconds of a body made to do something, built from a real standing frame. */
function perform(reader, seconds, change, start = 0) {
  const moves = [];
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i += 1) {
    const t = start + i / 30;
    const body = standing((b) => change(b, i / steps, t));
    moves.push(...reader.update(body, t, aspect).map((move) => ({ ...move, at: t })));
  }
  return moves;
}

const lift = (body, ankle, knee, amount) => {
  body.image[ankle].y -= amount;
  body.image[knee].y -= amount * 0.7;
  for (const index of [ankle + 2, ankle + 4]) body.image[index].y -= amount;
};

test('alternate knees, fast, are high knees', () => {
  const reader = new BodyReader();
  perform(reader, 1, () => {});
  const lifted = perform(reader, 2.2, (body, _share, t) => {
    const beat = Math.floor(t * 3);
    const up = Math.sin((t * 3 - beat) * Math.PI);
    if (up <= 0) return;
    if (beat % 2) lift(body, 27, 25, up * 0.18);
    else lift(body, 28, 26, up * 0.18);
  }, 1);
  assert.equal(lifted.filter(({ move }) => move === 'turbo').length, 2, JSON.stringify(lifted));
  assert.equal(lifted.find(({ move }) => move === 'turbo').exercise, 'highKnees');
  assert.ok(lifted.some(({ move, side }) => (move === 'kick' || move === 'knee') && side === 'left'));
  assert.ok(lifted.some(({ move, side }) => (move === 'kick' || move === 'knee') && side === 'right'));
});

test('one leg lifted again and again isn\'t high knees', () => {
  const reader = new BodyReader();
  perform(reader, 1, () => {});
  const lifted = perform(reader, 3, (body, _share, t) => {
    const up = Math.sin(t * 6);
    if (up > 0) lift(body, 27, 25, up * 0.18);
  }, 1);
  assert.equal(lifted.some(({ move }) => move === 'turbo'), false);
  assert.ok(lifted.filter(({ move }) => move === 'kick' || move === 'knee').length >= 2);
});

test('hands up by the face are a guard, and a guard ends as soon as they drop', () => {
  const reader = new BodyReader();
  perform(reader, 0.6, () => {});
  assert.equal(reader.guard, false);
  const nose = standing().image[0];
  const guarding = (body) => {
    body.image[15] = { ...body.image[15], x: nose.x + 0.02, y: nose.y + 0.04 };
    body.image[16] = { ...body.image[16], x: nose.x - 0.02, y: nose.y + 0.04 };
    body.image[13] = { ...body.image[13], x: body.image[11].x + 0.01, y: body.image[11].y + 0.12 };
    body.image[14] = { ...body.image[14], x: body.image[12].x - 0.01, y: body.image[12].y + 0.12 };
    body.world[15] = { ...body.world[15], x: 0.03, y: -0.5, z: -0.25 };
    body.world[16] = { ...body.world[16], x: -0.03, y: -0.5, z: -0.25 };
    body.world[13] = { ...body.world[13], x: 0.2, y: -0.25, z: -0.1 };
    body.world[14] = { ...body.world[14], x: -0.2, y: -0.25, z: -0.1 };
  };
  perform(reader, 0.4, guarding, 0.6);
  assert.equal(reader.guard, true);
  perform(reader, 0.1, () => {}, 1);
  assert.equal(reader.guard, false);
});

test('leaning over to one side gets out of the way, and it knows which side', () => {
  const lean = (dx) => {
    const reader = new BodyReader();
    perform(reader, 0.6, () => {});
    perform(reader, 0.4, (body) => {
      for (const index of [0, 11, 12, 13, 14, 15, 16, 19, 20]) body.image[index].x += dx;
    }, 0.6);
    return reader.dodge;
  };
  assert.ok(lean(-0.06) >= 0.5, 'towards the camera\'s left is the right of the mirror');
  assert.ok(lean(0.06) <= -0.5);
  assert.ok(Math.abs(lean(0.005)) < 0.5, 'a small sway isn\'t a dodge');
});

test('arms reaching up and held there are one Sky Charge, until they come down', () => {
  const reader = new BodyReader();
  perform(reader, 0.6, () => {});
  const nose = standing().image[0];
  const reach = (body) => {
    for (const index of [15, 16, 19, 20]) body.image[index] = { ...body.image[index], y: nose.y - 0.14 };
  };
  const up = perform(reader, 1.5, reach, 0.6);
  assert.equal(up.filter(({ move }) => move === 'skyCharge').length, 1, JSON.stringify(up));
  perform(reader, 0.5, () => {}, 2.1);
  const again = perform(reader, 0.8, reach, 2.6);
  assert.equal(again.filter(({ move }) => move === 'skyCharge').length, 1, 'and again next time');
});

test('a hand held up counts until it has come back down, and each side is its own', () => {
  const reader = new BodyReader();
  perform(reader, 0.5, () => {});
  assert.deepEqual(reader.handsUp, { left: false, right: false });
  const nose = standing().image[0];
  const raise = (index) => (body) => {
    body.image[index] = { ...body.image[index], y: nose.y - 0.1 };
  };
  perform(reader, 0.3, raise(16), 0.5);
  assert.deepEqual(reader.handsUp, { left: false, right: true }, 'the tracker\'s right hand');
  perform(reader, 0.3, (body) => {
    body.image[16] = { ...body.image[16], y: body.image[12].y - 0.05 };
  }, 0.8);
  assert.equal(reader.handsUp.right, true, 'partly down still counts as up');
  perform(reader, 0.3, () => {}, 1.1);
  assert.equal(reader.handsUp.right, false);
});

test('a child playing sitting down only needs their top half seen', () => {
  const feetGone = (body) => {
    for (const index of [23, 24, 25, 26, 27, 28, 29, 30, 31, 32]) body.image[index].visibility = 0.05;
  };
  const onlyTop = { upperBodyOnly: true };
  assert.equal(viewProblem(standing(feetGone), aspect), 'show-all', 'not enough for the whole-body games');
  assert.equal(viewProblem(standing(feetGone), aspect, onlyTop), null);
  assert.equal(viewProblem(null, aspect, onlyTop), 'no-body');
  assert.equal(viewProblem(standing((body) => {
    feetGone(body);
    moved(body, 0, -0.1);
  }), aspect, onlyTop), 'step-back', 'no room above the head for a raised hand');
  assert.equal(viewProblem(standing((body) => {
    feetGone(body);
    scaled(body, 0.4);
  }), aspect, onlyTop), 'come-closer', 'too far away to read a hand');

  // With hips hidden, as they might be at a table, it can still follow the arms.
  const reader = new BodyReader();
  reader.upperBodyOnly = true;
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(reader.update(standing(feetGone), i / 30, aspect), []);
  }
  assert.equal(reader.seen, true);
  const strict = new BodyReader();
  for (let i = 0; i < 20; i += 1) strict.update(standing((body) => {
    feetGone(body);
  }), i / 30, aspect);
  assert.equal(strict.seen, false, 'and the whole-body games still insist on seeing the hips');
});

test('nobody in the picture means no moves, and nothing carries over when they come back', () => {
  const { reader } = play('starJumps');
  assert.deepEqual(reader.update(null, 10, aspect), []);
  assert.deepEqual(reader.update(null, 11, aspect), []);
  assert.equal(reader.seen, false);
  assert.equal(reader.guard, false);
  assert.equal(reader.history.length, 0);
  assert.deepEqual(reader.update(standing(), 11.1, aspect), []);
});

test('body points that can\'t be trusted don\'t make moves or break anything', () => {
  const reader = new BodyReader();
  perform(reader, 0.5, () => {});
  const moves = perform(reader, 0.5, (body) => {
    for (const point of [...body.image, ...body.world]) point.x = NaN;
  }, 0.5);
  assert.deepEqual(moves, []);
  const hidden = perform(reader, 0.5, (body) => {
    for (const point of body.image) point.visibility = 0.1;
  }, 1);
  assert.deepEqual(hidden, []);
  assert.deepEqual(perform(reader, 0.5, () => {}, 1.5), []);
});

test('the fighter copies the body: arms, sinking and jumping all come through', () => {
  const finite = (pose) => Object.values(pose).every(Number.isFinite);

  const squat = play('squat', { to: 2.2 }).reader;
  assert.ok(squat.pose.hipDrop > 0.15, `hips sank by ${squat.pose.hipDrop}`);
  assert.ok(finite(squat.pose));

  const standingReader = play('strikes', { to: 0.9 }).reader;
  assert.ok(standingReader.pose.hipDrop < 0.1, 'and they don\'t when standing');
  assert.ok(standingReader.pose.handLY < -0.5, 'arms hang down');
  assert.ok(standingReader.pose.handRY < -0.5);
  assert.ok(standingReader.pose.handLX > standingReader.pose.handRX, 'the left hand on the left');
  assert.ok(finite(standingReader.pose));

  const jacks = play('starJumps', { to: 0.6 }).reader;
  assert.ok(jacks.pose.handLY > 0, `arms up in a jumping jack: ${jacks.pose.handLY}`);
  assert.ok(jacks.pose.handRY > 0);
});
