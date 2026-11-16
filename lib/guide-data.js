// Content for the Stitch guide.
//
// Names and abbreviations are deliberately absent here: they come from
// lib/terminology.js so the guide, the mapping table and the pattern viewer can
// never drift apart. Step wording is written so it reads correctly in either
// system, and the example line is stored twice, once per system.

export const STITCH_GUIDE = [
  {
    type: "CH",
    kind: "chain",
    height: 0,
    turningChain: 0,
    yarnOvers: 1,
    loops: [
      { stage: "On the hook", count: 1 },
      { stage: "After the yarn over", count: 2 },
      { stage: "After pulling through", count: 1 }
    ],
    description:
      "The foundation stitch. Every pattern starts with chains: they make the first row of fabric, lift the yarn between rows, and open up the spaces a taller stitch works into.",
    steps: [
      "Make a slip knot and place it on the hook. That loop counts as your working loop.",
      "Wrap the yarn over the hook, from back to front.",
      "Pull the hook through the working loop. One loop stays on the hook, and one chain is made.",
      "Repeat the yarn over and pull-through for each chain. Keep them even — a tight chain is hard to work into."
    ],
    example: {
      us: "Ch 21, SC in the second Ch from hook. (20)",
      uk: "Ch 21, DC in the second Ch from hook. (20)"
    },
    tip: "The loop on the hook is never counted. Count the finished chain links instead."
  },
  {
    type: "SLST",
    kind: "join",
    height: 0,
    turningChain: 0,
    yarnOvers: 1,
    loops: [
      { stage: "On the hook", count: 1 },
      { stage: "After inserting and yarn over", count: 2 },
      { stage: "After pulling through everything", count: 1 }
    ],
    description:
      "The shortest stitch, and the one that adds no height. It joins a round, travels along an edge without adding fabric, and closes a picot.",
    steps: [
      "Insert the hook into the next stitch, or into the top of the chain you are joining to.",
      "Yarn over.",
      "Pull the yarn through the stitch and through the loop on the hook in one movement.",
      "One loop remains. Work the next slip stitch into the next stitch."
    ],
    example: {
      us: "SlSt to join, Ch 1, SC around. (40)",
      uk: "SlSt to join, Ch 1, DC around. (40)"
    },
    tip: "A joining slip stitch adds no stitch to the round's total. Count the stitches you made, not the join."
  },
  {
    type: "SC",
    kind: "short",
    height: 1,
    turningChain: 1,
    yarnOvers: 1,
    loops: [
      { stage: "On the hook", count: 1 },
      { stage: "After pulling up a loop", count: 2 },
      { stage: "After closing", count: 1 }
    ],
    description:
      "The firm, compact stitch that most amigurumi and dense fabrics are made of. It is short enough to hold stuffing in and strong enough to keep a shape.",
    steps: [
      "Insert the hook into the next stitch, front to back, under both top loops.",
      "Yarn over and pull up a loop. Two loops are on the hook.",
      "Yarn over again.",
      "Pull through both loops. One loop remains, and one stitch is finished."
    ],
    example: {
      us: "6 SC in MR. (6)",
      uk: "6 DC in MR. (6)"
    },
    tip: "This is the stitch that changes name most often: US single crochet is UK double crochet."
  },
  {
    type: "HDC",
    kind: "short",
    height: 2,
    turningChain: 2,
    yarnOvers: 1,
    loops: [
      { stage: "On the hook", count: 1 },
      { stage: "After pulling up a loop", count: 3 },
      { stage: "After closing all three", count: 1 }
    ],
    description:
      "Halfway between the short and tall stitches: soft, slightly ribbed, and quick. One yarn over at the start gives it height without the extra closing step.",
    steps: [
      "Yarn over before you go in.",
      "Insert the hook into the next stitch, then yarn over and pull up a loop. Three loops are on the hook.",
      "Yarn over once more.",
      "Pull through all three loops in one movement. One loop remains."
    ],
    example: {
      us: "10 HDC in MR. (10)",
      uk: "10 HTr in MR. (10)"
    },
    tip: "Work the last pull-through loosely, or the top of the stitch pulls tight and is hard to find next round."
  },
  {
    type: "DC",
    kind: "tall",
    height: 3,
    turningChain: 3,
    yarnOvers: 2,
    loops: [
      { stage: "On the hook", count: 1 },
      { stage: "After pulling up a loop", count: 3 },
      { stage: "After the first close", count: 2 },
      { stage: "After the second close", count: 1 }
    ],
    description:
      "The workhorse of open, drapey fabric — granny squares, shawls, blankets. It is closed in two passes, which is what makes it taller than a half-height stitch.",
    steps: [
      "Yarn over, then insert the hook into the next stitch.",
      "Yarn over and pull up a loop. Three loops are on the hook.",
      "Yarn over and pull through the first two loops. Two loops remain.",
      "Yarn over and pull through the last two loops. One loop remains."
    ],
    example: {
      us: "1 DC in each of the next 3 STs. (3)",
      uk: "1 Tr in each of the next 3 STs. (3)"
    },
    tip: "The starting chain for a row of these is usually three chains, counted as the first stitch."
  },
  {
    type: "TR",
    kind: "tall",
    height: 4,
    turningChain: 4,
    yarnOvers: 3,
    loops: [
      { stage: "On the hook", count: 1 },
      { stage: "After pulling up a loop", count: 4 },
      { stage: "After the first close", count: 3 },
      { stage: "After the second close", count: 2 },
      { stage: "After the third close", count: 1 }
    ],
    description:
      "A tall, lacy stitch with two yarn overs at the start. It opens fabric quickly and is common in star motifs, edgings and doilies.",
    steps: [
      "Yarn over twice before going in.",
      "Insert the hook into the next stitch, yarn over and pull up a loop. Four loops are on the hook.",
      "Yarn over and pull through two loops. Three remain.",
      "Yarn over and pull through two loops. Two remain.",
      "Yarn over and pull through the last two loops. One remains."
    ],
    example: {
      us: "1 TC in the next ST. (1)",
      uk: "1 DTr in the next ST. (1)"
    },
    tip: "In US patterns this stitch is written TC or TR; in UK patterns it is a double treble. It is never a single crochet."
  },
  {
    type: "DTR",
    kind: "tall",
    height: 5,
    turningChain: 5,
    yarnOvers: 4,
    loops: [
      { stage: "On the hook", count: 1 },
      { stage: "After pulling up a loop", count: 5 },
      { stage: "After each close", count: 4 },
      { stage: "and again", count: 3 },
      { stage: "and again", count: 2 },
      { stage: "At the end", count: 1 }
    ],
    description:
      "The tallest stitch in this guide. Three yarn overs at the start, closed two loops at a time — used for very open lace and long, sweeping edgings.",
    steps: [
      "Yarn over three times.",
      "Insert the hook into the next stitch, yarn over and pull up a loop. Five loops are on the hook.",
      "Yarn over and pull through two loops at a time.",
      "Repeat until one loop remains. The stitch is closed in four passes."
    ],
    example: {
      us: "1 DTR in the next ST, Ch 1, skip 1 ST. (1)",
      uk: "1 TTr in the next ST, Ch 1, skip 1 ST. (1)"
    },
    tip: "Count the loops before you close anything: five loops means a triple-treble height is on the hook."
  }
];

