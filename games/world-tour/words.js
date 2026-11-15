// What's said in Giraffe's World Tour. Each of these has a rendered voice file, in both languages: see
// audio/voice/lines.json, which tools/make_tour_lines.mjs writes from this and from the flags' names.

/** Giraffe asks where a country is, and says its name when the plane gets there, or when it's chosen by mistake. */
const named = (name) => (name.startsWith('United ') ? `the ${name}` : name);
export const whereIs = (name) => `Where is ${named(name)}?`;
export const thisIs = (name) => `This is ${named(name)}!`;
/** The same in Georgian, from a country's Georgian name. */
export const whereIsKa = (name) => `სად არის ${name}?`;
export const thisIsKa = (name) => `ეს არის ${name}!`;

// What the child is told to do, when they seem to need telling. The Georgian is beside each.
export const SAY = {
  findHint: ['Hold your open hand over the country!', 'გაშლილი ხელი ქვეყანაზე გააჩერე!'],
  openToChoose: ['Open your hand to choose!', 'გაშალე ხელი და აირჩიე!'],
  dipFirst: ['Dip your open hand in a paint pot!', 'გაშლილი ხელი საღებავის ქილაში ჩააწე!'],
  dipHint: ['Dip your hand in that pot!', 'ხელი იმ ქილაში ჩააწე!'],
  openToPaint: ['Open your hand to paint!', 'გაშალე ხელი და ხატე!'],
  holdHint: ['Hold the flag with your other hand!', 'დროშა მეორე ხელით დაიჭირე!'],
  gustHint: ['Here comes the wind! Keep your open hand on the flag!', 'ქარი მოდის! გაშლილი ხელი დროშაზე გეჭიროს!'],
  raiseHint: ['Lift your open hand up high to raise the flag!', 'გაშლილი ხელი მაღლა ასწიე და დროშა აღმართე!'],
  lowHint: ['Reach down low first, then lift!', 'ჯერ ხელი დაბლა ჩამოსწიე, მერე ასწიე!'],
  finish: ['What a journey!', 'რა მოგზაურობა იყო!'],
};

/** Every line the game can say, as { id, text, ka }, with the countries' from their flags. */
export function allLines(flags) {
  const dashed = (key) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const lines = Object.entries(SAY).map(([key, [text, ka]]) => ({ id: `tour-${dashed(key)}`, text, ka }));
  for (const [code, flag] of Object.entries(flags)) {
    const id = code.toLowerCase();
    lines.push({ id: `where-${id}`, text: whereIs(flag.name), ka: whereIsKa(flag.nameKa), giraffe: true });
    lines.push({ id: `this-${id}`, text: thisIs(flag.name), ka: thisIsKa(flag.nameKa), giraffe: true });
  }
  return lines;
}
