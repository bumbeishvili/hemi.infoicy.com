// "How many are playing?": the row of numbers on the card of a game that several can play in front of one
// camera, on one screen. It always starts at one: someone else in the picture isn't taken for a player unless
// a grown-up says so. The whole-body games tell people apart by where they stand (core/body/people.js), and the
// hand games by where their hands are (core/hand-group.js).

/** The row's markup, for so many at the most. Its look is in core/base.css. */
export const groupChoice = (most) => `
      <fieldset class="group-choice">
        <legend>How many are playing?</legend>
        ${Array.from({ length: most }, (_, index) => `<label><input type="radio" name="group-size" value="${index + 1}"${index ? '' : ' checked'}> <span>${index + 1}</span></label>`).join('')}
      </fieldset>`;

/** Shows how many are playing in the row, and tells onChoose each time someone chooses another number. */
export function watchGroupChoice(players, onChoose) {
  for (const input of document.querySelectorAll('input[name="group-size"]')) {
    input.checked = Number(input.value) === players;
    input.addEventListener('change', () => {
      if (input.checked) onChoose(Number(input.value));
    });
  }
}

/** The row shows this many, as when a game has put it back to one. */
export function showGroupChoice(players) {
  for (const input of document.querySelectorAll('input[name="group-size"]')) input.checked = Number(input.value) === players;
}
