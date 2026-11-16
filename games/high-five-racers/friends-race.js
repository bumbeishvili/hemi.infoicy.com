// Racing friends in High Five Racers: its words, and what it sends and shows. The rest is shared with Sky
// Wings, in core/friends-ui.js.
//
// Friends race together, as one convoy on the same side, or against each other, as whoever made the race chooses.
// Together, whoever is far in front eases off and whoever is far behind gets a tow (see convoyPace in rules.js),
// the stars everyone catches are added up, and nobody is placed.
import { FriendsPanel, time } from '../../core/friends-ui.js';

const byId = (id) => document.getElementById(id);

export const RACE_WORDS = {
  toggle: 'Race a friend', // The button on the title card.
  make: 'Make a race',
  codeLabel: 'A friend’s race code',
  codeName: 'Race code',
  how: 'Tell your friend the code. Then you both press <b>Let’s race!</b>',
  // Together or against each other, as whoever made the race chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friend the code. Then you both press <b>Let’s race!</b>, and drive round together as one team: your stars add up.',
  teamTitle: 'You raced together!',
  leave: 'Leave this race',
  privacy: 'Only your name, who drives, whether you chose together or against each other, where your car is and how many stars it has go to your friends. The camera picture stays on this computer.',
  alone: 'Race on your own',
  full: 'That race already has 4 cars.',
  lost: 'Can’t reach the race. Check the internet, then try again.',
  left: 'You’ve left the race.',
  badCode: 'A race code is 3 letters and numbers.',
  busy: 'Racing', // Someone in the middle of a race, on the waiting screen.
  still: 'still racing', // Someone who hasn't finished yet, on the finish card.
};

export class FriendsRace extends FriendsPanel {
  /** game is the RaceGame, which this asks to show friends' cars and tells who's gone. */
  constructor(game) {
    const { session } = game;
    super({
      words: RACE_WORDS,
      // laps as well as length, for a race server from before Sky Wings had friends.
      hello: () => ({ driver: session.settings.fighter, level: session.levels.current, length: session.settings.laps, laps: session.settings.laps }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onGone: (friend) => game.friendGone(friend.key),
      // Where a friend's car is goes to its track, and, together, how many stars it has to the team's count.
      onMove: (id, message) => {
        if (message.t === 'score') game.friendStars(id, message.n);
        else this.current?.tracks.get(id)?.push(message, performance.now());
      },
      // A race is told by its time, and a convoy by the stars each brought.
      resultText: ({ ms, dropped }) => (this.current?.team ? `${dropped} ${dropped === 1 ? 'star' : 'stars'}` : time(ms)),
      titles: { first: 'You won the race!', other: 'Great racing!' },
      // With friends, together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (session.settings.raceFriends === 'against' ? 'against' : 'together'),
        set: (choice) => game.chooseTeams(choice),
      },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    this.game = game;
  }

  /** Once the race has been laid out, friends' cars are there to be moved. */
  carsReady(race) {
    for (const friend of this.current?.friends ?? []) this.follow(friend.id, race.friendCars.get(friend.key).track);
  }

  sendCar(car, ms) {
    this.sendMove('car', car, ms);
  }

  /** The child has crossed the line, with this many stars. */
  crossed(ms, stars = 0) {
    this.finished(ms, { w: 1, n: stars });
  }

  /** The finish card, and, racing together, the line under its title that adds up everyone's stars. */
  showResults() {
    super.showResults();
    this.game?.showTeamStars();
  }
}