export const TECHNIQUES = [
  {
    id: "magic-ring",
    name: "Magic ring",
    summary: "A closed, adjustable centre for working in the round — no hole in the middle of the circle.",
    steps: [
      "Wrap the yarn twice around two fingers, crossing the working yarn over the tail.",
      "Slide the ring off and hold it between thumb and finger.",
      "Insert the hook into the ring, pull up a loop of working yarn, then chain the number your first stitch needs.",
      "Work the stitches of the first round into the ring, over both strands.",
      "Pull the tail to close the ring, then weave the tail in."
    ],
    tip: "Write it as “6 SC in MR”. The ring is a starting point, not a stitch: it never adds to the round's total."
  },
  {
    id: "increase",
    name: "Increase",
    summary: "Two stitches worked into the same base stitch, so the round grows by one.",
    steps: [
      "Work the first stitch into the next base stitch as usual.",
      "Work a second stitch into that same base stitch.",
      "Count both stitches: the round gains one stitch and uses one base stitch."
    ],
    tip: "“2 SC in the next ST” and “INC” mean the same thing. Keep the pair together — they share one base stitch."
  },
  {
    id: "decrease",
    name: "Decrease",
    summary: "Two stitches closed together into one, so the round loses one.",
    steps: [
      "Insert the hook into the next stitch, yarn over and pull up a loop.",
      "Insert the hook into the following stitch, yarn over and pull up a loop.",
      "Yarn over and pull through every loop on the hook.",
      "One stitch stands where two were."
    ],
    tip: "This leaves a small step. For amigurumi, the invisible decrease hides it."
  },
  {
    id: "invisible-decrease",
    name: "Invisible decrease",
    summary: "A decrease worked through the front loops only, which leaves almost no visible seam.",
    steps: [
      "Insert the hook into the front loop only of the next stitch.",
      "Insert it into the front loop only of the following stitch. Two front loops are on the hook.",
      "Yarn over and pull through both front loops.",
      "Yarn over and pull through the two loops on the hook."
    ],
    tip: "Work it firmly. A loose invisible decrease leaves a gap that shows the stuffing."
  },
  {
    id: "blo",
    name: "Back loop only",
    summary: "Working under the back loop leaves the front loop free, which makes a ridge — the trick behind ribbing and neat rims.",
    steps: [
      "Look at the top of the stitch: two loops sit side by side, one nearer you and one further away.",
      "Insert the hook under the loop further from you only.",
      "Work the stitch as normal, leaving the near loop untouched."
    ],
    tip: "Written as BLO or “in the back loop”. In UK terms it is BLO DC; in US terms BLO SC."
  },
  {
    id: "flo",
    name: "Front loop only",
    summary: "The mirror of back-loop work: the near loop is used and the far loop stays free, giving a soft edge or a place to attach a second layer.",
    steps: [
      "Find the two top loops of the stitch.",
      "Insert the hook under the loop nearest you only.",
      "Work the stitch as normal."
    ],
    tip: "Written as FLO. Useful when a later round works back into the free loops."
  },
  {
    id: "in-the-round",
    name: "Working in the round",
    summary: "A continuous spiral of stitches. Each round is worked into the round below, with no join and no turn.",
    steps: [
      "Start with a magic ring or a short chain joined into a loop.",
      "Work the first round into the centre.",
      "Mark the first stitch of each round with a marker.",
      "Work the next round into the stitches of the one below, spiralling upward.",
      "Stop when the piece reaches the size you want, and fasten off."
    ],
    tip: "A spiral drifts: the start of each round creeps to the right unless you join and chain instead."
  },
  {
    id: "joining-rounds",
    name: "Joining rounds",
    summary: "Closing each round with a slip stitch so every round starts in the same place.",
    steps: [
      "Work the last stitch of the round.",
      "Insert the hook into the top of the first stitch of that round.",
      "Yarn over and pull through both loops: a slip stitch join.",
      "Chain the height your next stitch needs, then begin the new round."
    ],
    tip: "The joining slip stitch and the chain are method, not stitches. A 40-stitch round stays 40."
  },
  {
    id: "turning-chains",
    name: "Turning chains",
    summary: "The chains at the start of a row that lift the yarn to the height of the stitch you are about to work.",
    steps: [
      "At the end of a row, turn the work.",
      "Chain the height of the next stitch: 1 for a short stitch, 2 for a half-height stitch, 3 for a tall stitch, and one more for each extra yarn over.",
      "Work the first stitch into the first stitch of the row, or into the second chain depending on the pattern's convention."
    ],
    tip: "Keep the chain loose. A tight turning chain pulls the whole edge in."
  },
  {
    id: "changing-colour",
    name: "Changing yarn colour",
    summary: "Changing colour on the last pull-through of a stitch, so the new colour finishes the stitch cleanly.",
    steps: [
      "Work the stitch up to its final yarn over, with the old colour still on the hook.",
      "Drop the old yarn, leaving a tail to weave in.",
      "Yarn over with the new colour and pull through the last loops.",
      "Carry on in the new colour, and weave both tails in later."
    ],
    tip: "Change on the stitch before the colour should appear, or the first stitch of the new colour looks half old."
  },
  {
    id: "picot",
    name: "Picot",
    summary: "A tiny decorative bump: a few chains closed back on themselves.",
    steps: [
      "Chain three (or the number the pattern gives).",
      "Slip stitch into the first of those chains, or into the top of the stitch below.",
      "Carry on with the next stitch of the round."
    ],
    tip: "A picot's chains are decoration. They are never counted as stitches in the round."
  },
  {
    id: "granny-clusters",
    name: "Granny clusters",
    summary: "Groups of three tall stitches worked into the same space, with chain gaps between them.",
    steps: [
      "Work three tall stitches into the same chain space or gap.",
      "Chain the number of the gap (usually one or two).",
      "Work the next cluster of three into the next gap.",
      "At the corners, work two clusters separated by a larger chain space."
    ],
    tip: "A cluster shares one space, not one stitch: the stitches of a cluster each count, the chain gap does not."
  },
  {
    id: "chain-spaces",
    name: "Working into chain spaces",
    summary: "Instead of working into a stitch, the hook goes under a chain loop from the round below — how lace and granny patterns open up.",
    steps: [
      "Find the chain space: the gap under a chain loop between two groups of stitches.",
      "Insert the hook under the chain loop, not into a stitch top.",
      "Work the stitches the pattern asks for into that space.",
      "The space takes as many stitches as the pattern says; the chain itself is never a stitch."
    ],
    tip: "“Ch-2 sp” means the space, not the two chains. Work around the chain, not into it."
  },
  {
    id: "fastening-off",
    name: "Fastening off",
    summary: "Securing the last loop so the work cannot unravel.",
    steps: [
      "Cut the yarn, leaving a tail of about 15 cm.",
      "Pull the tail through the last loop and tighten it.",
      "Thread the tail onto a needle and weave it through the back of the work.",
      "Weave in the other direction for a few stitches, then trim."
    ],
    tip: "Weave tails into the wrong side, following the fabric — never knot them, knots work loose."
  }
];
